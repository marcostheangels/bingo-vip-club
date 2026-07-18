const crypto = require('crypto');

// ===== Config do jogo =====
const DRAW_INTERVAL = parseInt(process.env.DRAW_INTERVAL) || 3000; // ms entre bolas
const INTERMISSION = parseInt(process.env.INTERMISSION) || 60000; // ms de intervalo entre rodadas (compra + contagem regressiva)
const PRIZES = { kuadra: 20, kina: 30, keno: 100, acumulado: 1000 };
const ACUMULADO_BALLS = 35; // fecha a cartela (Keno) até essa bola para ganhar o acumulado
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(16).toString('hex');

// Demo: conta de teste pronta (sobe com BOTS=1 / demo)
const DEMO_CPF = '00000000000';
const DEMO_SENHA = 'demo123';

module.exports = {
  DRAW_INTERVAL,
  INTERMISSION,
  PRIZES,
  ACUMULADO_BALLS,
  SESSION_SECRET,
  DEMO_CPF,
  DEMO_SENHA,
};
