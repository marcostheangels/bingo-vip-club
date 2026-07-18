// ===== Render da UI (estado do jogo, painéis, popups) =====
const elMainBall = document.getElementById('mainBall');
const playersContainer = document.getElementById('players-list');
const elStatusBanner = document.getElementById('statusBanner');

function updateStatusBanner(s) {
  let ico = '🔔', txt = '', cls = 'show';
  if (s.status === 'intermission') {
    // Faixa de intermission oculta por pedido (o aviso fica no overlay de contagem).
    ico = ''; txt = ''; cls = '';
  } else if (s.status === 'running') {
    if (s.drawnBalls.length === 0) {
      ico = '🚀'; txt = `Partida iniciada! Sorteio #${s.sorteio} — boa sorte!`; cls = 'show go';
    } else {
      // Faixa de sorteio oculta por pedido (não exibe "Sorteio #... bola X de 90").
      ico = ''; txt = ''; cls = '';
    }
  } else if (s.status === 'finished') {
    ico = '🏁'; txt = `Sorteio #${s.sorteio} encerrado!`; cls = 'show';
  }
  document.getElementById('statusIco').textContent = ico;
  document.getElementById('statusText').textContent = txt;
  elStatusBanner.className = cls;
}

function renderPhasePanel(s) {
  const fase = PHASE_SEQUENCE[s.phaseIndex] || 'kuadra';
  const panel = document.getElementById('phasePanel');
  panel.className = 'phase-panel fase-' + fase;
  document.getElementById('phaseName').textContent = NOME[fase].toUpperCase();
  document.getElementById('phaseSub').textContent = SUBFASE[fase];
  document.getElementById('phasePrize').textContent = brl(s.prizes[fase]);
  document.getElementById('phaseBalls').textContent = s.drawnBalls.length;

  // Melhor cartela: menor falta na fase atual entre as minhas cartelas
  let melhor = null;
  const drawn = new Set(s.drawnBalls);
  const cards = window.getMyCards();
  cards.forEach((c) => {
    const f = window.faltaFase(c.card, drawn, fase);
    if (melhor === null || f < melhor) melhor = f;
  });
  document.getElementById('phaseBest').textContent =
    cards.length === 0 ? '—' : (melhor === 0 ? 'FECHOU!' : 'faltam ' + melhor);

  // Passos de progresso das fases
  const prog = document.getElementById('phaseProgress');
  prog.innerHTML = PHASE_SEQUENCE.map((p, i) => {
    let cls = 'pp-step';
    if (s.winners[p]) cls += ' done';
    else if (i === s.phaseIndex) cls += ' active';
    else cls += ' locked';
    return `<div class="${cls}"><div class="pp-dot"></div><div class="pp-name">${NOME[p]}</div></div>`;
  }).join('');
}

function renderState(s) {
  window.setGameState(s);
  document.getElementById('sorteioId').textContent = '#' + s.sorteio;
  document.getElementById('doacaoVal').textContent = brl(s.cardCost);
  document.getElementById('drawnCount').textContent = s.drawnBalls.length;
  document.getElementById('cartCount').textContent = window.getMyCards().length;

  document.getElementById('prizeKuadra').textContent = brlCompact(s.prizes.kuadra);
  document.getElementById('prizeKina').textContent = brlCompact(s.prizes.kina);
  document.getElementById('prizeKeno').textContent = brlCompact(s.prizes.keno);
  document.getElementById('prizeAcumulado').textContent = brlCompact(s.prizes.acumulado);

  // Acumulado: meta de fechar a cartela até a bola N
  document.getElementById('acBadge').textContent = s.acumuladoBalls;
  const acCard = document.getElementById('acCard');
  const acStatus = document.getElementById('acStatus');
  if (s.winners.acumulado) {
    acStatus.textContent = 'CONQUISTADO! 🏆';
    acCard.classList.remove('closed');
  } else if (s.acumuladoAberto) {
    acStatus.textContent = `Até a bola ${s.acumuladoBalls} (${s.drawnBalls.length}/${s.acumuladoBalls})`;
    acCard.classList.remove('closed');
  } else {
    acStatus.textContent = 'ACUMULADO PERDIDO';
    acCard.classList.add('closed');
  }

  // Bola grande sendo sorteada
  if (s.currentBall != null) {
    elMainBall.textContent = s.currentBall;
    elMainBall.className = 'main-ball ' + faixa(s.currentBall);
    if (s.status === 'running' && s.currentBall !== window.__ultimaBolaSom) {
      window.__ultimaBolaSom = s.currentBall;
      window.playBallSound(s.currentBall);
    }
  } else {
    elMainBall.textContent = '--';
    elMainBall.className = 'main-ball';
    window.__ultimaBolaSom = null;
  }

  renderPhasePanel(s);
  updateStatusBanner(s);
  // Mapa 90 bolas
  const emIntermission = s.status === 'intermission';
  gridElement.querySelectorAll('.grid-cell').forEach((cell) => {
    const n = +cell.dataset.num;
    cell.className = 'grid-cell';
    if (emIntermission) return; // nova rodada: garante mapa limpo
    if (n === s.currentBall) cell.classList.add('current');
    else if (s.drawnBalls.includes(n)) cell.classList.add('drawn', faixaGrid(n));
  });

  // Painel "Quem está perto de ganhar": TODOS os jogadores da sala (uma entrada
  // por jogador, a cartela mais próxima), em ordem crescente de quem falta menos
  // bolas para fechar a FASE ATUAL (Kuadra/Kina/Keno). Mostra: nº da cartela,
  // nome e os números que faltam.
  try {
    playersContainer.innerHTML = '';
    const faseAtual = PHASE_SEQUENCE[s.phaseIndex] || 'kuadra';
    document.getElementById('fasePainel').textContent = '— ' + NOME[faseAtual];
    const lista = ((s.ranking && s.ranking[faseAtual]) || []).slice();
    if (lista.length === 0) {
      const vazio = document.createElement('div');
      vazio.className = 'pphase-empty';
      vazio.textContent = 'Aguardando cartelas...';
      playersContainer.appendChild(vazio);
    } else {
      lista.forEach((item, i) => {
        const isMe = item.owner === meuCpf;
        const faltantes = item.faltantes || [];
        let balls;
        if (item.done) {
          balls = `<span class="fase-badge-won" title="Fez ${NOME[faseAtual]}">✓ ${NOME[faseAtual].toUpperCase()}</span>`;
        } else {
          balls = faltantes.map((n) => `<span class="pballmini" title="${n}">${n}</span>`).join('');
        }
        const row = document.createElement('div');
        row.className = 'player-row' + (isMe ? ' me' : '') + (item.done ? ' done-row' : '');
        row.innerHTML = `
          <span class="prank">${i + 1}</span>
          <span class="pcode">${isMe ? '★' : ''}#${item.cardId}</span>
          <span class="player-name">${item.name}</span>
          <div class="pballs">${balls}</div>`;
        playersContainer.appendChild(row);
      });
    }
  } catch (e) {
    document.getElementById('debugPainel').textContent = 'ERRO painel: ' + e.message;
  }

  // Fases
  document.querySelectorAll('.fase-tag').forEach((t) => {
    t.classList.toggle('active', t.dataset.f === PHASE_SEQUENCE[s.phaseIndex]);
  });
  document.getElementById('faseJogo').textContent = NOME[PHASE_SEQUENCE[s.phaseIndex]];

  // Banner de status + timer + painel de compra
  const banner = document.getElementById('statusBanner');
  const btnComprar = document.getElementById('btnComprar');
  const overlay = document.getElementById('countdownOverlay');
  const buyPanel = document.getElementById('buyPanel');

  if (s.status === 'intermission') {
    banner.classList.remove('show');
    overlay.classList.add('show');
    buyPanel.classList.add('buyable');
    btnComprar.disabled = false;
    // Toca o som de início uma vez por rodada
    if (window.getSomInicioRodada() !== s.sorteio) {
      window.setSomInicioRodada(s.sorteio);
      window.playInicio();
    }
    updateCountdown();
  } else if (s.status === 'running') {
    banner.classList.remove('show');
    overlay.classList.remove('show');
    buyPanel.classList.remove('buyable');
    btnComprar.disabled = true;
  } else if (s.status === 'finished') {
    banner.classList.add('show');
    banner.textContent = '🏁 Rodada encerrada! Próxima começando...';
    overlay.classList.remove('show');
    buyPanel.classList.remove('buyable');
    btnComprar.disabled = true;
  }

  // Re-ordena as cartelas a cada nova bola (proximidade da fase atual muda)
  window.renderMyCards();
}

function updateCountdown() {
  const overlay = document.getElementById('countdownOverlay');
  if (!gameState || gameState.status !== 'intermission' || !gameState.startsAt) {
    overlay.classList.remove('show');
    return;
  }
  overlay.classList.add('show');
  const secs = Math.max(0, Math.ceil((gameState.startsAt - Date.now()) / 1000));
  const banner = document.getElementById('statusBanner');
  const timeEl = document.getElementById('countdownTime');
  const badge = document.getElementById('buyBadge');
  document.getElementById('statusIco').textContent = '';
  document.getElementById('statusText').textContent = '';
  if (timeEl) {
    timeEl.textContent = secs;
    timeEl.classList.toggle('urgent', secs <= 10);
  }
  if (badge) badge.textContent = `ABERTO • ${secs}s`;
}
setInterval(updateCountdown, 250);

// ===== Vencedor popup =====
function showWinOverlay(w) {
  const s = WIN_STYLE[w.phase] || WIN_STYLE.kuadra;
  const banner = document.getElementById('winBanner');
  banner.style.setProperty('--c1', s.c1);
  banner.style.setProperty('--c2', s.c2);
  banner.style.setProperty('--c3', s.c3);
  document.getElementById('winIcon').textContent = s.icon;
  document.getElementById('winTitle').textContent = NOME[w.phase].toUpperCase() + '!';
  document.getElementById('winSub').textContent = s.sub;
  document.getElementById('winValue').textContent = brl(w.prize) + ' cada';

  const wc = document.getElementById('winWinners');
  wc.innerHTML = '';
  (w.vencedores || []).forEach((v) => {
    const row = document.createElement('div');
    row.className = 'win-row';
    const cardsTxt = v.cardIds.length > 1 ? `cartelas ${v.cardIds.join(', ')}` : `cartela ${v.cardIds[0]}`;
    row.innerHTML = `<div><div class="wname">🎉 ${v.name}</div><div class="wcards">${cardsTxt}</div></div>
      <div class="wprize">${brl(v.prize)}</div>`;
    wc.appendChild(row);
  });

  const overlay = document.getElementById('winOverlay');
  overlay.classList.add('show');
  launchConfetti(s.c1, s.c2, s.c3);

  if (window.winTimer) clearTimeout(window.winTimer);
  const dur = w.phase === 'keno' ? 6000 : 3000;
  window.winTimer = setTimeout(() => overlay.classList.remove('show'), dur);
}

const WIN_STYLE = {
  kuadra: { c1: '#8b5cf6', c2: '#a855f7', c3: '#7c3aed', icon: '◆', sub: '4 Cantos Completados' },
  kina:   { c1: '#10b981', c2: '#34d399', c3: '#059669', icon: '✦', sub: '5 Números em Linha' },
  keno:   { c1: '#f59e0b', c2: '#fbbf24', c3: '#f97316', icon: '🏆', sub: 'Cartela Completa!' },
};

const CONFETTI_COLORS = ['#8b5cf6', '#34d399', '#f59e0b', '#22d3ee', '#ff5d5d', '#ffd83d'];
function launchConfetti(...extra) {
  const colors = [...CONFETTI_COLORS, ...extra];
  for (let i = 0; i < 120; i++) {
    const p = document.createElement('div');
    p.className = 'confetti';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDuration = (2 + Math.random() * 2) + 's';
    p.style.animationDelay = (Math.random() * 0.6) + 's';
    p.style.width = (6 + Math.random() * 8) + 'px';
    p.style.height = (10 + Math.random() * 10) + 'px';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 5000);
  }
}

// ===== Jackpot (Acumulado) =====
let jackpotTimer = null;
function showJackpot(j) {
  document.getElementById('jackpotValue').textContent = brl(j.prize) + ' cada';
  const wc = document.getElementById('jackpotWinners');
  wc.innerHTML = '';
  (j.vencedores || []).forEach((v) => {
    const row = document.createElement('div');
    row.className = 'jw-row';
    const cardsTxt = v.cardIds.length > 1 ? `cartelas ${v.cardIds.join(', ')}` : `cartela ${v.cardIds[0]}`;
    row.innerHTML = `<div class="jw-name">🎉 ${v.name}</div><div class="jw-prize">${brl(v.prize)}<div style="font-size:.6em;font-weight:600">${cardsTxt}</div></div>`;
    wc.appendChild(row);
  });
  const overlay = document.getElementById('jackpotOverlay');
  overlay.classList.add('show');
  launchCoins();
  if (jackpotTimer) clearTimeout(jackpotTimer);
  jackpotTimer = setTimeout(() => overlay.classList.remove('show'), 6000);
}

function launchCoins() {
  const emojis = ['🪙', '💰', '🪙', '💰', '🏆'];
  for (let i = 0; i < 50; i++) {
    const coin = document.createElement('div');
    coin.className = 'coin';
    coin.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    coin.style.left = Math.random() * 100 + 'vw';
    coin.style.fontSize = (1.5 + Math.random() * 1.5) + 'em';
    coin.style.animationDuration = (2 + Math.random() * 2) + 's';
    coin.style.animationDelay = (Math.random() * 0.5) + 's';
    document.body.appendChild(coin);
    setTimeout(() => coin.remove(), 5000);
  }
}

// ===== Compra =====
const CARD_COST = 0.15;
let qtd = 1;
const elQty = document.getElementById('qty');
const elTotalVal = document.getElementById('totalVal');
const elTotalQty = document.getElementById('totalQty');
const qtyRow = document.getElementById('qtyRow');

function atualizarCompra() {
  const custo = gameState ? gameState.cardCost : CARD_COST;
  elQty.textContent = qtd;
  elTotalVal.textContent = brl(qtd * custo);
  elTotalQty.textContent = qtd;
  qtyRow.querySelectorAll('.qbtn').forEach((b) => b.classList.toggle('active', +b.dataset.q === qtd));
}
function alterar(v) {
  qtd = Math.max(1, Math.min(200, qtd + v));
  atualizarCompra();
}
qtyRow.querySelectorAll('.qbtn').forEach((b) => {
  b.addEventListener('click', () => { qtd = +b.dataset.q; atualizarCompra(); });
});
atualizarCompra();

function comprarCartelas() {
  const socket = window.__socket;
  if (!socket) return;
  socket.emit('comprar', qtd, (res) => {
    if (res && res.error) {
      const banner = document.getElementById('statusBanner');
      banner.classList.add('show');
      banner.textContent = '⚠️ ' + res.error;
      setTimeout(() => { if (gameState) renderState(gameState); }, 2500);
    }
  });
}

// ===== Zoom cartelas =====
let cardW = 200;
function zoom(delta) {
  cardW = Math.max(150, Math.min(300, cardW + delta * 20));
  myCardsGrid.style.setProperty('--cardw', cardW + 'px');
}

// ===== Relógio =====
setInterval(() => {
  document.getElementById('live-clock').innerText = new Date().toTimeString().split(' ')[0];
}, 1000);

window.renderState = renderState;
window.showWinOverlay = showWinOverlay;
window.showJackpot = showJackpot;
window.alterar = alterar;
window.comprarCartelas = comprarCartelas;
window.zoom = zoom;
