const crypto = require('crypto');

// ===== Config do jogo =====
const DRAW_INTERVAL = parseInt(process.env.DRAW_INTERVAL) || 3000; // ms entre bolas
const INTERMISSION = parseInt(process.env.INTERMISSION) || 60000; // ms de intervalo entre rodadas (compra + contagem regressiva)
const PRIZES = { kuadra: 20, kina: 30, keno: 100, acumulado: 1000 };
const ACUMULADO_BALLS = 35; // fecha a cartela (Keno) até essa bola para ganhar o acumulado
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(16).toString('hex');

// Contas administrativas (separadas por vírgula). Defina no .env como ADMIN_CPF=123...
const ADMIN_CPF = (process.env.ADMIN_CPF || '')
  .split(',').map((c) => c.replace(/\D/g, '')).filter(Boolean);

module.exports = {
  DRAW_INTERVAL,
  INTERMISSION,
  PRIZES,
  ACUMULADO_BALLS,
  SESSION_SECRET,
  ADMIN_CPF,
};
