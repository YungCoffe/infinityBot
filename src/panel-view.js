'use strict';

// Raw Discord API Components V2. IDs dos quatro botões originais permanecem inalterados.
function buildPanelComponents() {
  return [{
    type: 17,
    accent_color: 0xA61526,
    components: [
      { type: 12, items: [{ media: { url: 'attachment://banner-natalino.jpg' }, description: 'Banner de Natal do InfinityTools' }] },
      { type: 10, content: [
        '# 🎄 Infinity Tools | Painel',
        '✨ **Bem-vindo ao painel de Natal!**',
        'Escolha uma das opções abaixo para começar.',
        '',
        '🎅 **Pessoas** · perfis fictícios',
        '❄️ **CPF** · gerador fictício',
        '🎁 **Spotify** · links para o site',
        '🎄 **Cartões** · Cartões fictícios, sem valor.',
        '🔎 **Consultar @** · verificação privada e indicativa de username',
        '',
        '🔒 As respostas são privadas. Links Spotify não garantem promoções.'
      ].join('\n') },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [
        { type: 2, custom_id: 'panel:people', label: 'Pessoas fictícias', emoji: { name: '🎅' }, style: 4 },
        { type: 2, custom_id: 'panel:cpf', label: 'CPF fictício', emoji: { name: '❄️' }, style: 3 },
        { type: 2, custom_id: 'panel:spotify', label: 'Links Spotify', emoji: { name: '🎁' }, style: 4 },
        { type: 2, custom_id: 'panel:cards', label: 'Cartões fictícios', emoji: { name: '🎄' }, style: 3 },
        { type: 2, custom_id: 'names:open', label: 'Consultar @', emoji: { name: '🔎' }, style: 3 }
      ] },
      { type: 10, content: '-# 🎁 InfinityTools • Boas festas!' }
    ]
  }];
}

module.exports = { buildPanelComponents };
