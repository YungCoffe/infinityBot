'use strict';
// Simulação apenas em memória: não altera presença e não envia telemetria.
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const games = require('./simulacao-jogos.json');
const sessions = new Map();
const command = new SlashCommandBuilder().setName('simulacao').setDescription('Simula jogos localmente, sem enviar atividade ao Discord.')
  .addSubcommand(s => s.setName('iniciar').setDescription('Inicia a simulação local.')
    .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade de jogos, de 1 a 500.').setRequired(true).setMinValue(1).setMaxValue(500))
    .addIntegerOption(o => o.setName('duracao').setDescription('Duração total em minutos, de 1 a 10080.').setRequired(true).setMinValue(1).setMaxValue(10080))
    .addIntegerOption(o => o.setName('intervalo').setDescription('Minutos por jogo, padrão 2.').setMinValue(1).setMaxValue(1440)))
  .addSubcommand(s => s.setName('status').setDescription('Consulta a simulação local.'))
  .addSubcommand(s => s.setName('parar').setDescription('Encerra a simulação local.'));
function stop(id) { const s = sessions.get(id); if (!s) return false; clearInterval(s.timer); sessions.delete(id); return true; }
function snapshot(s, now = Date.now()) { const elapsed = Math.max(0, now - s.start); const index = Math.floor(elapsed / s.interval) % s.games.length; return { game: s.games[index], index, count: s.games.length, elapsed, expired: elapsed >= s.duration, pulses: Math.floor(elapsed / 15000) }; }
async function handle(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'simulacao') return;
  const id = interaction.user.id; const action = interaction.options.getSubcommand();
  if (action === 'parar') return interaction.reply({ content: stop(id) ? 'Simulação local encerrada.' : 'Nenhuma simulação ativa.', flags: MessageFlags.Ephemeral });
  if (action === 'status') {
    const s = sessions.get(id); if (!s) return interaction.reply({ content: 'Nenhuma simulação ativa.', flags: MessageFlags.Ephemeral });
    const x = snapshot(s); if (x.expired) { stop(id); return interaction.reply({content:'Simulação local concluída.', flags:MessageFlags.Ephemeral}); }
    return interaction.reply({content: `Simulação local: ${x.game.name} (${x.index + 1}/${x.count})\nID Discord: ${x.game.id || 'não confirmado'}\nSinais simulados em memória: ${x.pulses}\nNão envia atividade, presença ou horas ao Discord.`, flags: MessageFlags.Ephemeral});
  }
  if (sessions.size >= 100 && !sessions.has(id)) return interaction.reply({content:'Limite de simulações atingido; tente mais tarde.', flags:MessageFlags.Ephemeral});
  const quantity=interaction.options.getInteger('quantidade', true), duration=interaction.options.getInteger('duracao', true), interval=interaction.options.getInteger('intervalo') ?? 2;
  stop(id);
  const s = { games: games.slice(0,quantity), start: Date.now(), duration: duration*60000, interval: interval*60000, timer: null };
  s.timer = setInterval(() => { if (snapshot(s).expired) stop(id); }, 15000); s.timer.unref?.(); sessions.set(id,s);
  return interaction.reply({content:`Simulação local iniciada: ${quantity} jogo(s), ${duration} min no total, troca a cada ${interval} min. Use /simulacao status ou /simulacao parar. Não envia sinais nem altera presença no Discord.`,flags:MessageFlags.Ephemeral});
}
module.exports = { command, handle, snapshot, stop };
