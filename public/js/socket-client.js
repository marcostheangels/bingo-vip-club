// ===== Socket.IO client + montagem do grid 90 bolas =====
window.gridElement = document.getElementById('board-grid');
const gridElement = window.gridElement;
if (gridElement) {
  for (let i = 1; i <= 90; i++) {
    const cell = document.createElement('div');
    cell.classList.add('grid-cell');
    cell.dataset.num = i;
    cell.innerText = String(i).padStart(2, '0');
    gridElement.appendChild(cell);
  }
} else {
  console.warn('[bingo] #board-grid ausente no DOM — grid de bolas não montado.');
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
socket.on('saldo', ({ balance, bonus, deposito, saldoJogavel }) => {
  const el = document.getElementById('balanceVal');
  if (el) el.textContent = brl(typeof saldoJogavel === 'number' ? saldoJogavel : balance);
  if (typeof saldoJogavel === 'number') window.__saldoJogavel = saldoJogavel;
  else window.__saldoJogavel = balance;
  window.__bonus = typeof bonus === 'number' ? bonus : 0;
  window.__deposito = typeof deposito === 'number' ? deposito : 0;
  window.__balance = typeof balance === 'number' ? balance : 0;
  // Se o modal de saque estiver aberto, atualiza os valores em tempo real
  if (document.getElementById('saqueModal')?.classList.contains('show') && typeof window.abrirSaque === 'function') {
    window.abrirSaque(true);
  }
});

// ===== Minhas cartelas =====
socket.on('myCards', (cards) => {
  window.setMyCards(cards);
  setTxt('cartCountBuy', cards.length);
  window.renderMyCards();
});

socket.on('state', (s) => {
  console.log('[bingo][socket] evento state — status=' + (s && s.status) + ' sorteio=' + (s && s.sorteio) +
    ' statusBanner?=' + !!document.getElementById('statusBanner') +
    ' statusIco?=' + !!document.getElementById('statusIco') +
    ' DOMready=' + document.readyState);
  window.__lastState = s;
  try {
    window.renderState(s);
  } catch (e) {
    console.error('[bingo][socket] ERRO em renderState:', e,
      '\nstate=', JSON.stringify(s).slice(0, 300));
  }
});

// Ao reconectar, pede o estado novamente (corrige tela congelada após queda/caiu rede
// durante a transição fim de jogo -> nova rodada).
socket.on('connect', () => {
  console.log('[bingo][socket] reconectado — CLIENT_VER=' + (window.CLIENT_VER || '?'));
  socket.emit('requestState');
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
