'use strict';

const {
  Client, Events, GatewayIntentBits, MessageFlags,
  PermissionFlagsBits, REST, Routes, SlashCommandBuilder
} = require('discord.js');
const { createHealthServer, getPort } = require('./http-server');
const { startSelfPing } = require('./self-ping');
const { buildPanelComponents } = require('./panel-view');
const { OPEN_BUTTON_ID, SUBMIT_MODAL_ID, handleUsernameInteraction } = require('./name-lookup');
const path = require('node:path');

// Apenas token de BOT, lido do ambiente. O projeto nunca pede, usa ou salva
// token/senha de conta pessoal e nunca altera usernames.
const token = process.env.DISCORD_TOKEN;
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const cooldowns = new Map();
// Evita reenvios repetidos do mesmo usuário antes de entrarem na fila global.
const COOLDOWN_MS = 30_000;

const panelCommand = new SlashCommandBuilder()
  .setName('painel')
  .setDescription('Publica o painel de consulta indicativa de nicks.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

function isCoolingDown(userId) {
  const now = Date.now();
  const expiresAt = cooldowns.get(userId) || 0;
  if (expiresAt > now) return Math.ceil((expiresAt - now) / 1000);
  cooldowns.set(userId, now + COOLDOWN_MS);
  return 0;
}

async function registerCommands(applicationId) {
  const rest = new REST({ version: '10' }).setToken(token);
  const guildId = process.env.DISCORD_GUILD_ID;
  const route = guildId ? Routes.applicationGuildCommands(applicationId, guildId) : Routes.applicationCommands(applicationId);
  await rest.post(route, { body: panelCommand.toJSON() });
  console.log(`Comando /painel registrado em ${guildId ? 'servidor de testes' : 'escopo global'}.`);
}

function safeInteractionError() {
  return 'Não foi possível concluir a consulta. Nenhum nick foi tratado como disponível.';
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot de nicks conectado como ${readyClient.user.tag}.`);
  try { await registerCommands(readyClient.user.id); } catch (error) { console.error('Não foi possível registrar /painel:', error.message); }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Apenas administradores podem publicar o painel.', ephemeral: true });
        return;
      }
      await interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        files: [{ attachment: path.join(__dirname, '..', 'assets', 'banner-natalino.jpg'), name: 'banner-natalino.jpg' }],
        components: buildPanelComponents()
      });
      return;
    }

    if ((interaction.isButton() && interaction.customId === OPEN_BUTTON_ID) ||
        (interaction.isModalSubmit() && interaction.customId === SUBMIT_MODAL_ID)) {
      if (interaction.isModalSubmit()) {
        const wait = isCoolingDown(interaction.user.id);
        if (wait) {
          await interaction.reply({ content: `Aguarde ${wait}s antes de consultar novamente.`, ephemeral: true });
          return;
        }
      }
      await handleUsernameInteraction(interaction);
    }
  } catch (error) {
    console.error('Erro ao processar interação:', error.code || error.name || 'Error');
    const message = { content: safeInteractionError(), ephemeral: true };
    if (interaction.deferred) await interaction.editReply(message);
    else if (interaction.replied) await interaction.followUp(message);
    else await interaction.reply(message);
  }
});

const port = getPort(process.env.PORT);
const server = createHealthServer(() => client.isReady());
server.on('error', (error) => {
  console.error('Falha no servidor HTTP:', error.message);
  process.exit(1);
});
server.listen(port, '0.0.0.0', () => {
  console.log(`Servidor HTTP ativo em 0.0.0.0:${port}.`);
  startSelfPing(process.env.RENDER_EXTERNAL_URL);
  if (!token) {
    console.warn('DISCORD_TOKEN não configurado; Discord permanece offline. Consulte o README.');
    return;
  }
  client.login(token).catch((error) => {
    console.error('Falha ao conectar ao Discord:', error.message);
    client.destroy();
  });
});
