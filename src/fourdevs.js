'use strict';

const FOURDEVS_URL = 'https://www.4devs.com.br/ferramentas_online.php';
const REQUEST_TIMEOUT_MS = 8_000;

class FourDevsError extends Error {
  constructor(message, code = 'UPSTREAM_ERROR') {
    super(message);
    this.name = 'FourDevsError';
    this.code = code;
  }
}

function cleanText(value) {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlValue(html, id) {
  const match = String(html).match(new RegExp(`<div[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i'));
  return match ? cleanText(match[1]) : '';
}

function parseCardHtml(html) {
  const number = htmlValue(html, 'cartao_numero');
  const expiry = htmlValue(html, 'data_validade');
  const cvv = htmlValue(html, 'codigo_seguranca');
  if (!number || !expiry || !cvv) throw new FourDevsError('Resposta de cartão em formato inesperado.', 'BAD_RESPONSE');
  return { number, expiry, cvv };
}

async function postFourDevs(fields, { fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new FourDevsError('Fetch indisponível neste ambiente.', 'NO_FETCH');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(FOURDEVS_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'user-agent': 'InfinityBot/1.1 (non-official integration)'
      },
      body: new URLSearchParams(fields).toString(),
      signal: controller.signal
    });
    if (response.status === 429) throw new FourDevsError('O 4Devs limitou temporariamente as solicitações.', 'RATE_LIMITED');
    if (!response.ok) throw new FourDevsError(`4Devs respondeu HTTP ${response.status}.`, 'HTTP_ERROR');
    return response.text();
  } catch (error) {
    if (error instanceof FourDevsError) throw error;
    if (error?.name === 'AbortError') throw new FourDevsError('A solicitação ao 4Devs excedeu o tempo limite.', 'TIMEOUT');
    throw new FourDevsError('Falha de rede ao consultar o 4Devs.', 'NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
  }
}

async function generateCpf(options) {
  const text = cleanText(await postFourDevs({ acao: 'gerar_cpf', pontuacao: 'S', cpf_estado: '' }, options));
  if (!text) throw new FourDevsError('CPF não retornado pelo 4Devs.', 'BAD_RESPONSE');
  return text;
}

async function generatePerson(options) {
  const text = await postFourDevs({ acao: 'gerar_pessoa', sexo: 'I', pontuacao: 'S', idade: '', cep_estado: '', cep_cidade: '', txt_qtde: '1' }, options);
  let person;
  try { person = JSON.parse(text); } catch { throw new FourDevsError('Pessoa retornada em formato inesperado.', 'BAD_RESPONSE'); }
  if (!Array.isArray(person) || !person[0] || typeof person[0] !== 'object') throw new FourDevsError('Pessoa não retornada pelo 4Devs.', 'BAD_RESPONSE');
  return person[0];
}

async function generateCard(options) {
  const html = await postFourDevs({ acao: 'gerar_cc', pontuacao: 'S', bandeira: 'master' }, options);
  return parseCardHtml(html);
}

module.exports = { FOURDEVS_URL, REQUEST_TIMEOUT_MS, FourDevsError, cleanText, parseCardHtml, postFourDevs, generateCpf, generatePerson, generateCard };
