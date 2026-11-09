'use strict';

const { UsernameCheckError, checkUsername } = require('./username-check');

const OPEN_BUTTON_ID = 'names:open';
const SUBMIT_MODAL_ID = 'names:submit';
const LENGTH_FIELD_ID = 'names:length';
const USERNAME_FIELD_ID = 'names:username';

function usernameModalSpec() {
  return {
    customId: SUBMIT_MODAL_ID,
    title: 'Consultar @ do Discord',
    fields: [
      { customId: LENGTH_FIELD_ID, label: 'Tamanho (2 a 32)', placeholder: 'Ex.: 8', minLength: 1, maxLength: 2 },
      { customId: USERNAME_FIELD_ID, label: 'Username sem @', placeholder: 'Ex.: nome.legal', minLength: 2, maxLength: 32 }
    ]
  };
}

// Carrega discord.js apenas na hora de abrir o modal; mantém as validações testáveis offline.
function buildUsernameModal() {
  const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  const spec = usernameModalSpec();
  const fields = spec.fields.map((field) => new TextInputBuilder()
    .setCustomId(field.customId).setLabel(field.label).setPlaceholder(field.placeholder)
    .setStyle(TextInputStyle.Short).setRequired(true).setMinLength(field.minLength).setMaxLength(field.maxLength));
  return new ModalBuilder().setCustomId(spec.customId).setTitle(spec.title)
    .addComponents(...fields.map((field) => new ActionRowBuilder().addComponents(field)));
}

function usernameErrorMessage(error) {
  if (!(error instanceof UsernameCheckError)) return 'Não foi possível consultar este nome agora. Tente novamente em instantes.';
  if (['INVALID_LENGTH', 'INVALID_USERNAME', 'LENGTH_MISMATCH'].includes(error.code)) return error.message;
  if (error.code === 'RATE_LIMITED') return 'A consulta foi limitada temporariamente. Aguarde e tente novamente.';
  if (error.code === 'TIMEOUT') return 'A consulta excedeu o tempo limite. Tente novamente depois.';
  return 'Não foi possível consultar a disponibilidade agora. Tente novamente em instantes.';
}

function formatUsernameResult({ username, taken }) {
  const status = taken ? 'parece estar em uso' : 'parece estar disponível';
  return `**Resultado indicativo:** \`@${username}\` ${status}.\n\n` +
    'Isso não confirma posse, reserva, cadastro ou disponibilidade final. A consulta é privada e o bot não grava o nome.';
}

async function handleUsernameInteraction(interaction, { check = checkUsername, buildModal = buildUsernameModal } = {}) {
  if (interaction.isButton() && interaction.customId === OPEN_BUTTON_ID) {
    await interaction.showModal(buildModal());
    return true;
  }
  if (!(interaction.isModalSubmit() && interaction.customId === SUBMIT_MODAL_ID)) return false;

  const expectedLength = interaction.fields.getTextInputValue(LENGTH_FIELD_ID);
  const username = interaction.fields.getTextInputValue(USERNAME_FIELD_ID);
  await interaction.deferReply({ ephemeral: true });
  try {
    const result = await check(username, { expectedLength });
    await interaction.editReply({ content: formatUsernameResult(result) });
  } catch (error) {
    await interaction.editReply({ content: usernameErrorMessage(error) });
  }
  return true;
}

module.exports = {
  OPEN_BUTTON_ID, SUBMIT_MODAL_ID, LENGTH_FIELD_ID, USERNAME_FIELD_ID,
  usernameModalSpec, buildUsernameModal, usernameErrorMessage, formatUsernameResult, handleUsernameInteraction
};
