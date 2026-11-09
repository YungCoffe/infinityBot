'use strict';

function canManagePhrases(memberPermissions, permissionFlags) {
  return Boolean(memberPermissions?.has?.(permissionFlags.Administrator) || memberPermissions?.has?.(permissionFlags.ManageGuild));
}

function sendReplyText(status) {
  if (status === 'posted') return 'Frase enviada agora neste canal.';
  if (status === 'posted-original') return 'Frase enviada agora neste canal no original em inglês (tradutores automáticos indisponíveis).';
  const reason = {
    'source-cooldown': 'a fonte está temporariamente indisponível',
    'rate-limited': 'a fonte limitou temporariamente as consultas',
    'no-suitable-source': 'não foi encontrada uma frase adequada na fonte',
    'history-incomplete': 'não foi possível verificar o histórico com segurança',
    'missing-permissions': 'faltam permissões do bot neste canal',
    error: 'ocorreu um erro ao enviar'
  }[status] || 'a causa não foi identificada';
  return `A frase não foi enviada porque ${reason}.`;
}

function createPhrasesInteractionHandler({ client, getManager, permissionFlags, messageFlags, configurationFailurePrefix = 'A configuração foi salva, mas a postagem inicial não foi feita', scheduleNote = 'O agendamento nas horas cheias continua ativo.', configurationSaveFailure = 'Não configurado: não foi possível salvar e fixar a configuração; nenhuma frase foi publicada.', log = console }) {
  return async interaction => {
    const commandStartedAt = Date.now(); let requestedSubcommand = null;
    try {
      if (!interaction.isChatInputCommand?.() || interaction.commandName !== 'frases') return;
      if (!canManagePhrases(interaction.memberPermissions, permissionFlags)) {
        await interaction.reply({ content: 'Apenas membros com Administrador ou Gerenciar servidor podem usar /frases.', ephemeral: true });
        return;
      }
      // Defer imediatamente: consulta de frase, tradução e capa podem exceder 3 segundos.
      await interaction.deferReply({ flags: messageFlags.Ephemeral });
      const manager = getManager();
      const sub = interaction.options.getSubcommand(); requestedSubcommand = sub;
      if (sub === 'enviar') {
        const startedAt = Date.now();
        log.info?.(`Frases comando=enviar canal=${interaction.channel?.id || 'unknown'} status=attempt`);
        const out = await manager.sendNow(interaction.channel);
        log.info?.(`Frases comando=enviar canal=${interaction.channel?.id || 'unknown'} status=${out.status} duracao_ms=${Math.max(0, Date.now() - startedAt)}`);
        await interaction.editReply({ content: sendReplyText(out.status) });
        return;
      }
      if (sub === 'configurar') {
        const channel = interaction.options.getChannel('canal', true);
        const out = await manager.configure(channel);
        if (out.status === 'configured') {
          const initial = out.initial?.status === 'posted' ? 'A frase inicial foi publicada agora.' : out.initial?.status === 'posted-original' ? 'A frase inicial foi publicada agora no original em inglês (tradutores automáticos indisponíveis).' : `${configurationFailurePrefix} porque ${sendReplyText(out.initial?.status).replace('A frase não foi enviada porque ', '').replace(/\.$/, '')}. ${scheduleNote}`;
          await interaction.editReply({ content: `Frases ativadas em ${channel}. ${initial}` });
          return;
        }
        if (out.status === 'missing-permissions') {
          await interaction.editReply({ content: `Não configurado. Permissões exigidas: ${out.required.join(', ')}.` });
          return;
        }
        await interaction.editReply({ content: configurationSaveFailure });
        return;
      }
      if (sub === 'parar') {
        const out = await manager.stop(interaction.channel);
        await interaction.editReply({ content: out.removed ? 'Frases paradas; o pin de configuração foi removido. O histórico foi preservado.' : 'Não havia configuração fixada neste canal.' });
        return;
      }
      const ids = manager.status();
      const mine = ids.filter(id => client.channels.cache.get(id)?.guildId === interaction.guildId);
      await interaction.editReply({ content: mine.length ? `Canais ativos: ${mine.map(id => `<#${id}>`).join(', ')}.` : 'Nenhum canal ativo neste servidor.' });
    } catch (error) {
      if (requestedSubcommand === 'enviar') log.info?.(`Frases comando=enviar canal=${interaction.channel?.id || 'unknown'} status=error duracao_ms=${Math.max(0, Date.now() - commandStartedAt)}`);
      log.error?.('Erro ao processar /frases:', error.code || error.name || 'Error');
      const message = { content: 'Não foi possível concluir o comando de frases.', ephemeral: true };
      if (interaction.deferred) await interaction.editReply(message);
      else if (interaction.replied) await interaction.followUp(message);
      else await interaction.reply(message);
    }
  };
}

module.exports = { canManagePhrases, sendReplyText, createPhrasesInteractionHandler };
