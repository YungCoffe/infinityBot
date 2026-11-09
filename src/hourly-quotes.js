'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const API_URL = 'https://api.animechan.io/v1/quotes/random';
const TRANSLATE_URL = 'https://api.mymemory.translated.net/get';
const APERTIUM_URL = 'https://apertium.org/apy/translate';
const TIME_ZONE = 'America/Sao_Paulo';
const CONFIG_MARKER = 'infinitybot-hourly-quotes-config:v1';
const POST_MARKER = 'infinitybot-hourly-quote:v1';
const MANUAL_POST_MARKER = 'infinitybot-manual-quote:v1';
const FALLBACK_NAME = 'infinity-fallback.jpg';
const FALLBACK_PATH = path.join(__dirname, '..', 'assets', FALLBACK_NAME);
const MAX_HISTORY_PAGES = 20, PAGE_SIZE = 100, HISTORY_WINDOW_DAYS = 7, MAX_ATTEMPTS = 3, DAY_REQUEST_LIMIT = 100, NETWORK_TIMEOUT_MS = 10_000;
const MYMEMORY_MAX_BYTES = 480;
const POSITIVE_WORDS = /\b(hope|happy|happiness|smile|dream|believe|courage|brave|strength|strong|kind|kindness|love|joy|peace|friend|friendship|together|future|light|shine|keep going|never give up|possible|success|life|live|heart|warm|fight|win|better|wonderful|protect)\b/i;
const API_ERROR_DETAIL = /^(?:error(?:\s*[:\-].*)?|warning(?:\s*[:\-].*)?|query limit exceeded|quota(?:\s+(?:finished|exceeded|exhausted))?|credit(?:\s+(?:exhausted|limit))?|rate[ -]?limit(?:\s+exceeded)?|too many requests|service unavailable|temporarily unavailable|invalid (?:request|api key|language pair)|access denied|forbidden|please (?:try again|wait|contact support))$/i;
class RateLimitError extends Error { constructor(ms) { super('Animechan HTTP 429'); this.retryAfterMs = ms; } }
function zonedParts(now = new Date()) { const p = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now); return Object.fromEntries(p.filter(x => x.type !== 'literal').map(x => [x.type, x.value])); }
function hourKey(now) { const p = zonedParts(now); return `${p.year}-${p.month}-${p.day}+${p.hour}`; }
function displayTime(now) { const p = zonedParts(now); return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`; }
function normalize(v) { return String(v || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase(); }
function hashQuote(q) { return crypto.createHash('sha256').update(`${normalize(q.content)}\n${normalize(q.anime)}\n${normalize(q.character)}`).digest('hex').slice(0, 24); }
function providerLabel(provider) { return provider === 'apertium' ? 'tradução automática Apertium, via espanhol' : 'tradução automática MyMemory'; }
function postFooter(key, hash, provider = null, manual = false) { return `${manual ? MANUAL_POST_MARKER : POST_MARKER} | ${manual ? 'manual' : key} | quote:${hash} | ${provider ? providerLabel(provider) : 'original em inglês (tradutores indisponíveis)'}`; }
function configFooter(id) { return `${CONFIG_MARKER} | channel:${id}`; }
function safe(v, max) { return String(v || '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/@(?!\u200b)/g, '@\u200b').trim().slice(0, max); }
function parseQuote(payload) { const raw = Array.isArray(payload?.data) ? payload.data[0] : payload?.data; const anime = raw?.anime?.name || raw?.anime, character = raw?.character?.name || raw?.character; const content = safe(raw?.content, 1800); return content && anime && character ? { content, anime: safe(anime, 256), character: safe(character, 256), source: 'Animechan API' } : null; }
function isMotivational(q) { return POSITIVE_WORDS.test(q?.content || ''); }
function retryMs(r, b) { const n = Number(r.headers?.get?.('retry-after') || b?.retry_after); return Number.isFinite(n) && n >= 0 ? n * 1000 : 3600000; }
async function fetchWithTimeout(fetchImpl, url, init = {}, timeoutMs = NETWORK_TIMEOUT_MS) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { return await fetchImpl(url, { ...init, signal: controller.signal }); } finally { clearTimeout(timer); } }
async function fetchQuote(fetchImpl = global.fetch) { const r = await fetchWithTimeout(fetchImpl, API_URL, { headers: { accept: 'application/json' } }); if (r.status === 429) { let b; try { b = await r.json(); } catch {} throw new RateLimitError(retryMs(r, b)); } if (!r.ok) throw new Error(`Animechan HTTP ${r.status}`); return parseQuote(await r.json()); }
function decodeHtmlEntities(value) { const named = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', eacute: 'é', ecirc: 'ê', iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', uacute: 'ú', ccedil: 'ç', Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Eacute: 'É', Ecirc: 'Ê', Iacute: 'Í', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Uacute: 'Ú', Ccedil: 'Ç' }; return String(value || '').replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (all, hex, dec, name) => { if (hex || dec) { const code = parseInt(hex || dec, hex ? 16 : 10); return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all; } return named[name] || all; }); }
function splitTextForMyMemory(text, maxBytes = MYMEMORY_MAX_BYTES) { const input = String(text || '').trim(); if (!input) return []; const chunks = []; let rest = input; while (rest) { if (Buffer.byteLength(rest, 'utf8') <= maxBytes) { chunks.push(rest); break; }
    let bytes = 0, end = 0, lastSentence = -1, lastSpace = -1;
    for (const ch of rest) { const size = Buffer.byteLength(ch, 'utf8'); if (bytes + size > maxBytes) break; bytes += size; end += ch.length; if (/[.!?;:]/.test(ch)) lastSentence = end; if (/\s/.test(ch)) lastSpace = end; }
    let cut = lastSentence > 0 ? lastSentence : lastSpace > 0 ? lastSpace : end;
    if (!cut) return []; // impossível sem quebrar um caractere UTF-8
    const chunk = rest.slice(0, cut).trim(); if (!chunk) return [];
    chunks.push(chunk); rest = rest.slice(cut).trimStart();
  } return chunks; }
function apiErrorCategory(body, translatedText) {
  if (body?.quotaFinished === true) return 'quota-finished';
  if (body?.responseStatus !== undefined && Number(body.responseStatus) !== 200) return `api-status-${Number(body.responseStatus)}`;
  const detail = String(body?.responseDetails || body?.error || '').trim();
  if (API_ERROR_DETAIL.test(detail)) return 'api-error-detail';
  if (API_ERROR_DETAIL.test(String(translatedText || '').trim())) return 'api-error-text';
  return null;
}
function isPlausibleSharedTerm(sourceText, translatedText) {
  const source = String(sourceText || '').trim(); const translated = String(translatedText || '').trim();
  // Honest exception: a single neutral term (e.g. "anime") may legitimately be unchanged in pt-BR.
  return source === translated && /^[\p{L}\p{N}][\p{L}\p{N}'’-]{1,29}$/u.test(source) && !/\b(the|and|you|your|with|from|this|that|believe|please|love|fight|dream|never|always|will|can|not)\b/i.test(source);
}
function translationDecision(body, sourceText, rawText, { rejectMarkers = false } = {}) {
  const raw = rawText ?? body?.responseData?.translatedText ?? body?.translatedText ?? body?.translation;
  const translated = decodeHtmlEntities(raw);
  const apiError = apiErrorCategory(body, translated);
  if (apiError) return { accepted: false, category: apiError };
  if (typeof raw !== 'string' || !translated.trim()) return { accepted: false, category: 'missing-text' };
  if (rejectMarkers && /[#*@]/.test(translated)) return { accepted: false, category: 'invalid-markers' };
  const clean = safe(translated, 1800);
  if (!clean) return { accepted: false, category: 'empty-after-sanitize' };
  if (normalize(clean) === normalize(sourceText)) return isPlausibleSharedTerm(String(sourceText || '').trim(), clean) ? { accepted: true, category: 'shared-term', text: clean } : { accepted: false, category: 'unchanged-unverified' };
  return { accepted: true, category: 'translated', text: clean };
}
function myMemoryTranslation(body, sourceText) { const decision = translationDecision(body, sourceText); return decision.accepted ? decision.text : null; }
function isUsableTranslation(body, sourceText) { return Boolean(myMemoryTranslation(body, sourceText)); }
function translationLog(log, provider, category, startedAt, block = null, extra = '') {
  const duration = Math.max(0, Date.now() - startedAt);
  const blockText = block === null ? '' : ` bloco=${block}`;
  log.info?.(`Frases tradução provider=${provider} status=${category}${blockText} duracao_ms=${duration}${extra}`);
}
async function translateMyMemory(text, fetchImpl = global.fetch, log = console) {
  const chunks = splitTextForMyMemory(text); const startedAt = Date.now();
  if (!chunks.length) { translationLog(log, 'mymemory', 'invalid-source', startedAt); return null; }
  const out = [];
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index]; const block = `${index + 1}/${chunks.length}`; const attemptAt = Date.now();
    try {
      const url = `${TRANSLATE_URL}?q=${encodeURIComponent(chunk)}&langpair=en|pt-BR`;
      const r = await fetchWithTimeout(fetchImpl, url, { headers: { accept: 'application/json' } });
      if (!r.ok || r.status === 429) { translationLog(log, 'mymemory', `http-${r.status}`, attemptAt, block); return null; }
      const body = await r.json(); const decision = translationDecision(body, chunk);
      translationLog(log, 'mymemory', decision.category, attemptAt, block);
      if (!decision.accepted) return null;
      out.push(decision.text);
    } catch (error) { translationLog(log, 'mymemory', error?.name === 'AbortError' ? 'timeout' : 'network-error', attemptAt, block); return null; }
  }
  const full = safe(out.join(' '), 1800);
  if (!full) { translationLog(log, 'mymemory', 'empty-after-join', startedAt); return null; }
  if (normalize(full) === normalize(text) && !isPlausibleSharedTerm(String(text || '').trim(), full)) { translationLog(log, 'mymemory', 'unchanged-unverified', startedAt); return null; }
  translationLog(log, 'mymemory', 'success', startedAt, `${chunks.length}/${chunks.length}`); return full;
}
function apertiumTranslation(body, sourceText) { const raw = body?.responseData?.translatedText ?? body?.translatedText ?? body?.translation; const decision = translationDecision(body, sourceText, raw, { rejectMarkers: true }); return decision.accepted ? decision.text : null; }
async function apertiumStep(text, langpair, fetchImpl, log, step) {
  const startedAt = Date.now();
  try {
    const url = `${APERTIUM_URL}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
    const r = await fetchWithTimeout(fetchImpl, url, { headers: { accept: 'application/json' } });
    if (!r.ok || r.status === 429) { translationLog(log, 'apertium', `http-${r.status}`, startedAt, step); return null; }
    const body = await r.json(); const decision = translationDecision(body, text, undefined, { rejectMarkers: true });
    translationLog(log, 'apertium', decision.category, startedAt, step);
    return decision.accepted ? decision.text : null;
  } catch (error) { translationLog(log, 'apertium', error?.name === 'AbortError' ? 'timeout' : 'network-error', startedAt, step); return null; }
}
async function translateApertium(text, fetchImpl = global.fetch, log = console) { const spanish = await apertiumStep(text, 'eng|spa', fetchImpl, log, '1/2'); if (!spanish) return null; return apertiumStep(spanish, 'spa|por_BR', fetchImpl, log, '2/2'); }
async function translateQuote(text, fetchImpl = global.fetch, log = console) {
  const startedAt = Date.now(); const myMemory = await translateMyMemory(text, fetchImpl, log);
  if (myMemory) { translationLog(log, 'mymemory', 'final-success', startedAt); return { text: myMemory, provider: 'mymemory' }; }
  const apertium = await translateApertium(text, fetchImpl, log);
  if (apertium) { translationLog(log, 'apertium', 'final-success', startedAt); return { text: apertium, provider: 'apertium' }; }
  translationLog(log, 'none', 'final-original', startedAt); return null;
}
async function translatePt(text, fetchImpl = global.fetch, log = console) { return (await translateQuote(text, fetchImpl, log))?.text || null; }
function requiredPermissions(manage = false) { const base = ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'AttachFiles']; return manage ? [...base, 'ManageMessages'] : base; }
function hasPermissions(channel, user, manage = false) { const p = channel.permissionsFor?.(user); return Boolean(p && requiredPermissions(manage).every(x => p.has(x))); }
function postInfo(m, botId) { if (m?.author?.id !== botId) return null; const footer = m?.embeds?.[0]?.footer?.text || ''; const scheduled = footer.match(/infinitybot-hourly-quote:v1 \| (\d{4}-\d\d-\d\d\+\d\d) \| quote:([a-f0-9]{24})/i); if (scheduled) return { kind: 'scheduled', key: scheduled[1], hash: scheduled[2].toLowerCase() }; const manual = footer.match(/infinitybot-manual-quote:v1 \| manual \| quote:([a-f0-9]{24})/i); return manual ? { kind: 'manual', key: null, hash: manual[1].toLowerCase() } : null; }
async function scanHistory(channel, botId, targetKey, now = new Date()) { let before; const hashes = new Set(), cutoff = now.getTime() - HISTORY_WINDOW_DAYS * 86400000; for (let page = 0; page < MAX_HISTORY_PAGES; page++) { const values = [...(await channel.messages.fetch({ limit: PAGE_SIZE, ...(before ? { before } : {}) })).values()]; for (const m of values) { if (Number.isFinite(m?.createdTimestamp) && m.createdTimestamp < cutoff) return { complete: true, found: false, hashes, pages: page + 1, windowEnded: true }; const info = postInfo(m, botId); if (info) { hashes.add(info.hash); if (info.key === targetKey) return { complete: true, found: true, hashes, pages: page + 1 }; } } if (values.length < PAGE_SIZE) return { complete: true, found: false, hashes, pages: page + 1 }; before = values.at(-1).id; } return { complete: false, found: false, hashes, pages: MAX_HISTORY_PAGES, reason: 'recent-history-limit' }; }
function buildEmbed(quote, now, hash, text, artwork = null, provider = null, manual = false) { const source = provider ? `${quote.source || 'Animechan API'} • original em inglês; ${providerLabel(provider)}` : `${quote.source || 'Animechan API'} • original em inglês; tradutores indisponíveis`; const fields = [{ name: 'Anime', value: quote.anime, inline: true }, { name: 'Personagem', value: quote.character, inline: true }, { name: 'Emissão (São Paulo)', value: displayTime(now), inline: false }, { name: 'Fonte', value: source, inline: false }]; if (artwork?.source) fields.push({ name: 'Capa', value: `Fonte: ${artwork.source.provider}. ${artwork.source.licenceNotice}`, inline: false }); const embed = { color: 0xB71C1C, title: '🎄 Frase horária de anime', description: `❄️ “${text}” ❄️`, fields, footer: { text: postFooter(hourKey(now), hash, provider, manual) }, timestamp: now.toISOString() }; embed.image = { url: artwork?.imageUrl || `attachment://${FALLBACK_NAME}` }; return embed; }
function makeMessage(quote, now, hash, text, artwork, provider = 'mymemory', manual = false) { const payload = { embeds: [buildEmbed(quote, now, hash, text, artwork, provider, manual)], allowedMentions: { parse: [] } }; if (!artwork?.imageUrl) payload.files = [{ attachment: FALLBACK_PATH, name: FALLBACK_NAME }]; return payload; }
async function findConfigInGuilds(client, log = console) { const found = []; for (const guild of client.guilds.cache.values()) { let chans; try { chans = await guild.channels.fetch(); } catch (e) { log.warn?.(`Frases: canais não lidos em ${guild.id}: ${e.message}`); continue; } for (const channel of chans.values()) { if (!channel?.isTextBased?.() || !channel.messages?.fetchPinned) continue; try { for (const msg of (await channel.messages.fetchPinned()).values()) if (msg.author?.id === client.user.id && (msg.embeds?.[0]?.footer?.text || '').startsWith(CONFIG_MARKER)) found.push(channel.id); } catch (e) { log.warn?.(`Frases: pins não lidos em ${channel.id}: ${e.message}`); } } } return [...new Set(found)]; }
function createHourlyQuoteManager({ client, fetchImpl = global.fetch, now = () => new Date(), log = console, artwork = null }) {
  const channels = new Map(), channelLocks = new Map(); let running = false, blockedUntil = 0, day = '', apiCount = 0;
  const remember = c => channels.set(c.id, c);
  async function locked(channelId, work) { const previous = channelLocks.get(channelId) || Promise.resolve(); let release; const current = new Promise(resolve => { release = resolve; }); const queued = previous.then(() => current); channelLocks.set(channelId, queued); await previous; try { return await work(); } finally { release(); if (channelLocks.get(channelId) === queued) channelLocks.delete(channelId); } }
  async function pick(history) { const ld = hourKey(now()).slice(0, 10); if (day !== ld) { day = ld; apiCount = 0; } for (let i = 0; i < MAX_ATTEMPTS; i++) { if (apiCount >= DAY_REQUEST_LIMIT) throw new Error('Limite local diário Animechan atingido'); apiCount++; const q = await fetchQuote(fetchImpl); if (q && isMotivational(q) && !history.hashes.has(hashQuote(q))) return q; } return null; }
  async function postToChannelUnlocked(channel, current, { manual = false } = {}) { const startedAt = Date.now(); const mode = manual ? 'manual' : 'scheduled'; const finish = result => { log.info?.(`Frases publicação canal=${channel.id} modo=${mode} status=${result.status} duracao_ms=${Math.max(0, Date.now() - startedAt)}`); return result; }; log.info?.(`Frases publicação canal=${channel.id} modo=${mode} status=attempt`); if (!hasPermissions(channel, client.user)) return finish({ channelId: channel.id, status: 'missing-permissions' }); if (current.getTime() < blockedUntil) return finish({ channelId: channel.id, status: 'source-cooldown' }); try { const h = await scanHistory(channel, client.user.id, hourKey(current), current); if (!manual && h.found) return finish({ channelId: channel.id, status: 'already-posted' }); if (!h.complete) return finish({ channelId: channel.id, status: 'history-incomplete', reason: h.reason }); const quote = await pick(h); if (!quote) return finish({ channelId: channel.id, status: 'no-suitable-source' }); const translation = await translateQuote(quote.content, fetchImpl, log); let art = null; if (artwork) try { art = await artwork({ quote: quote.content, anime: quote.anime, character: quote.character, hora: displayTime(current) }); } catch (e) { log.warn?.(`Frases capa canal=${channel.id} status=unavailable categoria=${e.code || e.name || 'error'}`); } await channel.send(makeMessage(quote, current, hashQuote(quote), translation?.text || quote.content, art, translation?.provider || null, manual)); return finish({ channelId: channel.id, status: translation ? 'posted' : 'posted-original', translation: translation?.provider || 'original', artwork: Boolean(art?.imageUrl), fallback: !art?.imageUrl, manual }); } catch (e) { if (e instanceof RateLimitError) { blockedUntil = current.getTime() + e.retryAfterMs; return finish({ channelId: channel.id, status: 'rate-limited' }); } log.error?.(`Frases publicação canal=${channel.id} modo=${mode} status=error categoria=${e.code || e.name || 'Error'}`); return finish({ channelId: channel.id, status: 'error' }); } }
  async function postToChannel(channel, current) { return locked(channel.id, () => postToChannelUnlocked(channel, current)); }
  async function sendNow(channel) { return locked(channel.id, () => postToChannelUnlocked(channel, now(), { manual: true })); }
  async function configure(c) { return locked(c.id, async () => { if (!hasPermissions(c, client.user, true)) return { status: 'missing-permissions', required: requiredPermissions(true) }; let msg; try { msg = await c.send({ embeds: [{ color: 0x1B5E20, title: '🎄 Frases horárias ativadas', description: 'Configuração persistente do InfinityBot. Uma tentativa de envio será feita agora e depois nas horas cheias.', fields: [{ name: 'Fuso', value: TIME_ZONE }, { name: 'Permissões necessárias', value: requiredPermissions(true).join(', ') }], footer: { text: configFooter(c.id) } }], allowedMentions: { parse: [] } }); await msg.pin(); } catch (error) { log.error?.(`Frases: configuração não salva em ${c.id}: ${error.message}`); return { status: 'configuration-failed' }; } remember(c); const initial = await postToChannelUnlocked(c, now()); return { status: 'configured', messageId: msg.id, initial }; }); }
  async function stop(c) { return locked(c.id, async () => { const pins = await c.messages.fetchPinned(); let removed = 0; for (const msg of pins.values()) if (msg.author?.id === client.user.id && (msg.embeds?.[0]?.footer?.text || '').startsWith(CONFIG_MARKER)) { await msg.unpin(); removed++; } channels.delete(c.id); return { status: 'stopped', removed }; }); }
  async function restore() { let n = 0; for (const id of await findConfigInGuilds(client, log)) try { const c = await client.channels.fetch(id); if (c?.isTextBased?.()) { remember(c); n++; } } catch (e) { log.warn?.(`Frases: canal ${id} não restaurado: ${e.message}`); } return n; }
  async function tick() { if (running) return { status: 'running' }; const current = now(), minute = Number(zonedParts(current).minute); if (minute !== 0 && minute !== 1) return { status: 'outside-window' }; if (current.getTime() < blockedUntil) return { status: 'source-cooldown' }; running = true; try { const results = []; for (const channel of channels.values()) { const result = await postToChannel(channel, current); results.push(result); if (result.status === 'rate-limited') break; } return { status: 'done', results }; } finally { running = false; } }
  return { channels, configure, stop, restore, tick, sendNow, status: () => [...channels.keys()] };
}
module.exports = { API_URL, TRANSLATE_URL, APERTIUM_URL, TIME_ZONE, CONFIG_MARKER, POST_MARKER, MANUAL_POST_MARKER, FALLBACK_NAME, FALLBACK_PATH, MAX_ATTEMPTS, DAY_REQUEST_LIMIT, HISTORY_WINDOW_DAYS, NETWORK_TIMEOUT_MS, MYMEMORY_MAX_BYTES, RateLimitError, zonedParts, hourKey, displayTime, hashQuote, parseQuote, isMotivational, fetchWithTimeout, fetchQuote, decodeHtmlEntities, splitTextForMyMemory, apiErrorCategory, isPlausibleSharedTerm, translationDecision, isUsableTranslation, translateMyMemory, translateApertium, translateQuote, translatePt, providerLabel, requiredPermissions, hasPermissions, postInfo, scanHistory, buildEmbed, makeMessage, findConfigInGuilds, createHourlyQuoteManager };
