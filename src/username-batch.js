'use strict';

const crypto = require('node:crypto');
const { FALLBACK_RETRY_AFTER_MS, UsernameCheckError, normalizeOptionalUsername, validateRequestedLength, validateRequestedQuantity, validateUsername } = require('./username-check');

// Intervalo global, conservador e fixo: não é configurável por usuário.
const MIN_GAP_MS = 10_000;
const MAX_ATTEMPTS_PER_REQUEST = 25;
const MAX_QUEUED_BATCHES = 3; // 3 × 25 × 10s = 12m30s, antes do teto de interação.
const GENERATED_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const secureRandom = () => crypto.randomInt(0, GENERATED_ALPHABET.length) / GENERATED_ALPHABET.length;

function generateCandidate(length, random = secureRandom) {
  let candidate = '';
  for (let index = 0; index < length; index += 1) candidate += GENERATED_ALPHABET[Math.floor(random() * GENERATED_ALPHABET.length)];
  return validateUsername(candidate, length);
}

function buildCandidates({ length, quantity, optionalUsername = '', random = secureRandom }) {
  const requestedLength = validateRequestedLength(length);
  const requestedQuantity = validateRequestedQuantity(quantity);
  const supplied = normalizeOptionalUsername(optionalUsername);
  if (supplied && requestedQuantity === 1) return [validateUsername(supplied, requestedLength)];
  const candidates = supplied ? [validateUsername(supplied, requestedLength)] : [];
  const seen = new Set(candidates);
  let generationAttempts = 0;
  while (candidates.length < requestedQuantity) {
    if (generationAttempts++ >= 10_000) throw new UsernameCheckError('Não foi possível gerar candidatos distintos.', 'GENERATION_FAILED');
    const candidate = generateCandidate(requestedLength, random);
    if (!seen.has(candidate)) { seen.add(candidate); candidates.push(candidate); }
  }
  return candidates;
}

class UsernameBatchChecker {
  constructor({ check, sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)), now = () => Date.now(), minGapMs = MIN_GAP_MS, fallbackRetryAfterMs = FALLBACK_RETRY_AFTER_MS, maxAttempts = MAX_ATTEMPTS_PER_REQUEST, maxQueuedBatches = MAX_QUEUED_BATCHES } = {}) {
    if (typeof check !== 'function') throw new TypeError('check é obrigatório.');
    this.check = check; this.sleep = sleep; this.now = now; this.minGapMs = minGapMs;
    this.fallbackRetryAfterMs = fallbackRetryAfterMs; this.maxAttempts = maxAttempts;
    this.maxQueuedBatches = maxQueuedBatches; this.nextAllowedAt = 0; this.rateLimitedUntil = 0;
    this.pendingBatches = 0; this.tail = Promise.resolve();
  }

  run(input) {
    const remainingRateLimitMs = this.#remainingRateLimitMs();
    if (remainingRateLimitMs > 0) return Promise.resolve().then(() => this.#blockedBatchResult(input, remainingRateLimitMs));
    if (this.pendingBatches >= this.maxQueuedBatches) return Promise.resolve().then(() => this.#queueFullResult(input));
    this.pendingBatches += 1;
    const work = this.tail.then(() => this.#runSerial(input));
    this.tail = work.catch(() => undefined);
    return work.finally(() => { this.pendingBatches -= 1; });
  }

  #remainingRateLimitMs() { const remaining = this.rateLimitedUntil - this.now(); if (remaining <= 0) { this.rateLimitedUntil = 0; return 0; } return remaining; }
  #baseInput(input) {
    const length = validateRequestedLength(input.length); const quantity = validateRequestedQuantity(input.quantity);
    const supplied = normalizeOptionalUsername(input.optionalUsername);
    return { length, quantity, supplied: supplied ? validateUsername(supplied, length) : '' };
  }
  #blockedBatchResult(input, remainingRateLimitMs) {
    const { supplied } = this.#baseInput(input);
    return { candidates: supplied ? [supplied] : [], results: [], checkedCount: 0, attemptedCount: 0, availableCount: 0, targetQuantity: validateRequestedQuantity(input.quantity), unverified: supplied ? [supplied] : [], rateLimited: { waitMs: remainingRateLimitMs, retryAtMs: this.now() + remainingRateLimitMs } };
  }
  #queueFullResult(input) {
    const { supplied, quantity } = this.#baseInput(input);
    return { candidates: supplied ? [supplied] : [], results: [], checkedCount: 0, attemptedCount: 0, availableCount: 0, targetQuantity: quantity, unverified: supplied ? [supplied] : [], queueFull: true };
  }
  #emit(callback, event) { if (typeof callback === 'function') { try { callback(event); } catch { /* o indicador nunca interrompe consultas */ } } }
  async #waitUntilAllowed(progress, state) {
    const remaining = this.nextAllowedAt - this.now();
    if (remaining > 0) {
      this.#emit(progress, { phase: 'waiting', waitMs: remaining, nextRequestAtMs: this.nextAllowedAt, ...state });
      await this.sleep(remaining);
    }
  }

  async #runSerial(input) {
    const progress = input.onProgress;
    const remainingRateLimitMs = this.#remainingRateLimitMs(); if (remainingRateLimitMs > 0) return this.#blockedBatchResult(input, remainingRateLimitMs);
    const { length, quantity, supplied } = this.#baseInput(input);
    const onlySupplied = Boolean(supplied) && quantity === 1;
    const candidates = []; const results = []; const seen = new Set();
    let availableCount = 0; let rateLimited = null; let stoppedError = null; let generationAttempts = 0;
    while (results.length < this.maxAttempts && availableCount < quantity) {
      let username;
      if (supplied && candidates.length === 0) username = supplied;
      else if (onlySupplied) break;
      else {
        do {
          if (generationAttempts++ >= 10_000) { stoppedError = 'GENERATION_FAILED'; break; }
          username = generateCandidate(length, input.random || secureRandom);
        } while (seen.has(username));
        if (stoppedError) break;
      }
      seen.add(username); candidates.push(username);
      await this.#waitUntilAllowed(progress, { attemptedCount: results.length, targetQuantity: quantity, availableCount });
      // Reserva o próximo início ANTES da chamada: erros, timeouts e 429 também contam.
      const startedAtMs = this.now();
      this.nextAllowedAt = startedAtMs + this.minGapMs;
      this.#emit(progress, { phase: 'checking', username, startedAtMs, attemptedCount: results.length + 1, targetQuantity: quantity, availableCount });
      try {
        const result = await this.check(username, { expectedLength: String(length) });
        const status = result.taken ? 'taken' : 'available';
        results.push({ username, status });
        if (status === 'available') availableCount += 1;
        this.#emit(progress, { phase: 'result', username, status, attemptedCount: results.length, targetQuantity: quantity, availableCount });
      } catch (error) {
        if (error instanceof UsernameCheckError && error.code === 'RATE_LIMITED') {
          const waitMs = Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : this.fallbackRetryAfterMs;
          const normalizedWaitMs = Math.max(0, waitMs);
          this.rateLimitedUntil = Math.max(this.nextAllowedAt, this.now() + normalizedWaitMs);
          this.nextAllowedAt = this.rateLimitedUntil;
          // Mostra o prazo que realmente bloqueia a fila (Retry-After e o intervalo global).
          rateLimited = { waitMs: Math.max(0, this.rateLimitedUntil - this.now()), retryAtMs: this.rateLimitedUntil };
          this.#emit(progress, { phase: 'rate_limited', username, attemptedCount: results.length + 1, targetQuantity: quantity, availableCount, rateLimited });
          break;
        }
        stoppedError = error?.code || 'UNKNOWN'; results.push({ username, status: 'error', code: stoppedError });
        this.#emit(progress, { phase: 'error', username, code: stoppedError, attemptedCount: results.length, targetQuantity: quantity, availableCount });
        break;
      }
    }
    const attemptedCount = results.length + (rateLimited ? 1 : 0);
    const unverified = results.filter(result => result.status === 'error').map(result => result.username);
    return { candidates, results, checkedCount: results.filter(result => result.status !== 'error').length, attemptedCount, availableCount, targetQuantity: quantity, unverified, rateLimited, stoppedError, exhausted: !rateLimited && !stoppedError && availableCount < quantity && results.length >= this.maxAttempts };
  }
}

module.exports = { MIN_GAP_MS, MAX_ATTEMPTS_PER_REQUEST, MAX_QUEUED_BATCHES, GENERATED_ALPHABET, generateCandidate, buildCandidates, UsernameBatchChecker };
