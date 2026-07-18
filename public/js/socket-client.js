// ===== Socket.IO client + montagem do grid 90 bolas =====
const gridElement = document.getElementById('board-grid');
for (let i = 1; i <= 90; i++) {
  const cell = document.createElement('div');
  cell.classList.add('grid-cell');
  cell.dataset.num = i;
  cell.innerText = String(i).padStart(2, '0');
  gridElement.appendChild(cell);
}

const socket = io({ auth: { token } });
window.__socket = socket;

socket.on('connect_error', (err) => {
  if (err.message === 'unauthorized') {
    localStorage.removeItem('bingo_session_token');
    localStorage.removeItem('bingo_meu_cpf');
    location.href = '/login.html';
  }
});

// ===== Saldo =====
socket.on('saldo', ({ balance }) => {
  document.getElementById('balanceVal').textContent = brl(balance);
});

// ===== Minhas cartelas =====
socket.on('myCards', (cards) => {
  window.setMyCards(cards);
  document.getElementById('cartCount').textContent = cards.length;
  window.renderMyCards();
});

socket.on('state', (s) => {
  window.__lastState = s;
  const dbg = document.getElementById('debugPainel');
  if (dbg) dbg.textContent = `v=${CLIENT_VER} | recv phaseIndex=${s.phaseIndex} ranking?${!!s.ranking} kuadra=${(s.ranking && s.ranking.kuadra || []).length} total=${s.totalCards}`;
  window.renderState(s);
});

// ===== Vencedor / Jackpot =====
socket.on('winner', (w) => {
  window.playWinSound(w.phase);
  window.showWinOverlay(w);
});

socket.on('jackpot', (j) => {
  window.playWinSound('keno');
  window.showJackpot(j);
});
