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
  // Garante que nenhuma música de vitória fique tocando ao iniciar a nova partida.
  try { Object.values(winAudios).forEach((a) => { try { a.pause(); } catch (e) {} }); } catch (e) {}
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

// expõe para os outros módulos
window.playInicio = playInicio;
window.playBallSound = playBallSound;
window.playWinSound = playWinSound;
window.getSomInicioRodada = () => somInicioRodada;
window.setSomInicioRodada = (v) => { somInicioRodada = v; };
