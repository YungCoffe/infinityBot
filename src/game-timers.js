'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_GAME_NAME_LENGTH = 80;

function normalizeGameName(value) {
  if (typeof value !== 'string') throw new TypeError('O nome do jogo é obrigatório.');
  const name = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!name) throw new TypeError('Digite o nome do jogo.');
  if (name.length > MAX_GAME_NAME_LENGTH) throw new RangeError(`O nome do jogo pode ter no máximo ${MAX_GAME_NAME_LENGTH} caracteres.`);
  if (/[\u0000-\u001F\u007F]/.test(name)) throw new TypeError('O nome do jogo contém caracteres inválidos.');
  return name;
}

function gameKey(name) {
  return name.normalize('NFC').toLocaleLowerCase('pt-BR');
}

function dictionary() { return Object.create(null); }
function blankData() { return { version: 1, users: dictionary() }; }

// Converte objetos vindos do JSON em dicionários sem protótipo. Assim, nomes como
// "constructor", "toString" e "__proto__" são tratados como chaves normais.
function validateData(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1 || !input.users || typeof input.users !== 'object' || Array.isArray(input.users)) return blankData();
  const data = blankData();
  for (const [userId, user] of Object.entries(input.users)) {
    if (!userId || !user || typeof user !== 'object' || Array.isArray(user) || !user.games || typeof user.games !== 'object' || Array.isArray(user.games)) return blankData();
    const games = dictionary();
    for (const [key, game] of Object.entries(user.games)) {
      if (!game || typeof game !== 'object' || Array.isArray(game) || typeof game.name !== 'string' || !Number.isFinite(game.totalMs) || game.totalMs < 0 || !(game.activeSince === null || (Number.isFinite(game.activeSince) && game.activeSince >= 0))) return blankData();
      games[key] = { name: game.name, totalMs: game.totalMs, activeSince: game.activeSince };
    }
    data.users[userId] = { games };
  }
  return data;
}

function cloneData(data) {
  return validateData(data);
}

class GameTimerStore {
  constructor({ dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data'), now = () => Date.now() } = {}) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'game-timers.json');
    this.now = now;
    this.data = this.load();
    this.writeQueue = Promise.resolve();
  }

  load() {
    try {
      return validateData(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') return blankData();
      // Nunca prossiga com dados vazios após falha de leitura/parse: uma gravação
      // posterior poderia destruir o arquivo que ainda pode ser recuperado.
      const reason = error instanceof SyntaxError ? 'JSON inválido' : 'não foi possível ler';
      const loadError = new Error(`Não foi possível carregar ${this.filePath}: ${reason}. O arquivo existente foi preservado.`);
      loadError.cause = error;
      throw loadError;
    }
  }

  async persist(data) {
    const serialized = `${JSON.stringify(data, null, 2)}\n`;
    await fs.promises.mkdir(this.dataDir, { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.writeFile(temporary, serialized, { mode: 0o600 });
      await fs.promises.rename(temporary, this.filePath);
    } catch (error) {
      await fs.promises.unlink(temporary).catch(() => {});
      throw error;
    }
  }

  mutate(operation) {
    const task = this.writeQueue.then(async () => {
      // Altera apenas uma cópia. A memória só é atualizada depois da gravação
      // atômica concluir, mantendo o estado consistente se o disco falhar.
      const nextData = cloneData(this.data);
      const result = operation(nextData);
      await this.persist(nextData);
      this.data = nextData;
      return result;
    });
    this.writeQueue = task.catch(() => {});
    return task;
  }

  gamesFor(data, userId, create = false) {
    if (typeof userId !== 'string' || !userId) throw new TypeError('Usuário inválido.');
    const user = data.users[userId];
    if (user) return user.games;
    if (!create) return null;
    const games = dictionary();
    data.users[userId] = { games };
    return games;
  }

  snapshot(game, now = this.now()) {
    const runningMs = game.activeSince === null ? 0 : Math.max(0, now - game.activeSince);
    return { name: game.name, totalMs: game.totalMs + runningMs, active: game.activeSince !== null, activeSince: game.activeSince };
  }

  async start(userId, rawName) {
    const name = normalizeGameName(rawName);
    const key = gameKey(name);
    return this.mutate((data) => {
      const games = this.gamesFor(data, userId, true);
      const now = this.now();
      const game = games[key] || (games[key] = { name, totalMs: 0, activeSince: null });
      if (game.activeSince !== null) return { ...this.snapshot(game, now), changed: false };
      game.activeSince = now;
      return { ...this.snapshot(game, now), changed: true };
    });
  }

  async stop(userId, rawName) {
    const name = normalizeGameName(rawName);
    const key = gameKey(name);
    return this.mutate((data) => {
      const games = this.gamesFor(data, userId);
      const now = this.now();
      const game = games && games[key];
      if (!game) return null;
      if (game.activeSince === null) return { ...this.snapshot(game, now), changed: false };
      game.totalMs += Math.max(0, now - game.activeSince);
      game.activeSince = null;
      return { ...this.snapshot(game, now), changed: true };
    });
  }

  async get(userId, rawName) {
    const name = normalizeGameName(rawName);
    const games = this.gamesFor(this.data, userId);
    const game = games && games[gameKey(name)];
    return game ? this.snapshot(game) : null;
  }

  async list(userId) {
    const games = this.gamesFor(this.data, userId);
    return games ? Object.values(games).map((game) => this.snapshot(game)).sort((a, b) => b.totalMs - a.totalMs || a.name.localeCompare(b.name)) : [];
  }
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(remainingSeconds).padStart(2, '0')}s`;
}

module.exports = { GameTimerStore, normalizeGameName, formatDuration, MAX_GAME_NAME_LENGTH };
