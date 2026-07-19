// ===== Socket.IO client + montagem do grid 90 bolas =====
window.gridElement = document.getElementById('board-grid');
const gridElement = window.gridElement;
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
socket.on('saldo', ({ balance, saldoJogavel }) => {
  const el = document.getElementById('balanceVal');
  if (el) el.textContent = brl(typeof saldoJogavel === 'number' ? saldoJogavel : balance);
  if (typeof saldoJogavel === 'number') window.__saldoJogavel = saldoJogavel;
  else window.__saldoJogavel = balance;
});

// ===== Minhas cartelas =====
socket.on('myCards', (cards) => {
  window.setMyCards(cards);
  document.getElementById('cartCount').textContent = cards.length;
  window.renderMyCards();
});

socket.on('state', (s) => {
  window.__lastState = s;
  window.renderState(s);
});

// ===== Vencedor / Jackpot =====
socket.on('winner', (w) => {
  window.playWinSound(w.phase);
  window.showWinOverlay(w);
  // Badge temporário no painel "Quem está perto"
  if (w.vencedores && w.vencedores.length) {
      w.vencedores.forEach((v) => {
        const row = document.querySelector(`#players-list .player-row[data-owner="${v.owner}"]`);
      if (row) {
        const balls = row.querySelector('.pballs');
        if (balls) {
          balls.innerHTML = `<span class="fase-badge-won flash" title="Fez ${NOME[w.phase]}">✓ ${NOME[w.phase].toUpperCase()}</span>`;
          setTimeout(() => {
            if (balls.querySelector('.fase-badge-won')) {
              balls.innerHTML = ''; // será preenchido no próximo state
            }
          }, 3500); // tempo da animação do overlay
        }
      }
    });
  }
});

socket.on('jackpot', (j) => {
  window.playWinSound('keno');
  window.showJackpot(j);
});
