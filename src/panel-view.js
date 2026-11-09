'use strict';

// Componentes V2 em formato raw para preservar o painel natalino.
function buildPanelComponents() {
  return [{
    type: 17,
    accent_color: 0xA61526,
    components: [
      { type: 12, items: [{ media: { url: 'attachment://banner-natalino.jpg' }, description: 'Banner de Natal do painel de nicks' }] },
      { type: 10, content: [
        '# 🎄 Painel de Nicks',
        '✨ **Consulta privada e indicativa de usernames Discord**',
        '',
        'Escolha o tamanho (2–32) e a meta de nicks aparentemente disponíveis (1–5).',
        'Você também pode informar um `@` para testar; com meta 1, somente ele é consultado.',
        '',
        '🔎 O resultado não reserva, não altera e não garante um nome.',
        '-# Há até 25 tentativas por pedido, intervalo de 2 s e respeito a limites de taxa.'
      ].join('\n') },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [
        { type: 2, custom_id: 'names:open', label: 'Encontrar @', emoji: { name: '🔎' }, style: 3 }
      ] },
      { type: 10, content: '-# 🎁 Consulta sem login pessoal • Boas festas!' }
    ]
  }];
}

module.exports = { buildPanelComponents };
