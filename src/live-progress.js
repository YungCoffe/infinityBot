'use strict';

const UPDATE_INTERVAL_MS = 5_000;
const GLOBAL_INTERVAL_SECONDS = 30;

function progressBar(done, total, width = 10) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  const filled = Math.floor(ratio * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function progressContent(event, nowMs = Date.now()) {
  const attempted = Number(event.attemptedCount) || 0;
  const target = event.targetQuantity || '?';
  const prefix = `**Consultando nicks — ${attempted} tentativa(s); meta: ${target} disponível(is)**`;
  if (event.phase === 'queued') return `${prefix}\n${progressBar(attempted, 25)} ${attempted}/25\n📋 Há ${event.queuedAhead} lote(s) antes deste na fila global. A busca tem prazo máximo de 12 minutos desde a criação da interação e poderá retornar resultado parcial sem novas consultas.`;
  if (event.phase === 'waiting') {
    const seconds = Math.max(1, Math.ceil(event.waitMs / 1000));
    return `${prefix}\n${progressBar(attempted, 25)} ${attempted}/25\n⏳ Intervalo global de ${GLOBAL_INTERVAL_SECONDS}s: próxima consulta ${Number.isFinite(event.nextRequestAtMs) ? `<t:${Math.ceil(event.nextRequestAtMs / 1000)}:R>` : `em cerca de ${seconds}s`}.`;
  }
  if (event.phase === 'checking') return `${prefix}\n${progressBar(attempted, 25)} ${attempted}/25\n🔎 Consultando \`@${event.username}\` agora. O resultado ainda não é conhecido.`;
  if (event.phase === 'rate_limited') return `${prefix}\n${progressBar(attempted, 25)} ${attempted}/25\n⏳ O Discord respondeu HTTP 429; a busca foi interrompida.`;
  if (event.phase === 'error') return `${prefix}\n${progressBar(attempted, 25)} ${attempted}/25\n⚠️ A consulta atual falhou; finalizando o resultado.`;
  return `${prefix}\n${progressBar(attempted, 25)} ${attempted}/25\nConsultando…`;
}

function createLiveProgress({ edit, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, intervalMs = UPDATE_INTERVAL_MS, onError = () => {} } = {}) {
  let closed = false; let timer = null; let lastSentAt = -Infinity; let pending = null; let tail = Promise.resolve();
  const enqueue = (content) => { tail = tail.then(async () => { try { await edit({ content }); } catch (error) { try { onError(error); } catch {} } }); return tail; };
  const flush = () => { timer = null; if (closed || !pending) return; const content = pending; pending = null; lastSentAt = now(); void enqueue(content); };
  const update = (event) => { if (closed || typeof edit !== 'function') return; pending = progressContent(event, now()); const delay = Math.max(0, intervalMs - (now() - lastSentAt)); if (delay === 0) flush(); else if (!timer) { timer = setTimer(flush, delay); if (typeof timer?.unref === 'function') timer.unref(); } };
  const finish = async (content) => { if (closed) return tail; closed = true; if (timer) clearTimer(timer); timer = null; pending = null; return enqueue(content); };
  return { update, finish };
}

module.exports = { UPDATE_INTERVAL_MS, GLOBAL_INTERVAL_SECONDS, progressBar, progressContent, createLiveProgress };
