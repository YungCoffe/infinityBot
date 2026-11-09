'use strict';

const { checkUsername, UsernameCheckError } = require('./username-check');
const { UsernameBatchChecker, MAX_ATTEMPTS_PER_REQUEST, INTERACTION_DEADLINE_MS } = require('./username-batch');
const { countdownView, isLongWait, startRateLimitCountdown } = require('./rate-limit-countdown');
const { createLiveProgress } = require('./live-progress');

const OPEN_BUTTON_ID = 'names:open';
const SUBMIT_MODAL_ID = 'names:submit';
const LENGTH_FIELD_ID = 'names:length';
const QUANTITY_FIELD_ID = 'names:quantity';
const USERNAME_FIELD_ID = 'names:username';
const defaultBatchChecker = new UsernameBatchChecker({ check: checkUsername });

function usernameModalSpec() {
  return { customId: SUBMIT_MODAL_ID, title: 'Encontrar @ disponíveis', fields: [
    { customId: LENGTH_FIELD_ID, label: 'Tamanho do nick (2 a 32)', placeholder: 'Ex.: 8', minLength: 1, maxLength: 2, required: true },
    { customId: QUANTITY_FIELD_ID, label: 'Nicks disponíveis desejados (1 a 5)', placeholder: 'Ex.: 3', minLength: 1, maxLength: 1, required: true },
    { customId: USERNAME_FIELD_ID, label: '@ opcional para testar primeiro', placeholder: 'Ex.: @nomelegal (deixe vazio para aleatórios)', minLength: 0, maxLength: 33, required: false }
  ] };
}
function buildUsernameModal() {
  const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  const spec = usernameModalSpec();
  const fields = spec.fields.map(field => new TextInputBuilder().setCustomId(field.customId).setLabel(field.label).setPlaceholder(field.placeholder).setStyle(TextInputStyle.Short).setRequired(field.required).setMinLength(field.minLength).setMaxLength(field.maxLength));
  return new ModalBuilder().setCustomId(spec.customId).setTitle(spec.title).addComponents(...fields.map(field => new ActionRowBuilder().addComponents(field)));
}
function usernameErrorMessage(error) {
  if (!(error instanceof UsernameCheckError)) return 'Não foi possível consultar agora. Nenhum nick foi tratado como disponível.';
  if (['INVALID_LENGTH', 'INVALID_QUANTITY', 'INVALID_USERNAME', 'LENGTH_MISMATCH'].includes(error.code)) return error.message;
  if (error.code === 'TIMEOUT') return 'A consulta excedeu o tempo limite. Esse nick não foi verificado.';
  return 'Não foi possível consultar agora. Nenhum nick foi tratado como disponível.';
}
function formatUsernameBatchResult(batch, { nowMs = Date.now(), countdownContent } = {}) {
  const target = batch.targetQuantity ?? '?'; const attempted = batch.attemptedCount ?? batch.results.length;
  const lines = [`**Resultado indicativo — ${batch.availableCount ?? 0} de ${target} nick(s) aparentemente disponível(is); ${attempted} tentativa(s), ${batch.checkedCount} resposta(s) válida(s):**`];
  for (const result of batch.results) {
    if (result.status === 'available') lines.push(`• \`@${result.username}\` — aparentemente disponível`);
    else if (result.status === 'taken') lines.push(`• \`@${result.username}\` — parece estar em uso`);
    else lines.push(`• \`@${result.username}\` — falha (${result.code}); não verificado`);
  }
  if (batch.queueFull) lines.push('\nA fila global está cheia para preservar o prazo da interação do Discord. Tente novamente em instantes; nenhum nick foi verificado.');
  else if (batch.rateLimited) {
    const retryAtMs = Number.isFinite(batch.rateLimited.retryAtMs) ? batch.rateLimited.retryAtMs : nowMs + batch.rateLimited.waitMs;
    const view = countdownView({ retryAtMs, startedAtMs: nowMs, nowMs });
    lines.push(`\n${countdownContent || view.content}`);
    if (isLongWait(retryAtMs - nowMs)) lines.push('Espera longa: para não depender da validade desta interação, a mensagem mantém o horário relativo, mas não ficará sendo editada.');
    lines.push('A consulta foi interrompida; resultados pendentes não são disponibilidade. Quando o prazo passar, uma nova tentativa ainda pode receber outro 429.');
  } else if (batch.stoppedError) lines.push(`\nInterrompido por erro (${batch.stoppedError}). Faltam nicks; tente novamente. Nenhum resultado sem resposta válida é disponibilidade.`);
  else if (batch.timedOut) lines.push(`\nPrazo seguro de 12 minutos da interação atingido. A busca foi interrompida e retorna resultado parcial; não houve novas consultas após o prazo.`);
  else if (batch.exhausted) lines.push(`\nForam atingidas ${MAX_ATTEMPTS_PER_REQUEST} tentativas antes da meta. Foram encontrados ${batch.availableCount} de ${target}; tente novamente para procurar outros.`);
  else if ((batch.availableCount ?? 0) < target) lines.push(`\nForam encontrados ${batch.availableCount ?? 0} de ${target}; tente novamente para procurar outros.`);
  lines.push('\n“Aparentemente disponível” só significa resposta válida com `taken: false`; pode mudar. O bot não altera nem reserva nicks. A rota não oficial pode falhar, não usa token de usuário, não contorna limites/CAPTCHA e não envia novos lotes automaticamente.');
  return lines.join('\n');
}

async function handleUsernameInteraction(interaction, { batchChecker = defaultBatchChecker, buildModal = buildUsernameModal, now = () => Date.now(), startCountdown = startRateLimitCountdown, createProgress = createLiveProgress } = {}) {
  if (interaction.isButton() && interaction.customId === OPEN_BUTTON_ID) { await interaction.showModal(buildModal()); return true; }
  if (!(interaction.isModalSubmit() && interaction.customId === SUBMIT_MODAL_ID)) return false;
  const length = interaction.fields.getTextInputValue(LENGTH_FIELD_ID); const quantity = interaction.fields.getTextInputValue(QUANTITY_FIELD_ID); const optionalUsername = interaction.fields.getTextInputValue(USERNAME_FIELD_ID);
  await interaction.deferReply({ ephemeral: true });
  const progress = createProgress({ edit: value => interaction.editReply(value), now, onError: error => console.warn('Não foi possível atualizar andamento:', error?.code || error?.name || 'Error') });
  // O timestamp vem da criação da interação, antes da fila, para não ultrapassar a janela de resposta do Discord.
  const createdAtMs = Number.isFinite(interaction.createdTimestamp) ? interaction.createdTimestamp : now();
  const deadlineAtMs = createdAtMs + INTERACTION_DEADLINE_MS;
  try {
    const batch = await batchChecker.run({ length, quantity, optionalUsername, deadlineAtMs, onProgress: event => progress.update(event) });
    const nowMs = now(); const finalContent = formatUsernameBatchResult(batch, { nowMs });
    // finish serializa o resultado depois de qualquer edição de andamento já iniciada.
    await progress.finish(finalContent);
    if (batch.rateLimited) {
      const retryAtMs = Number.isFinite(batch.rateLimited.retryAtMs) ? batch.rateLimited.retryAtMs : nowMs + batch.rateLimited.waitMs;
      startCountdown({ retryAtMs, now, edit: value => interaction.editReply({ content: formatUsernameBatchResult(batch, { nowMs: now(), countdownContent: value.content }) }), onError: error => console.warn('Não foi possível atualizar contador 429:', error?.code || error?.name || 'Error') });
    }
  } catch (error) { await progress.finish(usernameErrorMessage(error)); }
  return true;
}
module.exports = { OPEN_BUTTON_ID, SUBMIT_MODAL_ID, LENGTH_FIELD_ID, QUANTITY_FIELD_ID, USERNAME_FIELD_ID, usernameModalSpec, buildUsernameModal, usernameErrorMessage, formatUsernameBatchResult, handleUsernameInteraction };
