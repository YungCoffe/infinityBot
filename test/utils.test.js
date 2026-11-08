'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertSafeQuantity, makeSpotifyLinks, formatPerson } = require('../src/utils');
const { FourDevsError, generateCpf, generatePerson, generateCard, parseCardHtml } = require('../src/fourdevs');

const zeroRandom = () => 0;
function mockFetch(status, text) {
  return async () => new Response(text, { status, headers: { 'content-type': 'text/plain' } });
}

test('aceita somente quantidades seguras', () => {
  assert.equal(assertSafeQuantity('1'), 1);
  assert.equal(assertSafeQuantity(3), 3);
  assert.throws(() => assertSafeQuantity(2), /limite seguro/);
});

test('links Spotify são locais e mantêm o link do site', () => {
  const links = makeSpotifyLinks(1, zeroRandom);
  assert.match(links[0], /^https:\/\/www\.spotify\.com\/br-pt\/premium\/\?utm_source=br-pt_brand_contextual_text&utm_medium=a+$/);
});

test('CPF envia os parâmetros públicos esperados', async () => {
  let request;
  const fetchImpl = async (_url, options) => {
    request = options;
    return new Response('CPF_DE_MOCK', { status: 200 });
  };
  assert.equal(await generateCpf({ fetchImpl }), 'CPF_DE_MOCK');
  assert.equal(request.method, 'POST');
  assert.equal(request.body, 'acao=gerar_cpf&pontuacao=S&cpf_estado=');
});

test('pessoa faz uma única requisição e interpreta JSON', async () => {
  let calls = 0;
  const person = await generatePerson({ fetchImpl: async (_url, options) => {
    calls += 1;
    assert.equal(options.body, 'acao=gerar_pessoa&sexo=I&pontuacao=S&idade=&cep_estado=&cep_cidade=&txt_qtde=1');
    return new Response('[{"nome":"NOME_MOCK","idade":30,"cpf":"CPF_MOCK"}]', { status: 200 });
  }});
  assert.equal(calls, 1);
  assert.equal(person.nome, 'NOME_MOCK');
});

test('cartão usa gerar_cc, Mastercard e extrai os três campos', async () => {
  const html = '<div id="cartao_numero">NUMERO_MOCK</div><div id="data_validade">VALIDADE_MOCK</div><div id="codigo_seguranca">CODIGO_MOCK</div>';
  let body;
  const card = await generateCard({ fetchImpl: async (_url, options) => {
    body = options.body;
    return new Response(html, { status: 200 });
  }});
  assert.equal(body, 'acao=gerar_cc&pontuacao=S&bandeira=master');
  assert.deepEqual(card, { number: 'NUMERO_MOCK', expiry: 'VALIDADE_MOCK', cvv: 'CODIGO_MOCK' });
  assert.throws(() => parseCardHtml('<div>incompleto</div>'), FourDevsError);
});

test('HTTP 429 recebe erro específico sem expor resposta', async () => {
  await assert.rejects(generateCpf({ fetchImpl: mockFetch(429, 'ignored') }), (error) => error.code === 'RATE_LIMITED');
});

test('formatação de pessoa não inclui senha', () => {
  const out = formatPerson({ nome: 'NOME_MOCK', senha: 'SEGREDO_MOCK', cidade: 'CIDADE_MOCK', estado: 'UF' });
  assert.match(out, /NOME_MOCK/);
  assert.doesNotMatch(out, /SEGREDO_MOCK/);
});
