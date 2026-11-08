'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { INTERVAL_MS, startSelfPing } = require('../src/self-ping');

test('agenda um ping externo a cada oito minutos', async () => {
  let tick, interval, calledUrl;
  const timer = {};
  const result = startSelfPing('https://exemplo.onrender.com', {
    schedule: (fn, ms) => { tick = fn; interval = ms; return timer; },
    fetchImpl: async (url) => { calledUrl = url; return { ok: true }; },
    log: { log() {}, error() {} }
  });
  assert.equal(result, timer);
  assert.equal(interval, 480000);
  assert.equal(interval, INTERVAL_MS);
  await tick();
  assert.equal(calledUrl, 'https://exemplo.onrender.com/healthz');
});

test('não agenda sem URL ou com URL inválida', () => {
  let scheduled = false;
  const options = { schedule: () => { scheduled = true; }, log: { log() {}, error() {} } };
  assert.equal(startSelfPing('', options), null);
  assert.equal(startSelfPing('http://localhost:3000', options), null);
  assert.equal(scheduled, false);
});

test('captura falha de rede sem encerrar o processo', async () => {
  let tick, errorCount = 0;
  startSelfPing('https://exemplo.onrender.com', {
    schedule: (fn) => { tick = fn; return {}; },
    fetchImpl: async () => { throw new Error('erro de rede'); },
    log: { log() {}, error() { errorCount++; } }
  });
  await tick();
  assert.equal(errorCount, 1);
});
