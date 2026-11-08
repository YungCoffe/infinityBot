'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, Events, GatewayIntentBits,
  PermissionFlagsBits, REST, Routes, SlashCommandBuilder, StringSelectMenuBuilder
} = require('discord.js');
const { SAFE_QUANTITIES, assertSafeQuantity, makeSpotifyLinks, formatPerson } = require('./utils');
const { FourDevsError, generateCpf, generatePerson, generateCard } = require('./fourdevs');

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN não foi configurado. Consulte o README.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const cooldowns = new Map();
const COOLDOWN_MS = 15_000;

const panelCommand = new SlashCommandBuilder()
  .setName('painel')
  .setDescription('Publica o painel persistente do InfinityBot.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

function panelRows() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel:people').setLabel('Pessoas fictícias').setEmoji('🎅').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel:cpf').setLabel('CPF fictício').setEmoji('❄️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel:spotify').setLabel('Links Spotify').setEmoji('🎁').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel:cards').setLabel('Cartões fictícios').setEmoji('🎄').setStyle(ButtonStyle.Success)
  )];
}

function quantityRow() {
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('quantity:spotify').setPlaceholder('Escolha uma quantidade segura')
      .addOptions(SAFE_QUANTITIES.map((quantity) => ({
        label: `${quantity} item${quantity > 1 ? 's' : ''}`, value: String(quantity), description: 'Limite seguro por resposta'
      })))
  )];
}

function isCoolingDown(userId) {
  const now = Date.now();
  const expiresAt = cooldowns.get(userId) || 0;
  if (expiresAt > now) return Math.ceil((expiresAt - now) / 1000);
  cooldowns.set(userId, now + COOLDOWN_MS);
  return 0;
}

function buildPanelEmbed() {
  return {
    color: 0xC62828,
    title: '🎄 InfinityBot • Especial de Natal',
    description: [
      '✨ Bem-vindo ao painel de Natal do InfinityTools!',
      'Escolha uma opção abaixo. As respostas são privadas (efêmeras).',
      'Pessoas, CPFs e cartões são dados fictícios de gerador; não os use como dados reais.',
      'Cartões fictícios, sem valor.',
      'Os dados só são exibidos nesta resposta e não são gravados pelo bot.',
      'Links Spotify são locais e não oferecem promoção.'
    ].join('\n'),
    footer: { text: '🎁 InfinityTools • Boas festas!' }
  };
}

async function registerCommands(applicationId) {
  const rest = new REST({ version: '10' }).setToken(token);
  const guildId = process.env.DISCORD_GUILD_ID;
  const route = guildId ? Routes.applicationGuildCommands(applicationId, guildId) : Routes.applicationCommands(applicationId);
  // POST cria /painel sem substituir a coleção de outros slash commands.
  await rest.post(route, { body: panelCommand.toJSON() });
  console.log(`Comando /painel registrado em ${guildId ? 'servidor de testes' : 'escopo global'}.`);
}

function upstreamErrorMessage(error) {
  if (error instanceof FourDevsError && error.code === 'RATE_LIMITED') return 'O 4Devs está limitando solicitações (HTTP 429). Aguarde e tente novamente.';
  if (error instanceof FourDevsError && error.code === 'TIMEOUT') return 'O 4Devs demorou demais para responder. Tente novamente depois.';
  return 'Não foi possível obter o dado fictício agora. Tente novamente em instantes.';
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`InfinityBot conectado como ${readyClient.user.tag}.`);
  try { await registerCommands(readyClient.user.id); } catch (error) { console.error('Não foi possível registrar /painel:', error.message); }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Apenas administradores podem publicar o painel.', ephemeral: true });
        return;
      }
      await interaction.reply({ embeds: [buildPanelEmbed()], components: panelRows() });
      return;
    }

    if (interaction.isButton()) {
      const kind = interaction.customId.replace('panel:', '');
      if (!['people', 'cpf', 'spotify', 'cards'].includes(kind)) return;
      const wait = isCoolingDown(interaction.user.id);
      if (wait) { await interaction.reply({ content: `Aguarde ${wait}s antes de usar o painel novamente.`, ephemeral: true }); return; }
      if (kind === 'spotify') {
        await interaction.reply({ content: 'Escolha a quantidade. Máximo de 5 links por resposta.', components: quantityRow(), ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      if (kind === 'cpf') {
        const cpf = await generateCpf();
        await interaction.editReply({ content: `**CPF fictício (4Devs):** \`${cpf}\`\nUso efêmero; o bot não grava este dado.` });
      } else if (kind === 'people') {
        const person = await generatePerson();
        await interaction.editReply({ content: `**Pessoa fictícia (4Devs)**\n${formatPerson(person)}\n\nUso efêmero; o bot não grava estes dados.` });
      } else {
        const card = await generateCard();
        await interaction.editReply({ content: `Cartões fictícios, sem valor.\n\n**Bandeira solicitada:** Mastercard\n**Número:** \`${card.number}\`\n**Validade:** ${card.expiry}\n**Código de segurança:** ${card.cvv}\n\nUso efêmero; o bot não grava estes dados.` });
      }
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'quantity:spotify') {
      const quantity = assertSafeQuantity(interaction.values[0]);
      const links = makeSpotifyLinks(quantity);
      await interaction.update({ content: `**Links para o site do Spotify** — gerados localmente, sem API e sem promoção.\n\n${links.join('\n')}`, components: [] });
    }
  } catch (error) {
    console.error('Erro ao processar interação:', error.code || error.name || 'Error');
    const message = { content: upstreamErrorMessage(error), ephemeral: true };
    if (interaction.deferred) await interaction.editReply(message);
    else if (interaction.replied) await interaction.followUp(message);
    else await interaction.reply(message);
  }
});

client.login(token).catch((error) => {
  console.error('Falha ao conectar ao Discord:', error.message);
  process.exitCode = 1;
});
