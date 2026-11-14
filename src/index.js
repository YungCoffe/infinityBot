'use strict';
const { Client, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits, REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');
const { createHealthServer, getPort } = require('./http-server');
const { startSelfPing } = require('./self-ping');
const { createHourlyQuoteManager } = require('./hourly-quotes');
const { createPhrasesInteractionHandler } = require('./frases-interaction');
const { generateQuoteArtwork } = require('./quote-artwork');
const simulation = require('./simulacao');

const token = process.env.DISCORD_TOKEN;
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let hourlyTimer;
let quoteManager;
const phrasesCommand = new SlashCommandBuilder().setName('frases').setDescription('Configura frases horárias de anime.').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(s => s.setName('configurar').setDescription('Ativa em um canal de texto.').addChannelOption(o => o.setName('canal').setDescription('Canal de texto para as frases.').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(s => s.setName('enviar').setDescription('Envia uma frase agora neste canal, sem alterar a agenda.'))
  .addSubcommand(s => s.setName('parar').setDescription('Para as frases neste canal e remove a configuração fixada.'))
  .addSubcommand(s => s.setName('status').setDescription('Mostra os canais configurados neste servidor.'));
async function registerCommands(applicationId) { const rest = new REST({ version: '10' }).setToken(token); const guildId = process.env.DISCORD_GUILD_ID; const route = guildId ? Routes.applicationGuildCommands(applicationId, guildId) : Routes.applicationCommands(applicationId); await rest.put(route, { body: [phrasesCommand.toJSON(), simulation.command.toJSON()] }); console.log(`Comando /frases registrado em ${guildId ? 'servidor de testes' : 'escopo global'}.`); }
function startHourlyQuoteSchedule() { quoteManager = createHourlyQuoteManager({ client, artwork: generateQuoteArtwork }); void quoteManager.restore().then(n => { console.log(`Frases: ${n} canal(is) restaurado(s) de pins.`); void quoteManager.tick(); }); hourlyTimer = setInterval(() => void quoteManager.tick(), 60_000); hourlyTimer.unref?.(); console.log('Frases horárias verificadas uma vez por minuto (America/Sao_Paulo).'); return quoteManager; }
client.once(Events.ClientReady, async readyClient => { console.log(`Bot de frases conectado como ${readyClient.user.tag}.`); try { await registerCommands(readyClient.user.id); } catch (error) { console.error('Não foi possível registrar /frases:', error.message); } startHourlyQuoteSchedule(); });
const handlePhrasesInteraction = createPhrasesInteractionHandler({ client, getManager: () => quoteManager, permissionFlags: PermissionFlagsBits, messageFlags: MessageFlags, configurationFailurePrefix: 'A configuração foi salva, mas a postagem inicial não foi feita', scheduleNote: 'O agendamento nas horas cheias continua ativo.', configurationSaveFailure: 'Não configurado: não foi possível salvar e fixar a configuração; nenhuma frase foi publicada.' });
client.on(Events.InteractionCreate, interaction => { if (interaction.isChatInputCommand() && interaction.commandName === 'simulacao') { void simulation.handle(interaction).catch(error => console.error('Erro na simulação:', error.message)); return; } void handlePhrasesInteraction(interaction); });
const port = getPort(process.env.PORT); const server = createHealthServer(() => client.isReady()); server.on('error', error => { console.error('Falha no servidor HTTP:', error.message); process.exit(1); }); server.listen(port, '0.0.0.0', () => { console.log(`Servidor HTTP ativo em 0.0.0.0:${port}.`); startSelfPing(process.env.RENDER_EXTERNAL_URL); if (!token) { console.warn('DISCORD_TOKEN não configurado; Discord permanece offline. Consulte o README.'); return; } client.login(token).catch(error => { console.error('Falha ao conectar ao Discord:', error.message); client.destroy(); }); });
module.exports = { phrasesCommand, registerCommands, startHourlyQuoteSchedule, handlePhrasesInteraction };
