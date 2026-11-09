'use strict';

// Apenas atualiza a mensagem já respondida: nunca inicia outra consulta ao Discord.
const UPDATE_INTERVAL_MS = 15_000;
const MAX_UPDATES = 60;
const INTERACTION_SAFE_WINDOW_MS = 14 * 60_000;

function unixSeconds(ms) { return Math.ceil(ms / 1000); }
function progressBar(percent, width = 10) {
  const filled = Math.max(0, Math.min(width, Math.floor((percent / 100) * width)));
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function countdownView({ retryAtMs, startedAtMs, nowMs }) {
  const totalMs = Math.max(1, retryAtMs - startedAtMs);
  const remainingMs = Math.max(0, retryAtMs - nowMs);
  const progress = Math.max(0, Math.min(100, Math.floor(((totalMs - remainingMs) / totalMs) * 100)));
  const seconds = Math.ceil(remainingMs / 1000);
  const timestamp = `<t:${unixSeconds(retryAtMs)}:R>`;
  if (remainingMs <= 0) return { done: true, content: `⏱️ **Espera encerrada**\n${progressBar(100)} 100%\nO prazo informado terminou ${timestamp}. Isso não confirma disponibilidade nem inicia uma nova consulta; use o painel se quiser tentar novamente.` };
  return { done: false, content: `⏳ **Pausa por limite temporário (HTTP 429)**\n${progressBar(progress)} ${progress}% • cerca de ${seconds}s restantes\nTente novamente ${timestamp}. Esta barra acompanha apenas o prazo informado; ela não faz novas consultas nem garante que uma nova tentativa será aceita.` };
}

function isLongWait(waitMs) { return waitMs > INTERACTION_SAFE_WINDOW_MS; }

function startRateLimitCountdown({ retryAtMs, now = () => Date.now(), edit, setTimer = setTimeout, clearTimer = clearTimeout, intervalMs = UPDATE_INTERVAL_MS, maxUpdates = MAX_UPDATES, safeWindowMs = INTERACTION_SAFE_WINDOW_MS, onError = () => {} }) {
  if (!Number.isFinite(retryAtMs) || typeof edit !== 'function') return { cancel() {}, scheduled: false };
  const startedAtMs = now();
  const initial = countdownView({ retryAtMs, startedAtMs, nowMs: startedAtMs });
  // Mensagens de interação não são eternas: em espera longa, fica somente o timestamp nativo.
  if (retryAtMs - startedAtMs > safeWindowMs || initial.done) return { cancel() {}, scheduled: false, initial };
  let timer = null; let cancelled = false; let updates = 0;
  const schedule = () => {
    if (cancelled || updates >= maxUpdates) return;
    const remaining = retryAtMs - now();
    if (remaining <= 0) { tick(); return; }
    timer = setTimer(tick, Math.min(intervalMs, remaining));
    if (typeof timer?.unref === 'function') timer.unref();
  };
  const tick = async () => {
    if (cancelled || updates >= maxUpdates) return;
    updates += 1;
    const view = countdownView({ retryAtMs, startedAtMs, nowMs: now() });
    try { await edit({ content: view.content }); } catch (error) { cancelled = true; onError(error); return; }
    if (!view.done) schedule();
  };
  schedule();
  return { initial, scheduled: true, cancel() { cancelled = true; if (timer) clearTimer(timer); } };
}

module.exports = { UPDATE_INTERVAL_MS, MAX_UPDATES, INTERACTION_SAFE_WINDOW_MS, unixSeconds, progressBar, countdownView, isLongWait, startRateLimitCountdown };
