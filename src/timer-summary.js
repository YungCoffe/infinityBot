'use strict';

const DISCORD_MESSAGE_LIMIT = 2_000;
const PAGE_HEADER_RESERVE = 80;
const PAGE_FOOTER = '\n-# O bot não detecta jogos nem registra horas no Discord.';

function timerLine(snapshot, formatDuration) {
  return `${snapshot.active ? '🟢' : '⚪'} **${snapshot.name}** — ${formatDuration(snapshot.totalMs)}${snapshot.active ? ' (em andamento)' : ''}`;
}

// Retorna somente conteúdos já limitados a 2.000 caracteres. A reserva para
// cabeçalho/rodapé mantém o limite mesmo quando a contagem de páginas cresce.
function buildTimerSummaryPages(games, formatDuration, limit = DISCORD_MESSAGE_LIMIT) {
  if (!Array.isArray(games) || games.length === 0) {
    return ['**Seus contadores manuais**\nNenhum contador criado ainda.\n\n**Total:** 0h 00m 00s' + PAGE_FOOTER];
  }

  const total = games.reduce((sum, game) => sum + game.totalMs, 0);
  const lines = games.map((game) => timerLine(game, formatDuration));
  const capacity = limit - PAGE_HEADER_RESERVE - PAGE_FOOTER.length - (`\n\n**Total:** ${formatDuration(total)}`).length;
  if (capacity < 1) throw new RangeError('Limite de mensagem insuficiente para o resumo.');

  const groups = [];
  let group = [];
  let length = 0;
  for (const line of lines) {
    if (line.length > capacity) throw new RangeError('Uma linha do resumo excede o limite do Discord.');
    const addition = group.length ? line.length + 1 : line.length;
    if (group.length && length + addition > capacity) {
      groups.push(group);
      group = [line];
      length = line.length;
    } else {
      group.push(line);
      length += addition;
    }
  }
  if (group.length) groups.push(group);

  return groups.map((linesOnPage, index) => {
    const header = `**Seus contadores manuais — página ${index + 1}/${groups.length}**`;
    const totalLine = index === groups.length - 1 ? `\n\n**Total:** ${formatDuration(total)}` : '';
    const content = `${header}\n${linesOnPage.join('\n')}${totalLine}${PAGE_FOOTER}`;
    if (content.length > limit) throw new RangeError('Página de resumo excede o limite do Discord.');
    return content;
  });
}

module.exports = { DISCORD_MESSAGE_LIMIT, buildTimerSummaryPages };
