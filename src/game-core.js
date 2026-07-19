const game = require('./game');
const config = require('./config');

// cards da rodada atual: cardId -> { id, owner, card }
const roundCards = new Map();
let cardSeq = 5000;
let sorteioSeq = 131937;
let drawTimer = null;
let resumeTimer = null;
let intermissionTimer = null;

// ===== Estado do jogo (rodada) =====
const state = {};

function novaRodada() {
  roundCards.clear();
  sorteioSeq++;
  Object.assign(state, {
    sorteio: sorteioSeq,
    status: 'intermission', // intermission | running | finished
    drawnBalls: [],
    currentBall: null,
    phaseIndex: 0,
    winners: { kuadra: null, kina: null, keno: null },
    startsAt: Date.now() + config.INTERMISSION,
    pausado: false,
    fasePausada: null,
  });
}

function iniciarSorteio() {
  state.status = 'running';
  state.startsAt = null;
}

function sortearBola() {
  const restantes = [];
  for (let i = 1; i <= 90; i++) if (!state.drawnBalls.includes(i)) restantes.push(i);
  if (restantes.length === 0 || state.winners.keno) {
    return { fim: true };
  }
  const n = restantes[Math.floor(Math.random() * restantes.length)];
  state.drawnBalls.push(n);
  state.currentBall = n;
  return { fim: false, n };
}

function finalizarRodada() {
  state.status = 'finished';
}

module.exports = {
  roundCards,
  get cardSeq() { return cardSeq; },
  set cardSeq(v) { cardSeq = v; },
  get sorteioSeq() { return sorteioSeq; },
  set sorteioSeq(v) { sorteioSeq = v; },
  get drawTimer() { return drawTimer; },
  set drawTimer(v) { drawTimer = v; },
  get resumeTimer() { return resumeTimer; },
  set resumeTimer(v) { resumeTimer = v; },
  get intermissionTimer() { return intermissionTimer; },
  set intermissionTimer(v) { intermissionTimer = v; },
  state,
  novaRodada,
  iniciarSorteio,
  sortearBola,
  finalizarRodada,
};
