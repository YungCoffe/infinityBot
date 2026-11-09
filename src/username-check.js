'use strict';

// Rota não oficial e não autenticada. Nunca envia token de usuário ou Authorization.
const UNIQUE_USERNAME_URL = 'https://discord.com/api/v9/unique-username/username-attempt-unauthed';
const REQUEST_TIMEOUT_MS = 8_000;
const FALLBACK_RETRY_AFTER_MS = 60_000;

class UsernameCheckError extends Error {
  constructor(message, code = 'UPSTREAM_ERROR', { retryAfterMs } = {}) {
    super(message);
    this.name = 'UsernameCheckError';
    this.code = code;
    if (Number.isFinite(retryAfterMs)) this.retryAfterMs = retryAfterMs;
  }
}

function validateRequestedLength(value) {
  const rawLength = String(value ?? '').trim();
  if (!/^\d+$/.test(rawLength)) throw new UsernameCheckError('Informe um tamanho inteiro de 2 a 32.', 'INVALID_LENGTH');
  const length = Number(rawLength);
  if (!Number.isSafeInteger(length) || length < 2 || length > 32) throw new UsernameCheckError('Informe um tamanho inteiro de 2 a 32.', 'INVALID_LENGTH');
  return length;
}

function validateRequestedQuantity(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) throw new UsernameCheckError('Informe uma quantidade inteira de 1 a 5.', 'INVALID_QUANTITY');
  const quantity = Number(raw);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 5) throw new UsernameCheckError('Informe uma quantidade inteira de 1 a 5.', 'INVALID_QUANTITY');
  return quantity;
}

function normalizeOptionalUsername(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw.startsWith('@') ? raw.slice(1) : raw;
}

function validateUsername(value, expectedLength) {
  const username = String(value ?? '');
  if (!/^[a-z0-9._]{2,32}$/.test(username) || username.includes('..')) throw new UsernameCheckError('Nome de usuário inválido. Use apenas letras minúsculas, números, ponto ou _.', 'INVALID_USERNAME');
  if (expectedLength !== undefined && username.length !== validateRequestedLength(expectedLength)) throw new UsernameCheckError('O tamanho informado não corresponde ao nome.', 'LENGTH_MISMATCH');
  return username;
}

function extractTaken(payload) {
  if (!payload || typeof payload.taken !== 'boolean') throw new UsernameCheckError('Resposta de disponibilidade em formato inesperado.', 'BAD_RESPONSE');
  return payload.taken;
}

function retryAfterMsFrom(response, payload, now = Date.now()) {
  const raw = response.headers?.get?.('retry-after');
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
    const dateMs = Date.parse(raw);
    if (Number.isFinite(dateMs)) return Math.max(0, dateMs - now);
  }
  const bodyValue = payload?.retry_after ?? payload?.retryAfter;
  const seconds = Number(bodyValue);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1000) : undefined;
}

async function safeJson(response) { try { return await response.json(); } catch { return undefined; } }

async function checkUsername(rawUsername, { fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS, expectedLength } = {}) {
  const username = validateUsername(rawUsername, expectedLength);
  if (typeof fetchImpl !== 'function') throw new UsernameCheckError('Fetch indisponível neste ambiente.', 'NO_FETCH');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(UNIQUE_USERNAME_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username }), signal: controller.signal });
    if (response.status === 429) {
      const payload = await safeJson(response);
      throw new UsernameCheckError('A consulta foi limitada temporariamente.', 'RATE_LIMITED', { retryAfterMs: retryAfterMsFrom(response, payload) });
    }
    if (!response.ok) throw new UsernameCheckError(`O serviço respondeu HTTP ${response.status}.`, 'HTTP_ERROR');
    const payload = await safeJson(response);
    return { username, taken: extractTaken(payload) };
  } catch (error) {
    if (error instanceof UsernameCheckError) throw error;
    if (error?.name === 'AbortError') throw new UsernameCheckError('A consulta excedeu o tempo limite.', 'TIMEOUT');
    throw new UsernameCheckError('Falha de rede ao consultar disponibilidade.', 'NETWORK_ERROR');
  } finally { clearTimeout(timer); }
}

module.exports = { UNIQUE_USERNAME_URL, REQUEST_TIMEOUT_MS, FALLBACK_RETRY_AFTER_MS, UsernameCheckError, validateRequestedLength, validateRequestedQuantity, normalizeOptionalUsername, validateUsername, extractTaken, retryAfterMsFrom, checkUsername };
