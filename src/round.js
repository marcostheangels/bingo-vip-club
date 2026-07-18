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
    u.balance += valor;
    db.saveUsers();
    emitSaldoParaUser(owner);
  }
}

function checarVencedores() {
  for (const phase of game.PHASE_SEQUENCE) {
    if (core.state.winners[phase]) continue;

    // Coleta TODAS as cartelas que fecharam esta fase nesta bola (pode haver empate).
    const cartelasVencedoras = [];
    for (const c of core.roundCards.values()) {
      const ev = game.evaluateCard(c.card, core.state.drawnBalls);
      if (ev[phase].done) cartelasVencedoras.push(c);
    }
    if (cartelasVencedoras.length === 0) continue;

    // Cada vencedor recebe o prêmio da fase. Agrupa por jogador (pode ter várias cartelas).
    const porJogador = new Map();
    for (const c of cartelasVencedoras) {
      const u = db.users.get(c.owner);
      const nome = u ? u.nome : c.owner;
      if (!porJogador.has(c.owner)) {
        porJogador.set(c.owner, { name: nome, owner: c.owner, cardIds: [], prize: 0 });
      }
      const info = porJogador.get(c.owner);
      info.cardIds.push(c.id);
      info.prize += config.PRIZES[phase];
      pagar(c.owner, config.PRIZES[phase]);
    }

    const vencedores = [...porJogador.values()];
    core.state.winners[phase] = {
      vencedores,
      name: vencedores.map((v) => v.name).join(', '),
      prize: config.PRIZES[phase],
    };
    io.emit('winner', { phase, prize: config.PRIZES[phase], vencedores });

    // Pausa o sorteio durante a animação de vitória para dar espaço aos jogadores.
    if (core.drawTimer) { clearInterval(core.drawTimer); core.drawTimer = null; }
    const faseAtual = phase;
    setTimeout(() => {
      // Só retoma se a rodada ainda estiver ativa e não for a última fase (Keno encerra tudo).
      if (faseAtual !== 'keno' && core.state.status === 'running' && !core.state.winners.keno) {
        core.drawTimer = setInterval(sortearBolaLoop, config.DRAW_INTERVAL);
      }
    }, 3500);
  }

  // Acumulado: Keno fechado até a bola ACUMULADO_BALLS => prêmio extra para os vencedores do Keno.
  if (core.state.winners.keno && !core.state.winners.acumulado && core.state.drawnBalls.length <= config.ACUMULADO_BALLS) {
    const porJogador = new Map();
    for (const v of core.state.winners.keno.vencedores) {
      const owner = v.owner || v.name;
      if (!porJogador.has(owner)) porJogador.set(owner, { name: v.name, owner, cardIds: [], prize: 0 });
      const info = porJogador.get(owner);
      info.cardIds.push(...v.cardIds);
      info.prize += config.PRIZES.acumulado;
      pagar(owner, config.PRIZES.acumulado);
    }
    const vencedores = [...porJogador.values()];
    core.state.winners.acumulado = { vencedores, name: vencedores.map((v) => v.name).join(', '), prize: config.PRIZES.acumulado };
    io.emit('jackpot', { prize: config.PRIZES.acumulado, vencedores, balls: core.state.drawnBalls.length });
  }
}

function sortearBolaLoop() {
  const r = core.sortearBola();
  if (r.fim) {
    finalizarRodada();
    return;
  }
  checarVencedores();
  broadcastState();
  if (core.state.winners.keno || core.state.drawnBalls.length >= 90) finalizarRodada();
}

function iniciarSorteio() {
  core.iniciarSorteio();
  broadcastState();
  core.drawTimer = setInterval(sortearBolaLoop, config.DRAW_INTERVAL);
}

function finalizarRodada() {
  if (core.drawTimer) { clearInterval(core.drawTimer); core.drawTimer = null; }
  core.finalizarRodada();
  broadcastState();
  setTimeout(comecarRodada, 6000);
}

function comecarRodada() {
  core.novaRodada();
  broadcastState();
  core.drawTimer = null;
  emitMyCardsParaTodos();
  if (process.env.BOTS === '1') bots.botComprarCartelas(core.roundCards, db.users);
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

  for (const [owner, cards] of porOwner) {
    const u = db.users.get(owner);
    let melhorFalta = 99;
    for (const c of cards) {
      const f = game.faltaForPhase(c.card, core.state.drawnBalls, phaseAtual);
      if (f < melhorFalta) melhorFalta = f;
    }
    players.push({ id: u ? u.cpf : owner, name: u ? u.nome : owner, falta: melhorFalta });
  }
  players.sort((a, b) => a.falta - b.falta);

  // Painel "quem está perto de ganhar": para cada fase, UMA entrada por jogador
  // (a cartela dele mais próxima de ganhar), em ordem crescente de quem falta menos bolas.
  // Quem JÁ fez a fase aparece no topo, marcado com done:true (número vazio, "✓ FASE").
  const rankingPorFase = {};
  for (const phase of game.PHASE_SEQUENCE) {
    const porOwner = new Map();
    for (const c of core.roundCards.values()) {
      const ev = game.evaluateCard(c.card, core.state.drawnBalls);
      const fase = ev[phase];
      const faltantes = game.missingForPhase(c.card, core.state.drawnBalls, phase);
      const atual = porOwner.get(c.owner);
      // mantém a cartela com menor falta (desempate: menor id); se já fez, falta=0
      const faltaRank = fase.done ? 0 : fase.falta;
      if (!atual || faltaRank < atual.faltaRank || (faltaRank === atual.faltaRank && c.id < atual.cardId)) {
        porOwner.set(c.owner, { cardId: c.id, faltaRank, falta: fase.falta, done: !!fase.done, faltantes });
      }
    }
    const lista = [];
    for (const [owner, melhor] of porOwner) {
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
    prizes: config.PRIZES,
    acumuladoBalls: config.ACUMULADO_BALLS,
    acumuladoAberto: !core.state.winners.keno && core.state.drawnBalls.length <= config.ACUMULADO_BALLS,
    cardCost: game.CARD_COST,
    players,
    ranking: rankingPorFase,
    totalCards: core.roundCards.size,
  };
}

function broadcastState() {
  io.emit('state', publicState());
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
};
