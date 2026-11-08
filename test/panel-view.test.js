'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPanelComponents } = require('../src/panel-view');

test('painel V2 inclui imagem original e quatro botões funcionais', () => {
  const [container] = buildPanelComponents();
  assert.equal(container.type, 17);
  const gallery = container.components.find(c => c.type === 12);
  assert.equal(gallery.items[0].media.url, 'attachment://banner-natal.jpg');
  const text = container.components.filter(c => c.type === 10).map(c => c.content).join('\n');
  for (const label of ['Pessoas', 'CPF', 'Spotify', 'Cartões']) assert.ok(text.includes(label));
  assert.ok(text.includes('Cartões fictícios, sem valor.'));
  const row = container.components.find(c => c.type === 1);
  assert.deepEqual(row.components.map(button => button.custom_id), ['panel:people', 'panel:cpf', 'panel:spotify', 'panel:cards']);
  assert.ok(row.components.every(button => button.type === 2));
  const data = fs.readFileSync(path.join(__dirname, '..', 'assets', 'banner-natal.jpg'));
  assert.equal(data[0], 0xff);
  assert.equal(data[1], 0xd8);
});
