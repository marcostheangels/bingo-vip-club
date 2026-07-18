// ===== Utilitários e constantes compartilhadas =====
const CLIENT_VER = 'v4-modular';
const token = localStorage.getItem('bingo_session_token');
const meuCpf = localStorage.getItem('bingo_meu_cpf') || '';

// Helpers de formatação
function faixaGrid(n) { return n <= 30 ? 'f1' : n <= 60 ? 'f2' : 'f3'; }
function faixa(n) { return n <= 30 ? 'ball-f1' : n <= 60 ? 'ball-f2' : 'ball-f3'; }
function brl(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
function brlCompact(v) { return 'R$' + Number(v).toFixed(2).replace('.', ','); }

// Fases do jogo
const PHASE_SEQUENCE = ['kuadra', 'kina', 'keno'];
const NOME = { kuadra: 'Kuadra', kina: 'Kina', keno: 'Keno' };
const SUBFASE = {
  kuadra: '4 números em uma linha',
  kina: '5 números em uma linha',
  keno: 'cartela completa (15)',
};

// Valida a sessão existente antes de entrar no jogo (anti-fraude / token expirado).
async function validarSessaoExistente() {
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
}

// Sair da conta
function sairDaConta() {
  localStorage.removeItem('bingo_session_token');
  localStorage.removeItem('bingo_meu_cpf');
  location.href = '/login.html';
}

window.brl = brl;
window.brlCompact = brlCompact;
window.PHASE_SEQUENCE = PHASE_SEQUENCE;
window.NOME = NOME;
window.SUBFASE = SUBFASE;
window.CLIENT_VER = CLIENT_VER;
window.meuCpf = meuCpf;
