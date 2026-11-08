'use strict';

const INTERVAL_MS = 8 * 60 * 1000;

function startSelfPing(externalUrl, options = {}) {
  const log = options.log || console;
  if (!externalUrl) {
    log.log('Ping automático desativado: RENDER_EXTERNAL_URL não configurada.');
    return null;
  }
  let url;
  try {
    url = new URL('/healthz', externalUrl);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.endsWith('.onrender.com')) throw new Error('URL inválida');
  } catch {
    log.error('Ping automático desativado: URL externa inválida.');
    return null;
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const schedule = options.schedule || setInterval;
  let pending = false;
  const timer = schedule(async () => {
    if (pending) return;
    pending = true;
    try {
      const response = await fetchImpl(url.href, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
      if (!response.ok) log.error(`Ping automático recebeu HTTP ${response.status}.`);
      else log.log('Ping automático concluído.');
      await response.body?.cancel();
    } catch {
      log.error('Não foi possível concluir o ping automático.');
    } finally {
      pending = false;
    }
  }, INTERVAL_MS);
  if (timer?.unref) timer.unref();
  return timer;
}

module.exports = { INTERVAL_MS, startSelfPing };
