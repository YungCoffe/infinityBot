'use strict';

// Endpoint público não autenticado, observado no cliente do Discord. Não envie token.
const UNIQUE_USERNAME_URL = 'https://discord.com/api/v9/unique-username/username-attempt-unauthed';
const REQUEST_TIMEOUT_MS = 8_000;

class UsernameCheckError extends Error {
  constructor(message, code = 'UPSTREAM_ERROR') {
    super(message);
    this.name = 'UsernameCheckError';
    this.code = code;
  }
}

function validateRequestedLength(value) {
  const rawLength = String(value ?? '').trim();
  if (!/^\d+$/.test(rawLength)) throw new UsernameCheckError('Informe um tamanho inteiro de 2 a 32.', 'INVALID_LENGTH');
  const length = Number(rawLength);
  if (!Number.isSafeInteger(length) || length < 2 || length > 32) {
    throw new UsernameCheckError('Informe um tamanho inteiro de 2 a 32.', 'INVALID_LENGTH');
  }
  return length;
}

function validateUsername(value, expectedLength) {
  const username = String(value ?? '');
  // Usernames de um caractere não são permitidos; mantenha apenas o formato suportado.
  if (!/^[a-z0-9._]{2,32}$/.test(username) || username.includes('..')) {
    throw new UsernameCheckError('Nome de usuário inválido.', 'INVALID_USERNAME');
  }
  if (expectedLength !== undefined && username.length !== validateRequestedLength(expectedLength)) {
    throw new UsernameCheckError('O tamanho informado não corresponde ao nome.', 'LENGTH_MISMATCH');
  }
  return username;
}

function extractTaken(payload) {
  if (!payload || typeof payload.taken !== 'boolean') {
    throw new UsernameCheckError('Resposta de disponibilidade em formato inesperado.', 'BAD_RESPONSE');
  }
  return payload.taken;
}

async function checkUsername(rawUsername, { fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS, expectedLength } = {}) {
  const username = validateUsername(rawUsername, expectedLength);
  if (typeof fetchImpl !== 'function') throw new UsernameCheckError('Fetch indisponível neste ambiente.', 'NO_FETCH');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(UNIQUE_USERNAME_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username }),
      signal: controller.signal
    });
    if (response.status === 429) throw new UsernameCheckError('A consulta foi limitada temporariamente.', 'RATE_LIMITED');
    if (!response.ok) throw new UsernameCheckError(`O serviço respondeu HTTP ${response.status}.`, 'HTTP_ERROR');
    let payload;
    try { payload = await response.json(); } catch { throw new UsernameCheckError('Resposta de disponibilidade inválida.', 'BAD_RESPONSE'); }
    return { username, taken: extractTaken(payload) };
  } catch (error) {
    if (error instanceof UsernameCheckError) throw error;
    if (error?.name === 'AbortError') throw new UsernameCheckError('A consulta excedeu o tempo limite.', 'TIMEOUT');
    throw new UsernameCheckError('Falha de rede ao consultar disponibilidade.', 'NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { UNIQUE_USERNAME_URL, REQUEST_TIMEOUT_MS, UsernameCheckError, validateRequestedLength, validateUsername, extractTaken, checkUsername };
