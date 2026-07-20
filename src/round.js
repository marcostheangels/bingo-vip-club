const game = require('./game');
const config = require('./config');
const db = require('./db');
const core = require('./game-core');
const bots = require('./bots');

let io = null;
let emitSaldoParaUser = null;
let emitMyCardsParaTodos = null;

function init(ioRef, hooks) {
  io = ioRef;
  emitSaldoParaUser = hooks.emitSaldoParaUser;
  emitMyCardsParaTodos = hooks.emitMyCardsParaTodos;
}

function pagar(owner, valor) {
  const u = db.users.get(owner);
  if (u) {
    u.balance = +(u.balance + valor).toFixed(2);
    db.markDirty(owner);
    db.saveUsers();
    emitSaldoParaUser(owner);
  }
}

function checarVencedores() {
  const premios = core.state.premios || config.PRIZES;
  for (const phase of game.PHASE_SEQUENCE) {
    if (core.state.winners[phase]) continue;

    // APENAS bots podem ganhar. Jogadores reais nunca levam premio.
    // Para nao parecer suspeito, as cartelas de jogadores reais sao ignoradas
    // na deteccao de vencedores. O jogo continua normalmente para eles.
    const botSet = new Set(bots.BOT_CPFS);
    const cartelasVencedoras = [];
    for (const c of core.roundCards.values()) {
      if (!botSet.has(c.owner)) continue; // so bots
      const ev = game.evaluateCard(c.card, core.state.drawnBalls);
      if (ev[phase].done) cartelasVencedoras.push(c);
    }
    if (cartelasVencedoras.length === 0) continue;

    // Agrupa cartelas vencedoras por jogador.
    const porJogador = new Map();
    for (const c of cartelasVencedoras) {
      const u = db.users.get(c.owner);
      const nome = u ? u.nome : c.owner;
      if (!porJogador.has(c.owner)) {
        porJogador.set(c.owner, { name: nome, owner: c.owner, cardIds: [], prize: 0 });
      }
      porJogador.get(c.owner).cardIds.push(c.id);
    }

    // Divide o premio IGUALMENTE entre os vencedores.
    const vencedores = [...porJogador.values()];
    const numVencedores = vencedores.length;
    const prizePorJogador = +(premios[phase] / numVencedores).toFixed(2);
    for (const v of vencedores) {
      v.prize = prizePorJogador;
      pagar(v.owner, prizePorJogador);
    }

    core.state.winners[phase] = {
      vencedores,
      name: vencedores.map((v) => v.name).join(', '),
      prize: prizePorJogador,
    };
    io.emit('winner', { phase, prize: prizePorJogador, vencedores });

    // Registra no histórico de rodadas para conferência no painel admin.
    db.addHistorico({
      id: 'H' + core.state.sorteio + '_' + phase + '_' + Date.now().toString(36),
      sorteio: core.state.sorteio,
      fase: phase,
      prize: premios[phase],
      vencedores: vencedores.map((v) => ({ name: v.name, owner: v.owner, cardIds: v.cardIds, prize: v.prize })),
      createdAt: Date.now(),
    });
    // PARA IMEDIATAMENTE o sorteio ao fechar uma fase: nenhuma bola extra é
    // sorteada até o overlay de vitória fechar. A próxima fase só recomeça
    // após o tempo de comemoração.
    if (core.drawTimer) { clearTimeout(core.drawTimer); core.drawTimer = null; }
    if (core.resumeTimer) { clearTimeout(core.resumeTimer); core.resumeTimer = null; }
    core.state.pausado = true;
    core.state.fasePausada = phase;
    broadcastState();
    const faseAtual = phase;
    core.resumeTimer = setTimeout(() => {
      core.resumeTimer = null;
      if (faseAtual !== 'keno' && core.state.status === 'running' && !core.state.winners.keno) {
        core.state.pausado = false;
        core.state.fasePausada = null;
        if (!core.drawTimer) core.drawTimer = setTimeout(sortearBolaLoop, config.DRAW_INTERVAL);
        broadcastState();
      }
    }, 4500);
  }
}

function sortearBolaLoop() {
  if (core.state.status !== 'running' || core.state.pausado) return;
  const r = core.sortearBola();
  if (r.fim) {
    finalizarRodada();
    return;
  }
  checarVencedores();
  broadcastState();
  if (core.state.winners.keno || core.state.drawnBalls.length >= 90) {
    finalizarRodada();
    return;
  }
  // Se checarVencedores encontrou ganhador, ela pausou o jogo e limpou o timer.
  // Nao agenda proxima bola se o jogo estiver pausado.
  if (!core.state.pausado && core.state.status === 'running') {
    core.drawTimer = setTimeout(sortearBolaLoop, config.DRAW_INTERVAL);
  }
}

// Retoma uma rodada não-finalizada salva no banco (caso o servidor tenha caído).
// Não retoma se a rodada já estava encerrada.
async function restaurarRodada() {
  const snap = await db.loadRound();
  if (!snap) return false;
  if (snap.state.status === 'finished') { await db.clearRound(); return false; }
  Object.assign(core.state, snap.state);
  core.cardSeq = snap.cardSeq;
  core.sorteioSeq = snap.sorteioSeq;
  core.roundCards.clear();
  for (const c of snap.cards) core.roundCards.set(c.id, { id: c.id, owner: c.owner, card: c.card });
  // Se estava em sorteio, retoma o timer; se em intermission, agenda início.
  if (core.drawTimer) { clearTimeout(core.drawTimer); core.drawTimer = null; }
  if (core.resumeTimer) { clearTimeout(core.resumeTimer); core.resumeTimer = null; }
  if (core.state.status === 'running') {
    if (core.state.pausado) {
      core.state.pausado = false;
      core.state.fasePausada = null;
    }
    core.drawTimer = setTimeout(sortearBolaLoop, config.DRAW_INTERVAL);
    console.log('[round] rodada retomada (running) bolas:', core.state.drawnBalls.length);
  } else if (core.state.status === 'intermission') {
    const restante = Math.max(1000, (core.state.startsAt || 0) - Date.now());
    core.resumeTimer = setTimeout(iniciarSorteio, restante);
    console.log('[round] rodada retomada (intermission)');
  }
  broadcastState();
  emitMyCardsParaTodos();
  return true;
}

function iniciarSorteio() {
  if (core.drawTimer) { clearTimeout(core.drawTimer); core.drawTimer = null; }
  if (core.resumeTimer) { clearTimeout(core.resumeTimer); core.resumeTimer = null; }
  if (core.intermissionTimer) { clearInterval(core.intermissionTimer); core.intermissionTimer = null; }
  core.iniciarSorteio();
  broadcastState();
  core.drawTimer = setTimeout(sortearBolaLoop, config.DRAW_INTERVAL);
}

function finalizarRodada() {
  if (core.state.status === 'finished') return;
  const premios = core.state.premios || config.PRIZES;
  console.log('[round] finalizarRodada — sorteio=' + core.state.sorteio + ' bolas=' + core.state.drawnBalls.length +
    ' status=' + core.state.status + ' keno?=' + !!core.state.winners.keno);
  if (core.drawTimer) { clearTimeout(core.drawTimer); core.drawTimer = null; }
  if (core.resumeTimer) { clearTimeout(core.resumeTimer); core.resumeTimer = null; }
  if (core.intermissionTimer) { clearInterval(core.intermissionTimer); core.intermissionTimer = null; }
  core.finalizarRodada();
  // Acumulado: Keno fechado até a bola ACUMULADO_BALLS => prêmio extra para os vencedores do Keno.
  // Processado aqui (uma unica vez) para nao depender do caminho de checarVencedores.
  if (core.state.winners.keno && !core.state.winners.acumulado && core.state.drawnBalls.length <= config.ACUMULADO_BALLS) {
    const porJogador = new Map();
    for (const v of core.state.winners.keno.vencedores) {
      const owner = v.owner || v.name;
      if (!porJogador.has(owner)) porJogador.set(owner, { name: v.name, owner, cardIds: [], prize: 0 });
      porJogador.get(owner).cardIds.push(...v.cardIds);
    }
    const vencedores = [...porJogador.values()];
    const numVencedores = vencedores.length;
    const prizePorJogador = +(premios.acumulado / numVencedores).toFixed(2);
    for (const v of vencedores) {
      v.prize = prizePorJogador;
      pagar(v.owner, prizePorJogador);
    }
    core.state.winners.acumulado = { vencedores, name: vencedores.map((v) => v.name).join(', '), prize: prizePorJogador };
    io.emit('jackpot', { prize: prizePorJogador, vencedores, balls: core.state.drawnBalls.length });
  }
  broadcastState();
  db.clearRound();
  // Ciclo completo após o Keno: animação/música do Keno dura 6s no cliente,
  // termina, aguarda mais 12s de pausa, e só então entra o contador regressivo
  // (que toca a música inicial). Total = 18000ms.
  setTimeout(comecarRodada, 18000);
}

function comecarRodada() {
  console.log('[round] comecarRodada — novo sorteio=' + (core.state.sorteio + 1) + ' status anterior=' + core.state.status);
  if (core.drawTimer) { clearTimeout(core.drawTimer); core.drawTimer = null; }
  if (core.resumeTimer) { clearTimeout(core.resumeTimer); core.resumeTimer = null; }
  if (core.intermissionTimer) { clearInterval(core.intermissionTimer); core.intermissionTimer = null; }
  core.novaRodada();
  broadcastState();
  db.clearRound();
  core.drawTimer = null;
  emitMyCardsParaTodos();
  if (process.env.BOTS === '1') {
    bots.botComprarCartelas(core.roundCards, db.users);
    // Atualiza contagem de cartelas dos bots
    let botCards = 0;
    const botSet = new Set(bots.BOT_CPFS);
    for (const c of core.roundCards.values()) if (botSet.has(c.owner)) botCards++;
    core.state.totalCardsVendidos = (core.state.totalCardsVendidos || 0) + botCards;
  }
  // Emite o estado a cada 1s durante a intermission para manter o cliente
  // sincronizado: contador regressivo, botão de compra habilitado e painel
  // de jogadores atualizado com as cartelas novas.
  core.intermissionTimer = setInterval(() => {
    if (core.state.status === 'intermission') {
      if (process.env.BINGO_DEBUG) console.log('[round] intermissionTimer tick — sorteio=' + core.state.sorteio);
      broadcastState();
    } else { clearInterval(core.intermissionTimer); core.intermissionTimer = null; }
  }, 1000);
  setTimeout(iniciarSorteio, config.INTERMISSION);
}

// ===== Broadcast / estado público =====
function publicState() {
  const players = [];
  const porOwner = new Map();
  for (const card of core.roundCards.values()) {
    if (!porOwner.has(card.owner)) porOwner.set(card.owner, []);
    porOwner.get(card.owner).push(card);
  }
  // Fase em disputa = primeira fase da sequência ainda sem vencedor.
  let phaseIndex = game.PHASE_SEQUENCE.findIndex((p) => !core.state.winners[p]);
  if (phaseIndex === -1) phaseIndex = game.PHASE_SEQUENCE.length - 1;
  const phaseAtual = game.PHASE_SEQUENCE[phaseIndex];

  // Set de bolas sorteadas calculado UMA vez (evaluateCard/missingForPhase
  // refazem o Set internamente, mas evitamos trabalho redundante agrupando).
  const drawnSet = new Set(core.state.drawnBalls.map(Number));
  const total = core.roundCards.size;

  const botSet = new Set(bots.BOT_CPFS);

  for (const [owner, cards] of porOwner) {
    const u = db.users.get(owner);
    let melhorFalta = 99;
    const validCards = cards.filter((c) => c && c.card);
    for (const c of validCards) {
      const f = game.faltaForPhase(c.card, core.state.drawnBalls, phaseAtual);
      if (f < melhorFalta) melhorFalta = f;
    }
    // Fases que este jogador JA fechou nesta rodada (badge fixo no painel).
    // So mostra badge de fase ganha para bots (jogadores reais nunca ganham).
    const ganhou = [];
    if (botSet.has(owner)) {
      for (const c of validCards) {
        for (const ph of game.PHASE_SEQUENCE) {
          if (game.evaluateCard(c.card, core.state.drawnBalls)[ph].done && !ganhou.includes(ph)) ganhou.push(ph);
        }
      }
    }
    players.push({ id: u ? u.cpf : owner, name: u ? u.nome : owner, falta: melhorFalta, ganhou });
  }
  players.sort((a, b) => a.falta - b.falta);

  // Painel "quem está perto de ganhar": para cada fase, UMA entrada por jogador
  // (a cartela dele mais próxima de ganhar), em ordem crescente de quem falta menos bolas.
  // Quem JÁ fez a fase aparece no topo, marcado com done:true (número vazio, "✓ FASE").
  const rankingPorFase = {};
  // Com muitas cartelas, limitamos o processamento do ranking para não travar o
  // servidor (o ranking é apenas informativo). Cap de 1500 cartelas avaliadas POR FASE.
  const limitePorFase = Math.min(total, 1500);
  for (const phase of game.PHASE_SEQUENCE) {
    const porOwnerMap = new Map();
    let avaliadas = 0;
    for (const c of core.roundCards.values()) {
      if (avaliadas >= limitePorFase) break;
      avaliadas++;
      if (!c || !c.card) continue;
      const ev = game.evaluateCard(c.card, core.state.drawnBalls);
      const fase = ev[phase];
      const faltantes = game.missingForPhase(c.card, core.state.drawnBalls, phase);
      const atual = porOwnerMap.get(c.owner);
      // Jogadores reais nunca sao marcados como "done" (só bots ganham).
      const isBot = botSet.has(c.owner);
      const faseDone = fase.done && isBot;
      const faltaRank = faseDone ? 0 : fase.falta;
      if (!atual || faltaRank < atual.faltaRank || (faltaRank === atual.faltaRank && c.id < atual.cardId)) {
        porOwnerMap.set(c.owner, { cardId: c.id, faltaRank, falta: fase.falta, done: faseDone, faltantes });
      }
    }
    const lista = [];
    for (const [owner, melhor] of porOwnerMap) {
      const u = db.users.get(owner);
      lista.push({
        cardId: melhor.cardId,
        owner,
        name: u ? u.nome : owner,
        falta: melhor.falta,
        done: melhor.done,
        faltantes: melhor.faltantes,
      });
    }
    // done primeiro (topo), depois por quem falta menos
    lista.sort((a, b) => (b.done - a.done) || (a.falta - b.falta) || (a.cardId - b.cardId));
    rankingPorFase[phase] = lista;
  }

  return {
    sorteio: core.state.sorteio,
    status: core.state.status,
    drawnBalls: core.state.drawnBalls,
    currentBall: core.state.currentBall,
    phaseIndex,
    winners: core.state.winners,
    startsAt: core.state.startsAt,
    pausado: !!core.state.pausado,
    fasePausada: core.state.fasePausada || null,
    prizes: core.state.premios || config.PRIZES,
    acumuladoBalls: config.ACUMULADO_BALLS,
    acumuladoAberto: !core.state.winners.keno && core.state.drawnBalls.length <= config.ACUMULADO_BALLS,
    cardCost: core.state.cardCost || game.CARD_COST_BASE,
    players,
    ranking: rankingPorFase,
    totalCards: core.roundCards.size,
  };
}

function broadcastState() {
  if (process.env.BINGO_DEBUG) console.log('[round] broadcastState — status=' + core.state.status + ' sorteio=' + core.state.sorteio);
  // Evita travar o event loop: com poucas cartelas emite na hora; com muitas,
  // adia o broadcast para a próxima iteração do loop de eventos.
  const total = core.roundCards.size;
  if (total > 800) {
    setImmediate(() => { io.emit('state', publicState()); });
  } else {
    io.emit('state', publicState());
  }
  saveSnapshot();
}

// Persiste o estado da rodada em andamento (cartelas + bolas + vencedores)
// para retomar caso o servidor caia.
function saveSnapshot() {
  const cards = [];
  for (const c of core.roundCards.values()) cards.push({ id: c.id, owner: c.owner, card: c.card });
  db.saveRound({
    state: core.state,
    cards,
    cardSeq: core.cardSeq,
    sorteioSeq: core.sorteioSeq,
  });
}

function cardsDoUser(owner) {
  const list = [];
  for (const c of core.roundCards.values()) if (c.owner === owner) list.push({ id: c.id, card: c.card });
  return list;
}

module.exports = {
  init,
  publicState,
  broadcastState,
  cardsDoUser,
  checarVencedores,
  comecarRodada,
  iniciarSorteio,
  finalizarRodada,
  sortearBolaLoop,
  restaurarRodada,
};
