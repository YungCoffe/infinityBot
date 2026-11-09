'use strict';

// Busca conservadora: só aceita o título exato ou equivalências explicitamente
// conhecidas. Nunca usa o primeiro resultado aproximado da pesquisa do AniList.
const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
const DEFAULT_TIMEOUT_MS = 5_000;
const SAFE_ANIME_SYNONYMS = Object.freeze({
  'attack on titan': ['shingeki no kyojin'],
  'shingeki no kyojin': ['attack on titan'],
  'demon slayer': ['kimetsu no yaiba'],
  'kimetsu no yaiba': ['demon slayer'],
  'my hero academia': ['boku no hero academia'],
  'boku no hero academia': ['my hero academia'],
  'jujutsu kaisen': ['sorcery fight'],
  'sorcery fight': ['jujutsu kaisen']
});

class ArtworkSourceError extends Error {
  constructor(message, code = 'ARTWORK_SOURCE_ERROR') { super(message); this.name = 'ArtworkSourceError'; this.code = code; }
}
function normalizeTitle(value) { return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function acceptedTitles(requestedAnime) {
  const requested = normalizeTitle(requestedAnime);
  return new Set([requested, ...(SAFE_ANIME_SYNONYMS[requested] || [])]);
}
function titleMatches(media, requestedAnime) {
  const accepted = acceptedTitles(requestedAnime);
  return accepted.size > 0 && [media?.title?.romaji, media?.title?.english, media?.title?.native].some(title => accepted.has(normalizeTitle(title)));
}
function isAllowedAniListImage(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && (parsed.hostname === 'anilist.co' || parsed.hostname.endsWith('.anilist.co')); } catch { return false; }
}
async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetchImpl(url, { ...init, signal: controller.signal }); }
  catch (error) { if (controller.signal.aborted) throw new ArtworkSourceError('Consulta ao AniList excedeu o tempo limite.', 'ANILIST_TIMEOUT'); throw error; }
  finally { clearTimeout(timer); }
}
async function generateQuoteArtwork(quoteData, options = {}) {
  if (!quoteData || typeof quoteData.anime !== 'string' || !quoteData.anime.trim()) throw new TypeError('anime deve ser uma string não vazia.');
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new ArtworkSourceError('Fetch indisponível.', 'FETCH_UNAVAILABLE');
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const query = `query AnimeArtwork($search: String!) { Page(page: 1, perPage: 10) { media(search: $search, type: ANIME) { id title { romaji english native } coverImage { extraLarge large medium } } } }`;
  const response = await fetchWithTimeout(fetchImpl, ANILIST_GRAPHQL_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ query, variables: { search: quoteData.anime.trim() } }) }, timeoutMs);
  if (!response?.ok) throw new ArtworkSourceError(`AniList HTTP ${response?.status ?? 'erro'}.`, 'ANILIST_HTTP_ERROR');
  let payload; try { payload = await response.json(); } catch { throw new ArtworkSourceError('AniList retornou JSON inválido.', 'ANILIST_INVALID_JSON'); }
  const media = Array.isArray(payload?.data?.Page?.media) ? payload.data.Page.media.find(candidate => titleMatches(candidate, quoteData.anime)) : null;
  if (!media) throw new ArtworkSourceError('Nenhuma correspondência exata ou sinônimo seguro no AniList.', 'ANIME_NOT_SAFE_MATCH');
  const imageUrl = media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium;
  if (!isAllowedAniListImage(imageUrl)) throw new ArtworkSourceError('AniList não forneceu URL HTTPS de capa permitida.', 'UNSAFE_IMAGE_URL');
  return { imageUrl, source: { provider: 'AniList', animeId: media.id, animeTitle: media.title?.romaji || media.title?.english || quoteData.anime, imageUrl, licenceNotice: 'Capa via AniList; direitos de imagem pertencem aos respectivos titulares.' } };
}
module.exports = { ANILIST_GRAPHQL_URL, SAFE_ANIME_SYNONYMS, ArtworkSourceError, normalizeTitle, acceptedTitles, titleMatches, isAllowedAniListImage, fetchWithTimeout, generateQuoteArtwork };
