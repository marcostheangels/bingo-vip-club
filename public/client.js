const CLIENT_VER = 'v3-painel-final';
const token = localStorage.getItem('bingo_session_token');
const meuCpf = localStorage.getItem('bingo_meu_cpf') || '';

// Valida a sessão existente antes de entrar no jogo (anti-fraude / token expirado).
(async function validarSessaoExistente() {
  if (!token || !meuCpf) { location.href = '/login.html'; return; }
  try {
    const res = await fetch('/api/validar-sessao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken: token, cpf: meuCpf }),
    });
    const data = await res.json();
    if (!data.valido) {
      localStorage.removeItem('bingo_session_token');
      localStorage.removeItem('bingo_meu_cpf');
      location.href = '/login.html';
    } else if (data.nome) {
      document.getElementById('userName').textContent = data.nome;
    }
  } catch (e) {
    // se o servidor não responder, deixa seguir (será barrado pelo socket se inválido)
  }
})();

if (!token) location.href = '/login.html';

if (!document.getElementById('userName').textContent) {
  document.getElementById('userName').textContent = meuCpf ? 'CPF ' + meuCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4') : 'jogador';
}
document.getElementById('btnSair').addEventListener('click', () => {
  localStorage.removeItem('bingo_session_token');
  localStorage.removeItem('bingo_meu_cpf');
  location.href = '/login.html';
});

const socket = io({ auth: { token } });

socket.on('connect_error', (err) => {
  if (err.message === 'unauthorized') {
    localStorage.removeItem('bingo_session_token');
    localStorage.removeItem('bingo_meu_cpf');
    location.href = '/login.html';
  }
});

// ===== Helpers =====
function faixaGrid(n) { return n <= 30 ? 'f1' : n <= 60 ? 'f2' : 'f3'; }
function faixa(n) { return n <= 30 ? 'ball-f1' : n <= 60 ? 'ball-f2' : 'ball-f3'; }
function brl(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
function brlCompact(v) { return 'R$' + Number(v).toFixed(2).replace('.', ','); }

const PHASE_SEQUENCE = ['kuadra', 'kina', 'keno'];
const NOME = { kuadra: 'Kuadra', kina: 'Kina', keno: 'Keno' };
const SUBFASE = {
  kuadra: '4 números em uma linha',
  kina: '5 números em uma linha',
  keno: 'cartela completa (15)',
};

// ===== Sistema de áudio =====
let soundEnabled = true;
let audioUnlocked = false;
const winAudios = {
  kuadra: new Audio('kuadra.mp3'),
  kina: new Audio('kina.mp3'),
  keno: new Audio('keno.mp3'),
};
Object.values(winAudios).forEach((a) => { a.preload = 'auto'; a.volume = 0.9; });

const inicioAudio = new Audio('inicio-bingo.mp3');
inicioAudio.preload = 'auto';
inicioAudio.volume = 0.85;
let somInicioRodada = null;

function playInicio() {
  if (!soundEnabled || !audioUnlocked) return;
  try { inicioAudio.currentTime = 0; inicioAudio.play().catch(() => {}); } catch (e) {}
}

function playBallSound(n) {
  if (!soundEnabled || !audioUnlocked || n == null) return;
  const a = new Audio('balls/' + String(n).padStart(2, '0') + '.mp3');
  a.volume = 0.85;
  a.play().catch(() => {});
}

function playWinSound(phase) {
  if (!soundEnabled || !audioUnlocked) return;
  const a = winAudios[phase];
  if (!a) return;
  try { a.currentTime = 0; a.play().catch(() => {}); } catch (e) {}
}

// Navegadores exigem interação do usuário antes de tocar áudio.
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  Object.values(winAudios).forEach((a) => {
    a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
  });
}
['click', 'keydown', 'touchstart'].forEach((ev) =>
  document.addEventListener(ev, unlockAudio, { once: false })
);

// Botão para ligar/desligar o som
function toggleSound() {
  soundEnabled = !soundEnabled;
  if (!soundEnabled) {
    try { inicioAudio.pause(); } catch (e) {}
  }
  const btn = document.getElementById('btnSom');
  if (btn) {
    btn.querySelector('.material-icons').textContent = soundEnabled ? 'volume_up' : 'volume_off';
    btn.querySelector('.som-label').textContent = soundEnabled ? 'Som' : 'Mudo';
  }
}
window.toggleSound = toggleSound;

// ===== Monta grid 90 bolas =====
const gridElement = document.getElementById('board-grid');
for (let i = 1; i <= 90; i++) {
  const cell = document.createElement('div');
  cell.classList.add('grid-cell');
  cell.dataset.num = i;
  cell.innerText = String(i).padStart(2, '0');
  gridElement.appendChild(cell);
}

// ===== Estado local =====
let gameState = null;
let myCards = [];
let ultimaBolaSom = null;

// ===== Render estado do jogo =====
const elMainBall = document.getElementById('mainBall');
const playersContainer = document.getElementById('players-list');
const elStatusBanner = document.getElementById('statusBanner');

function updateStatusBanner(s) {
  let ico = '🔔', txt = '', cls = 'show';
  if (s.status === 'intermission') {
    const falta = Math.max(0, Math.ceil((s.startsAt - Date.now()) / 1000));
    ico = '⏳';
    txt = `Próxima partida em ${falta}s — compre suas cartelas!`;
    cls = 'show warn';
  } else if (s.status === 'running') {
    if (s.drawnBalls.length === 0) {
      ico = '🚀'; txt = `Partida iniciada! Sorteio #${s.sorteio} — boa sorte!`; cls = 'show go';
    } else {
      const fase = NOME[PHASE_SEQUENCE[s.phaseIndex]] || 'Kuadra';
      ico = '🎲';
      txt = `Sorteio #${s.sorteio} — bola ${s.drawnBalls.length} de 90 • ${fase} em disputa`;
      cls = 'show info';
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
  myCards.forEach((c) => {
    const f = faltaFase(c.card, drawn, fase);
    if (melhor === null || f < melhor) melhor = f;
  });
  document.getElementById('phaseBest').textContent =
    myCards.length === 0 ? '—' : (melhor === 0 ? 'FECHOU!' : 'faltam ' + melhor);

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
  gameState = s;
  document.getElementById('sorteioId').textContent = '#' + s.sorteio;
  document.getElementById('doacaoVal').textContent = brl(s.cardCost);
  document.getElementById('drawnCount').textContent = s.drawnBalls.length;
  document.getElementById('cartCount').textContent = myCards.length;

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
    if (s.status === 'running' && s.currentBall !== ultimaBolaSom) {
      ultimaBolaSom = s.currentBall;
      playBallSound(s.currentBall);
    }
  } else {
    elMainBall.textContent = '--';
    elMainBall.className = 'main-ball';
    ultimaBolaSom = null;
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
    document.getElementById('debugPainel').textContent =
      `debug: status=${s.status} totalCards=${s.totalCards} fase=${faseAtual} rankingLen=${lista.length}`;
    if (lista.length === 0) {
      const vazio = document.createElement('div');
      vazio.className = 'pphase-empty';
      vazio.textContent = 'Aguardando cartelas...';
      playersContainer.appendChild(vazio);
    } else {
      lista.forEach((item, i) => {
        const isMe = item.owner === meuCpf;
        const faltantes = item.faltantes || [];
        const balls = faltantes.map((n) => `<span class="pballmini" title="${n}">${n}</span>`).join('');
        const row = document.createElement('div');
        row.className = 'player-row' + (isMe ? ' me' : '');
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
    banner.classList.add('show');
    overlay.classList.add('show');
    buyPanel.classList.add('buyable');
    btnComprar.disabled = false;
    // Toca o som de início uma vez por rodada
    if (somInicioRodada !== s.sorteio) {
      somInicioRodada = s.sorteio;
      playInicio();
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
  renderMyCards();
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
  document.getElementById('statusIco').textContent = '⏳';
  document.getElementById('statusText').textContent = `Próxima partida em ${secs}s — compre suas cartelas!`;
  banner.className = 'show warn';
  if (timeEl) {
    timeEl.textContent = secs;
    timeEl.classList.toggle('urgent', secs <= 10);
  }
  if (badge) badge.textContent = `ABERTO • ${secs}s`;
}
setInterval(updateCountdown, 250);

// ===== Vencedor popup =====
socket.on('winner', (w) => {
  playWinSound(w.phase);
  showWinOverlay(w);
});

// ===== Jackpot (Acumulado) =====
socket.on('jackpot', (j) => {
  playWinSound('keno');
  showJackpot(j);
});

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

const WIN_STYLE = {
  kuadra: { c1: '#8b5cf6', c2: '#a855f7', c3: '#7c3aed', icon: '◆', sub: '4 Cantos Completados' },
  kina:   { c1: '#10b981', c2: '#34d399', c3: '#059669', icon: '✦', sub: '5 Números em Linha' },
  keno:   { c1: '#f59e0b', c2: '#fbbf24', c3: '#f97316', icon: '🏆', sub: 'Cartela Completa!' },
};

let winTimer = null;
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

  if (winTimer) clearTimeout(winTimer);
  const dur = w.phase === 'keno' ? 6000 : 3000;
  winTimer = setTimeout(() => overlay.classList.remove('show'), dur);
}

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

// ===== Saldo =====
socket.on('saldo', ({ balance }) => {
  document.getElementById('balanceVal').textContent = brl(balance);
});

// ===== Minhas cartelas =====
socket.on('myCards', (cards) => {
  myCards = cards;
  document.getElementById('cartCount').textContent = myCards.length;
  renderMyCards();
});

socket.on('state', (s) => {
  window.__lastState = s;
  const dbg = document.getElementById('debugPainel');
  if (dbg) dbg.textContent = `v=${CLIENT_VER} | recv phaseIndex=${s.phaseIndex} ranking?${!!s.ranking} kuadra=${(s.ranking && s.ranking.kuadra || []).length} total=${s.totalCards}`;
  renderState(s);
});

// ===== Render minhas cartelas (cartela oficial 9x3) =====
const myCardsGrid = document.getElementById('myCardsGrid');
function cardMarks(card, drawn) {
  let m = 0;
  card.forEach((row) => row.forEach((v) => { if (v !== '' && drawn.has(Number(v))) m++; }));
  return m;
}

// Marcações por linha (usado para Kuadra/Kina)
function rowMarks(card, drawn) {
  return card.map((row) => row.reduce((c, v) => c + (v !== '' && drawn.has(Number(v)) ? 1 : 0), 0));
}

// Quantas bolas faltam para fechar a fase indicada nesta cartela
function faltaFase(card, drawn, fase) {
  const rows = rowMarks(card, drawn);
  if (fase === 'kuadra') return Math.max(0, Math.min(...rows.map((h) => 4 - h)));
  if (fase === 'kina') return Math.max(0, Math.min(...rows.map((h) => 5 - h)));
  return Math.max(0, 15 - rows.reduce((a, b) => a + b, 0)); // keno
}

// Badge da fase quando a cartela já fechou (falta === 0)
// Exibição: 3 linhas x 5 números na ordem de leitura da cartela (sem buracos).
function displayRows(card) {
  const nums = card.flat().filter((v) => v !== '');
  const rows = [];
  for (let i = 0; i < 15; i += 5) rows.push(nums.slice(i, i + 5));
  return rows;
}

const BADGE_INFO = {
  kuadra: { txt: 'KUADRA', cls: 'badge-kuadra' },
  kina: { txt: 'KINA', cls: 'badge-kina' },
  keno: { txt: 'KENO', cls: 'badge-keno' },
};

function renderMyCards() {
  const drawn = new Set(gameState ? gameState.drawnBalls : []);
  const fase = gameState ? PHASE_SEQUENCE[gameState.phaseIndex] : 'kuadra';

  // Ordena: primeiro quem já fechou a fase EM DISPUTA, depois por menor falta na fase atual.
  // Desempate final: mais números marcados no total.
  const ordenado = [...myCards].sort((a, b) => {
    const fa = faltaFase(a.card, drawn, fase);
    const fb = faltaFase(b.card, drawn, fase);
    if (fa !== fb) return fa - fb;
    return cardMarks(b.card, drawn) - cardMarks(a.card, drawn);
  });

  myCardsGrid.innerHTML = '';
  ordenado.forEach((c, idx) => {
    const marks = cardMarks(c.card, drawn);
    const falta = faltaFase(c.card, drawn, fase);
    const fechouAtual = falta === 0;

    const dispRows = displayRows(c.card);
    const cells = dispRows
      .map((row) =>
        row
          .map((v) => `<div class="tnum ${drawn.has(Number(v)) ? 'mark' : ''}">${v}</div>`)
          .join('')
      )
      .join('');

    let statusTxt;
    if (fechouAtual) statusTxt = `<span class="falta-tag win">🏆 Fechou ${NOME[fase]}!</span>`;
    else if (falta === 1) statusTxt = `<span class="falta-tag hot">🔥 falta 1 p/ ${NOME[fase]}</span>`;
    else statusTxt = `<span class="falta-tag">faltam ${falta} p/ ${NOME[fase]}</span>`;

    // Badge: mostra somente a badge da FASE ATUAL em disputa quando esta cartela a fechou.
    // Ao avançar de fase (ex: Kuadra -> Kina), o badge da fase anterior some automaticamente.
    let badges = '';
    if (fechouAtual) {
      const b = BADGE_INFO[fase];
      badges = `<span class="card-badge ${b.cls}">🏆 ${b.txt}</span>`;
    }

    const div = document.createElement('div');
    let extraCls = '';
    if (fechouAtual) extraCls = ' won';
    else if (falta === 1) extraCls = ' almost';
    else if (idx === 0 && falta <= 2) extraCls = ' leader';
    div.className = 'ticket3d' + extraCls;
    div.innerHTML = `<div class="th"><span class="cid">#${c.id}</span><span class="card-badges">${badges}</span><span>${marks}/15</span></div>
      ${statusTxt}
      <div class="tgrid">${cells}</div>`;
    myCardsGrid.appendChild(div);
  });
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

// Expor funções chamadas via onclick
window.alterar = alterar;
window.comprarCartelas = comprarCartelas;
window.zoom = zoom;
