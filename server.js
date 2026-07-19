const path = require('path');
const express = require('express');
const http = require('http');
const game = require('./src/game');
const config = require('./src/config');
const db = require('./src/db');
const auth = require('./src/auth');
const socket = require('./src/socket');
const bots = require('./src/bots');
const round = require('./src/round');
const core = require('./src/game-core');

require('dotenv').config();

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);
app.use(express.json());
// Evita 404 de /favicon.ico (recurso solicitado automaticamente pelos navegadores).
app.get('/favicon.ico', (req, res) => res.status(204).end());
// Anti-cache para assets (js/css/html) — garante que o navegador sempre baixe
// a versão mais recente, evitando o bug de "só funciona após F5".
app.use((req, res, next) => {
  if (/\.(js|css|html?)$/.test(req.path)) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

auth.registerRoutes(app);

// Inspeção de código-fonte dos painéis (apenas arquivos da whitelist).
const SOURCE_WHITELIST = {
  'ui.js': path.join(__dirname, 'public', 'js', 'ui.js'),
  'cards.js': path.join(__dirname, 'public', 'js', 'cards.js'),
  'socket-client.js': path.join(__dirname, 'public', 'js', 'socket-client.js'),
  'main.js': path.join(__dirname, 'public', 'js', 'main.js'),
  'util.js': path.join(__dirname, 'public', 'js', 'util.js'),
  'audio.js': path.join(__dirname, 'public', 'js', 'audio.js'),
  'style.css': path.join(__dirname, 'public', 'css', 'style.css'),
  'index.html': path.join(__dirname, 'public', 'index.html'),
};
app.get('/api/source', (req, res) => {
  const file = req.query.file;
  const fp = SOURCE_WHITELIST[file];
  if (!fp) return res.status(400).json({ error: 'arquivo nao permitido' });
  try {
    const content = require('fs').readFileSync(fp, 'utf8');
    res.type('text/plain').send(content);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Salvar página (modo edição admin) =====
// Grava o HTML editado em public/index.html (com backup .bak). Requer sessão de ADMIN válida.
const fs = require('fs');
const INDEX_PATH = path.join(__dirname, 'public', 'index.html');

// Remove conteúdo perigoso do HTML editável: <script>, on* handlers e URLs javascript:.
function sanitizarHtml(html) {
  let out = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<script\b[^>]*>/gi, '');
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
  out = out.replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '$1="#"');
  return out;
}

app.post('/api/save-page', (req, res) => {
  const { sessionToken, cpf, html } = req.body || {};
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  const tokenKey = sessionToken && db.sessions.get(sessionToken);
  const u = cpfLimpo && db.users.get(cpfLimpo);
  if (!u || tokenKey !== cpfLimpo || u.sessionToken !== sessionToken) {
    return res.status(401).json({ error: 'Sessão inválida.' });
  }
  if (!u.admin) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }
  if (typeof html !== 'string' || html.length < 100) {
    return res.status(400).json({ error: 'HTML inválido ou muito curto.' });
  }
  // Anti-abuso: limite de tamanho (~1 MB)
  if (Buffer.byteLength(html, 'utf8') > 1024 * 1024) {
    return res.status(413).json({ error: 'HTML muito grande.' });
  }
  const limpo = sanitizarHtml(html);
  // Validação mínima: preservar marcadores essenciais do jogo.
  if (!/id="board-grid"/.test(limpo)) {
    return res.status(400).json({ error: 'HTML inválido: faltam elementos essenciais do jogo.' });
  }
  try {
    // Backup antes de sobrescrever (mantém até 3 versões anteriores).
    try {
      const atual = fs.readFileSync(INDEX_PATH, 'utf8');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(INDEX_PATH + '.bak.' + ts, atual, 'utf8');
      fs.writeFileSync(INDEX_PATH + '.bak', atual, 'utf8');
    } catch (e) { /* ignora se não existir */ }
    fs.writeFileSync(INDEX_PATH, limpo, 'utf8');
    res.json({ ok: true, bytes: Buffer.byteLength(limpo, 'utf8') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Estado atual (apenas com TEST=1) para inspecao/debug
if (process.env.TEST) {
  app.get('/api/state', (req, res) => res.json(round.publicState()));
}

// ===== Painel administrativo (requer sessão de admin) =====
function requireAdmin(req, res, next) {
  // Credenciais vêm do body (POST) ou da query (GET). Não aceita headers para
  // evitar abuso via headers customizados em rotas POST.
  const fonte = req.method === 'GET' ? (req.query || {}) : (req.body || {});
  const sessionToken = fonte.sessionToken;
  const cpf = fonte.cpf;
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  const tokenKey = sessionToken && db.sessions.get(sessionToken);
  const u = cpfLimpo && db.users.get(cpfLimpo);
  if (!u || tokenKey !== cpfLimpo || u.sessionToken !== sessionToken || !u.admin) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  req.admin = u;
  next();
}

app.get('/api/admin/users', (req, res) => {
  const { sessionToken, cpf } = req.query;
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  const tokenKey = sessionToken && db.sessions.get(sessionToken);
  const u = cpfLimpo && db.users.get(cpfLimpo);
  if (!u || tokenKey !== cpfLimpo || u.sessionToken !== sessionToken || !u.admin) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  const botCpfs = new Set(require('./src/bots').BOT_DEFS.map((b) => b.cpf));
  const list = Array.from(db.users.values())
    .filter((x) => !botCpfs.has(x.cpf))
    .map((x) => ({ cpf: x.cpf, nome: x.nome, email: x.email, balance: x.balance, bonus: Number(x.bonus) || 0, admin: !!x.admin }));
  res.json({ users: list, state: round.publicState() });
});

app.post('/api/admin/force', requireAdmin, (req, res) => {
  const { phase } = req.body || {};
  if (!['kuadra', 'kina', 'keno'].includes(phase)) return res.status(400).json({ error: 'fase inválida' });
  // Força a próxima cartela do admin a vencer a fase.
  const card = [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [11, 12, 13, 14, 15],
  ];
  if (core.state.drawnBalls.length === 0) core.state.drawnBalls.push(...Array.from({ length: phase === 'kina' ? 5 : phase === 'keno' ? 15 : 4 }, (_, i) => i + 1));
  core.state.currentBall = phase === 'kina' ? 5 : phase === 'keno' ? 15 : 4;
  const idx = (++core.cardSeq);
  core.roundCards.set(idx, { id: idx, owner: req.admin.cpf, card });
  round.checarVencedores();
  if (phase === 'keno') round.finalizarRodada();
  else round.broadcastState();
  res.json({ ok: true });
});

app.post('/api/admin/round', requireAdmin, (req, res) => {
  const { action } = req.body || {};
  if (action === 'nova') { round.comecarRodada(); return res.json({ ok: true }); }
  if (action === 'pausar') {
    if (core.drawTimer) { clearInterval(core.drawTimer); core.drawTimer = null; }
    return res.json({ ok: true });
  }
  if (action === 'iniciar') { round.iniciarSorteio(); return res.json({ ok: true }); }
  res.status(400).json({ error: 'ação inválida' });
});

// Ajusta saldo/bonus/deposito de um usuario (admin).
// body: { cpfAlvo, field: 'balance'|'bonus'|'deposito', op: 'add'|'remove'|'set', amount }
app.post('/api/admin/user', requireAdmin, async (req, res) => {
  const cpfAlvo = req.body.cpfAlvo || req.body.cpf;
  const { field, op, amount, nome } = req.body || {};
  const cpfLimpo = String(cpfAlvo || '').replace(/\D/g, '');
  const u = db.users.get(cpfLimpo);
  if (!u) return res.status(404).json({ error: 'usuário não encontrado' });
  if (nome) { u.nome = nome.trim(); db.markDirty(cpfLimpo); }
  if (field === 'balance' || field === 'bonus' || field === 'deposito') {
    const v = parseFloat(String(amount).replace(',', '.'));
    if (isNaN(v) || v < 0) return res.status(400).json({ error: 'valor inválido' });
    const atual = Number(u[field]) || 0;
    let novo;
    if (op === 'add') novo = atual + v;
    else if (op === 'remove') novo = Math.max(0, atual - v);
    else if (op === 'set') novo = v;
    else return res.status(400).json({ error: 'op inválida' });
    u[field] = +novo.toFixed(2);
    db.markDirty(cpfLimpo);
  }
  db.saveUsers();
  if (u.sessionToken) {
    // notifica o jogador logado sobre o novo saldo
    try {
      const io = require('./src/socket')._io;
      if (io) io.of('/').sockets.forEach((s) => { if (s.data.cpf === cpfLimpo) { s.emit('saldo', { balance: u.balance, bonus: u.bonus, deposito: u.deposito, saldoJogavel: db.saldoJogavel(cpfLimpo) }); } });
    } catch (e) {}
  }
  res.json({ ok: true, user: { cpf: u.cpf, nome: u.nome, balance: u.balance, bonus: u.bonus, deposito: u.deposito } });
});

// Lista pedidos de saque (admin)
app.get('/api/admin/saques', (req, res) => {
  const { sessionToken, cpf } = req.query;
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  const tokenKey = sessionToken && db.sessions.get(sessionToken);
  const u = cpfLimpo && db.users.get(cpfLimpo);
  if (!u || tokenKey !== cpfLimpo || u.sessionToken !== sessionToken || !u.admin) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  res.json({ saques: db.listSaques() });
});

// Resolve pedido de saque: aprovar (já debitado) ou recusar (estorna)
app.post('/api/admin/saque', requireAdmin, async (req, res) => {
  const { id, status } = req.body || {};
  if (typeof id !== 'string' || !['pago', 'recusado'].includes(status)) return res.status(400).json({ error: 'status inválido' });
  const pedido = (await db.listSaques()).find((x) => x.id === id);
  if (!pedido) return res.status(404).json({ error: 'pedido não encontrado' });
  if (pedido.status !== 'pendente') return res.status(400).json({ error: 'pedido já resolvido' });
  if (status === 'recusado') {
    const u = db.users.get(pedido.cpf);
    if (u) { u.balance = +(u.balance + pedido.valor).toFixed(2); db.markDirty(pedido.cpf); db.saveUsers(); }
  }
  await db.updateSaque(id, status);
  // Notifica o jogador sobre a alteração de saldo (estorno ou confirmação).
  if (pedido.cpf) {
    try {
      const io = require('./src/socket')._io;
      if (io) io.of('/').sockets.forEach((s) => {
        if (s.data.cpf === pedido.cpf) {
          const u2 = db.users.get(pedido.cpf);
          s.emit('saldo', { balance: u2.balance, bonus: u2.bonus, deposito: u2.deposito, saldoJogavel: db.saldoJogavel(pedido.cpf) });
        }
      });
    } catch (e) {}
  }
  res.json({ ok: true, pedido: { id, status } });
});

// Lista pedidos de depósito (admin)
app.get('/api/admin/depositos', async (req, res) => {
  const { sessionToken, cpf } = req.query;
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  const tokenKey = sessionToken && db.sessions.get(sessionToken);
  const u = cpfLimpo && db.users.get(cpfLimpo);
  if (!u || tokenKey !== cpfLimpo || u.sessionToken !== sessionToken || !u.admin) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  res.json({ depositos: await db.listDepositos() });
});

// Resolve pedido de depósito: aprovar (credita saldo) ou recusar (não credita)
app.post('/api/admin/deposito', requireAdmin, async (req, res) => {
  const { id, status } = req.body || {};
  if (typeof id !== 'string' || !['pago', 'recusado'].includes(status)) return res.status(400).json({ error: 'status inválido' });
  const pedido = (await db.listDepositos()).find((x) => x.id === id);
  if (!pedido) return res.status(404).json({ error: 'pedido não encontrado' });
  // Crédito idempotente: só credita se ainda estiver pendente.
  const atualizado = await db.updateDepositoAtomico(id, status);
  if (!atualizado) return res.status(400).json({ error: 'pedido já resolvido' });
  if (status === 'pago') {
    const u = db.users.get(pedido.cpf);
    if (!u) return res.status(404).json({ error: 'usuário não encontrado' });
    u.balance = +(u.balance + pedido.valor).toFixed(2);
    db.markDirty(pedido.cpf);
    db.saveUsers();
  }
  if (pedido.cpf) {
    try {
      const io = require('./src/socket')._io;
      if (io) io.of('/').sockets.forEach((s) => {
        if (s.data.cpf === pedido.cpf) {
          const u2 = db.users.get(pedido.cpf);
          s.emit('saldo', { balance: u2.balance, bonus: u2.bonus, deposito: u2.deposito, saldoJogavel: db.saldoJogavel(pedido.cpf) });
        }
      });
    } catch (e) {}
  }
  res.json({ ok: true, pedido: { id, status } });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Status de um pedido de depósito (usado ao retornar do checkout).
app.get('/api/deposito/status', (req, res) => {
  const { sessionToken, cpf, orderNsu } = req.query;
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  const tokenKey = sessionToken && db.sessions.get(sessionToken);
  const u = cpfLimpo && db.users.get(cpfLimpo);
  if (!u || tokenKey !== cpfLimpo || u.sessionToken !== sessionToken) {
    return res.status(401).json({ error: 'Sessão inválida.' });
  }
  const pedido = orderNsu && db.findDepositoByOrder(orderNsu);
  if (!pedido) return res.status(404).json({ error: 'pedido não encontrado' });
  res.json({ ok: true, status: pedido.status, valor: pedido.valor });
});

// ===== Depósito (jogador registra PIX pago com a chave do admin; aguarda aprovação) =====
app.post('/api/deposito', async (req, res) => {
  const { sessionToken, cpf, valor, pix } = req.body || {};
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  const tokenKey = sessionToken && db.sessions.get(sessionToken);
  const u = cpfLimpo && db.users.get(cpfLimpo);
  if (!u || tokenKey !== cpfLimpo || u.sessionToken !== sessionToken) {
    return res.status(401).json({ error: 'Sessão inválida.' });
  }
  const v = parseFloat(String(valor).replace(',', '.'));
  if (!v || v < 5) return res.status(400).json({ error: 'Valor mínimo de depósito é R$ 5,00.' });
  const chave = String(pix || '').trim();
  if (!chave) return res.status(400).json({ error: 'Informe a chave Pix.' });
  const correlationID = 'D' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pedido = await db.addDeposito({
    id: correlationID,
    cpf: cpfLimpo,
    nome: u.nome,
    valor: +v.toFixed(2),
    pix: chave,
    status: 'pendente',
    orderNsu: correlationID,
    createdAt: Date.now(),
  });
  res.json({ ok: true, pedido: { id: pedido.id, valor: pedido.valor, status: pedido.status } });
});

// ===== Webhook da OpenPix (opcional, caso use gateway no futuro) =====
app.post('/api/webhook/openpix', async (req, res) => {
  try {
    const body = req.body || {};
    const evento = body.evento || (body.data && body.data.evento) || (body.webhook && body.webhook.evento);
    const charge = (body.payload && body.payload.charge) || (body.data && body.data.payload && body.data.payload.charge) || body.charge;
    if (!charge || !charge.correlationID) return res.status(400).json({ error: 'correlationID ausente' });
    if (evento && evento !== 'charge.completed' && charge.status !== 'COMPLETED' && charge.status !== 'paid') {
      return res.json({ ok: true, ignorado: true });
    }
    const correlationID = charge.correlationID;
    const pedido = await db.findDepositoByOrder(correlationID);
    if (!pedido) return res.status(400).json({ error: 'pedido não encontrado' });
    const amountCents = charge.value;
    if (amountCents != null && Math.round(pedido.valor * 100) !== Math.round(Number(amountCents))) {
      console.error('[openpix webhook] valor não confere', pedido.valor, amountCents);
      return res.status(400).json({ error: 'valor não confere' });
    }
    const atualizado = await db.updateDepositoAtomico(pedido.id, 'pago');
    if (!atualizado) return res.json({ ok: true, status: 'ja_creditado' });
    const u = db.users.get(pedido.cpf);
    if (!u) return res.status(404).json({ error: 'usuário não encontrado' });
    u.balance = +(u.balance + pedido.valor).toFixed(2);
    db.markDirty(pedido.cpf);
    db.saveUsers();
    try {
      const io = require('./src/socket')._io;
      if (io) io.of('/').sockets.forEach((s) => {
        if (s.data.cpf === pedido.cpf) {
          const u2 = db.users.get(pedido.cpf);
          s.emit('saldo', { balance: u2.balance, bonus: u2.bonus, deposito: u2.deposito, saldoJogavel: db.saldoJogavel(pedido.cpf) });
        }
      });
    } catch (e) {}
    return res.json({ ok: true, status: 'creditado' });
  } catch (e) {
    console.error('[webhook openpix] erro:', e.message);
    return res.status(400).json({ error: 'erro no webhook' });
  }
});

// ===== Webhook da InfinitePay (confirmação automática de pagamento) =====
app.post('/api/webhook/infinitepay', async (req, res) => {
  try {
    const body = req.body || {};
    // Corpo documentado: { invoice_slug, amount, paid_amount, capture_method, transaction_nsu, order_nsu, receipt_url, ... }
    const orderNsu = body.order_nsu || (body.data && body.data.order_nsu);
    if (!orderNsu) return res.status(400).json({ error: 'order_nsu ausente' });

    // Validação opcional de assinatura (se INFINITEPay_WEBHOOK_SECRET configurado).
    const secret = process.env.INFINITEPay_WEBHOOK_SECRET;
    if (secret) {
      const sig = req.headers['x-infinitepay-signature'] || req.headers['x-signature'];
      if (sig) {
        const crypto = require('crypto');
        const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
        if (sig !== expected) return res.status(401).json({ error: 'assinatura inválida' });
      }
    }

    const pedido = await db.findDepositoByOrder(orderNsu);
    if (!pedido) return res.status(400).json({ error: 'pedido não encontrado' });

    // Valida se o valor pago confere com o pedido (evita crédito fraudulento).
    const amountCents = body.amount || body.paid_amount;
    if (amountCents != null && Math.round(pedido.valor * 100) !== Math.round(Number(amountCents))) {
      console.error('[webhook] valor não confere', pedido.valor, amountCents);
      return res.status(400).json({ error: 'valor não confere' });
    }

    // Crédito idempotente: só credita se ainda estiver pendente.
    const atualizado = await db.updateDepositoAtomico(pedido.id, 'pago');
    if (!atualizado) return res.json({ ok: true, status: 'ja_creditado' });

    const u = db.users.get(pedido.cpf);
    if (!u) return res.status(404).json({ error: 'usuário não encontrado' });
    u.balance = +(u.balance + pedido.valor).toFixed(2);
    db.markDirty(pedido.cpf);
    db.saveUsers();

    try {
      const io = require('./src/socket')._io;
      if (io) io.of('/').sockets.forEach((s) => {
        if (s.data.cpf === pedido.cpf) {
          const u2 = db.users.get(pedido.cpf);
          s.emit('saldo', { balance: u2.balance, bonus: u2.bonus, deposito: u2.deposito, saldoJogavel: db.saldoJogavel(pedido.cpf) });
        }
      });
    } catch (e) {}

    return res.json({ ok: true, status: 'creditado' });
  } catch (e) {
    console.error('[webhook infinitepay] erro:', e.message);
    return res.status(400).json({ error: 'erro no webhook' });
  }
});

// ===== Saque (jogador solicita) =====
// Autentica pela sessão e debita o saldo como "reservado" (status pendente).
app.post('/api/saque', (req, res) => {
  const { sessionToken, cpf, valor, pix } = req.body || {};
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  const tokenKey = sessionToken && db.sessions.get(sessionToken);
  const u = cpfLimpo && db.users.get(cpfLimpo);
  if (!u || tokenKey !== cpfLimpo || u.sessionToken !== sessionToken) {
    return res.status(401).json({ error: 'Sessão inválida.' });
  }
  const v = parseFloat(String(valor).replace(',', '.'));
  if (!v || v < 1) return res.status(400).json({ error: 'Valor mínimo de saque é R$ 1,00.' });
  const chave = String(pix || u.chavePix || '').trim();
  if (!chave) return res.status(400).json({ error: 'Informe uma chave Pix.' });
  if (u.balance < v) return res.status(400).json({ error: 'Saldo insuficiente para este saque.' });
  // Reserva o valor (debita agora; admin estorna se recusar).
  u.balance = +(u.balance - v).toFixed(2);
  db.markDirty(cpfLimpo);
  db.saveUsers();
  const pedido = db.addSaque({
    id: 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    cpf: cpfLimpo,
    nome: u.nome,
    valor: +v.toFixed(2),
    pix: chave,
    status: 'pendente',
    createdAt: Date.now(),
  });
  res.json({ ok: true, saldo: u.balance, pedido: { id: pedido.id, valor: pedido.valor, status: pedido.status } });
});

// Endpoints de TESTE (apenas com TEST=1): forçam vitórias para validação.
// Requerem também o header x-test-secret igual a TEST_SECRET (nunca ligar em produção).
if (process.env.TEST) {
  function authToken(req) {
    const token = req.headers.authorization && req.headers.authorization.replace('Bearer ', '');
    const secret = req.headers['x-test-secret'];
    if (process.env.TEST_SECRET && secret !== process.env.TEST_SECRET) return null;
    return token && db.sessions.get(token);
  }

  app.post('/api/_test_force_kuadra', (req, res) => {
    const key = authToken(req);
    if (!key) return res.status(401).json({ error: 'no auth' });
    if (core.state.status !== 'running') return res.status(400).json({ error: 'not running' });
    const card = [
      [1, 2, 3, '', '', '', '', '', 4],
      ['', '', '', '', '', '', '', '', ''],
      [5, 6, 7, '', '', '', '', '', 8],
    ];
    if (core.state.drawnBalls.length === 0) core.state.drawnBalls.push(1, 2, 3, 4, 5, 6, 7, 8);
    core.state.currentBall = 8;
    const idx = (++core.cardSeq);
    core.roundCards.set(idx, { id: idx, owner: key, card });
    round.checarVencedores();
    round.broadcastState();
    res.json({ ok: true, forced: true });
  });

  app.post('/api/_test_force_keno', (req, res) => {
    const key = authToken(req);
    if (!key) return res.status(401).json({ error: 'no auth' });
    if (core.state.status !== 'running') return res.status(400).json({ error: 'not running' });
    const card = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [10, 11, 12, 13, 14, 15, 16, 17, 18],
      [19, 20, 21, 22, 23, 24, 25, 26, 27],
    ];
    if (core.state.drawnBalls.length === 0) core.state.drawnBalls.push(...Array.from({ length: 27 }, (_, i) => i + 1));
    core.state.currentBall = 27;
    const idx = (++core.cardSeq);
    core.roundCards.set(idx, { id: idx, owner: key, card });
    round.checarVencedores();
    if (core.state.winners.keno) round.finalizarRodada();
    res.json({ ok: true, forced: true });
  });

  app.post('/api/_test_novarodada', (req, res) => {
    round.comecarRodada();
    res.json({ ok: true });
  });
}

socket.init(server);

// Inicia a primeira rodada após carregar os usuários (PostgreSQL ou arquivo).
(async function boot() {
  await db.initDB();
  // Garante nomes de pessoas nos bots conhecidos (remove eventuais "Robo ...").
  for (const b of bots.BOT_DEFS) {
    const u = db.users.get(b.cpf);
    if (u && u.nome !== b.nome) { u.nome = b.nome; db.markDirty(b.cpf); }
  }
  db.saveUsers();
  const retomou = await round.restaurarRodada();
  if (!retomou) round.comecarRodada();

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Bingo VIP Club rodando em http://localhost:${PORT}`);
  });
})();
