const path = require('path');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const game = require('./game');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== Config do jogo =====
const DRAW_INTERVAL = parseInt(process.env.DRAW_INTERVAL) || 3000; // ms entre bolas
const INTERMISSION = parseInt(process.env.INTERMISSION) || 60000; // ms de intervalo entre rodadas (compra + contagem regressiva)
const PRIZES = { kuadra: 20, kina: 30, keno: 100, acumulado: 1000 };
const ACUMULADO_BALLS = 35; // fecha a cartela (Keno) até essa bola para ganhar o acumulado
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(16).toString('hex');

// ===== "Banco de dados" em memória (persistido em users.json) =====
// users: cpf -> { cpf, nome, email, chavePix, password(hash), balance, sessionToken }
const users = new Map();
// sessions: token -> cpf
const sessions = new Map();

const USERS_FILE = path.join(__dirname, 'users.json');
function loadUsers() {
  try {
    const raw = require('fs').readFileSync(USERS_FILE, 'utf8');
    const arr = JSON.parse(raw);
    for (const u of arr) users.set(u.cpf, u);
    console.log('[users] carregados', users.size, 'do users.json');
  } catch (e) { /* arquivo inexistente ou vazio: começa vazio */ }
}
function saveUsers() {
  try {
    const arr = Array.from(users.values());
    require('fs').writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2));
  } catch (e) { console.error('[users] falha ao salvar', e.message); }
}
loadUsers();
// cards da rodada atual: cardId -> { id, owner, nums }
let roundCards = new Map();
let cardSeq = 5000;
let sorteioSeq = 131937;

function hash(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}
function newToken() {
  return crypto.randomBytes(24).toString('hex');
}
function validarCPF(cpf) {
  const nums = String(cpf).replace(/\D/g, '');
  if (nums.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(nums)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(nums[i]) * (10 - i);
  let d1 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (parseInt(nums[9]) !== d1) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(nums[i]) * (11 - i);
  let d2 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (parseInt(nums[10]) !== d2) return false;
  return true;
}
function ensureUser(cpf, dados) {
  const key = cpf.replace(/\D/g, '');
  if (!users.has(key)) {
    const u = Object.assign(
      { cpf: key, password: hash(dados.senha || ''), balance: 10.0, sessionToken: null },
      dados
    );
    u.password = hash(dados.senha || '');
    users.set(key, u);
    saveUsers();
  }
  return users.get(key);
}

// ===== Estado do jogo (rodada) =====
let state = {};
function novaRodada() {
  roundCards = new Map();
  sorteioSeq++;
  state = {
    sorteio: sorteioSeq,
    status: 'intermission', // intermission | running | finished
    drawnBalls: [],
    currentBall: null,
    phaseIndex: 0,
    winners: { kuadra: null, kina: null, keno: null },
    startsAt: Date.now() + INTERMISSION,
  };
  broadcastState();
  clearInterval(drawTimer);
  drawTimer = null;
  emitMyCardsParaTodos();
  if (process.env.BOTS === '1') botComprarCartelas();
  setTimeout(iniciarSorteio, INTERMISSION);
}

// ===== Bots de teste (apenas com BOTS=1) =====
const BOT_DEFS = [
  { cpf: '11111111111', nome: 'Robo Ana' },
  { cpf: '22222222222', nome: 'Robo Beto' },
  { cpf: '33333333333', nome: 'Robo Caio' },
  { cpf: '44444444444', nome: 'Robo Duda' },
  { cpf: '55555555555', nome: 'Robo Eva' },
  { cpf: '66666666666', nome: 'Robo Fe' },
  { cpf: '77777777777', nome: 'Robo Gus' },
  { cpf: '88888888888', nome: 'Robo Lia' },
  { cpf: '99999999999', nome: 'Robo Max' },
  { cpf: '12121212121', nome: 'Robo Nico' },
];
function garantirBots() {
  for (const b of BOT_DEFS) {
    if (!users.has(b.cpf)) {
      users.set(b.cpf, { cpf: b.cpf, nome: b.nome, email: b.cpf + '@bot', chavePix: b.cpf, password: 'bot', balance: 999, sessionToken: null });
    }
  }
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function botComprarCartelas() {
  garantirBots();
  for (const b of BOT_DEFS) {
    const qtd = randInt(1, 3);
    for (let i = 0; i < qtd; i++) {
      const id = ++cardSeq;
      roundCards.set(id, { id, owner: b.cpf, card: game.generateBingoCard() });
    }
  }
  broadcastState();
  emitMyCardsParaTodos();
}

let drawTimer = null;
function iniciarSorteio() {
  state.status = 'running';
  state.startsAt = null;
  broadcastState();
  drawTimer = setInterval(sortearBola, DRAW_INTERVAL);
}

function sortearBola() {
  const restantes = [];
  for (let i = 1; i <= 90; i++) if (!state.drawnBalls.includes(i)) restantes.push(i);
  if (restantes.length === 0 || state.winners.keno) {
    finalizarRodada();
    return;
  }
  const n = restantes[Math.floor(Math.random() * restantes.length)];
  state.drawnBalls.push(n);
  state.currentBall = n;

  checarVencedores();
  broadcastState();

  if (state.winners.keno || state.drawnBalls.length >= 90) finalizarRodada();
}

function pagar(owner, valor) {
  const u = users.get(owner);
  if (u) {
    u.balance += valor;
    saveUsers();
    emitSaldoParaUser(owner);
  }
}

function checarVencedores() {
  for (const phase of game.PHASE_SEQUENCE) {
    if (state.winners[phase]) continue;

    // Coleta TODAS as cartelas que fecharam esta fase nesta bola (pode haver empate).
    const cartelasVencedoras = [];
    for (const c of roundCards.values()) {
      const ev = game.evaluateCard(c.card, state.drawnBalls);
      if (ev[phase].done) cartelasVencedoras.push(c);
    }
    if (cartelasVencedoras.length === 0) continue;

    // Cada vencedor recebe o prêmio da fase. Agrupa por jogador (pode ter várias cartelas).
    const porJogador = new Map();
    for (const c of cartelasVencedoras) {
      const u = users.get(c.owner);
      const nome = u ? u.nome : c.owner;
      if (!porJogador.has(c.owner)) {
        porJogador.set(c.owner, { name: nome, owner: c.owner, cardIds: [], prize: 0 });
      }
      const info = porJogador.get(c.owner);
      info.cardIds.push(c.id);
      info.prize += PRIZES[phase];
      pagar(c.owner, PRIZES[phase]);
    }

    const vencedores = [...porJogador.values()];
    state.winners[phase] = {
      vencedores,
      name: vencedores.map((v) => v.name).join(', '),
      prize: PRIZES[phase],
    };
    io.emit('winner', { phase, prize: PRIZES[phase], vencedores });

    // Pausa o sorteio durante a animação de vitória para dar espaço aos jogadores.
    if (drawTimer) { clearInterval(drawTimer); drawTimer = null; }
    const faseAtual = phase;
    setTimeout(() => {
      // Só retoma se a rodada ainda estiver ativa e não for a última fase (Keno encerra tudo).
      if (faseAtual !== 'keno' && state.status === 'running' && !state.winners.keno) {
        drawTimer = setInterval(sortearBola, DRAW_INTERVAL);
      }
    }, 3500);
  }

  // Acumulado: Keno fechado até a bola ACUMULADO_BALLS => prêmio extra para os vencedores do Keno.
  if (state.winners.keno && !state.winners.acumulado && state.drawnBalls.length <= ACUMULADO_BALLS) {
    const porJogador = new Map();
    for (const v of state.winners.keno.vencedores) {
      const owner = v.owner || v.name;
      if (!porJogador.has(owner)) porJogador.set(owner, { name: v.name, owner, cardIds: [], prize: 0 });
      const info = porJogador.get(owner);
      info.cardIds.push(...v.cardIds);
      info.prize += PRIZES.acumulado;
      pagar(owner, PRIZES.acumulado);
    }
    const vencedores = [...porJogador.values()];
    state.winners.acumulado = { vencedores, name: vencedores.map((v) => v.name).join(', '), prize: PRIZES.acumulado };
    io.emit('jackpot', { prize: PRIZES.acumulado, vencedores, balls: state.drawnBalls.length });
  }
}

function finalizarRodada() {
  clearInterval(drawTimer);
  drawTimer = null;
  state.status = 'finished';
  broadcastState();
  setTimeout(novaRodada, 6000);
}

// ===== Broadcast =====
function publicState() {
  const players = [];
  const porOwner = new Map();
  for (const card of roundCards.values()) {
    if (!porOwner.has(card.owner)) porOwner.set(card.owner, []);
    porOwner.get(card.owner).push(card);
  }
  // Fase em disputa = primeira fase da sequência ainda sem vencedor.
  let phaseIndex = game.PHASE_SEQUENCE.findIndex((p) => !state.winners[p]);
  if (phaseIndex === -1) phaseIndex = game.PHASE_SEQUENCE.length - 1;
  const phaseAtual = game.PHASE_SEQUENCE[phaseIndex];

  for (const [owner, cards] of porOwner) {
    const u = users.get(owner);
    let melhorFalta = 99;
    for (const c of cards) {
      const f = game.faltaForPhase(c.card, state.drawnBalls, phaseAtual);
      if (f < melhorFalta) melhorFalta = f;
    }
    players.push({ id: u ? u.cpf : owner, name: u ? u.nome : owner, falta: melhorFalta });
  }
  players.sort((a, b) => a.falta - b.falta);

  // Painel "quem está perto de ganhar": para cada fase, UMA entrada por jogador
  // (a cartela dele mais próxima de ganhar), em ordem crescente de quem falta menos bolas.
  const rankingPorFase = {};
  for (const phase of game.PHASE_SEQUENCE) {
    const porOwner = new Map();
    for (const c of roundCards.values()) {
      const ev = game.evaluateCard(c.card, state.drawnBalls);
      const fase = ev[phase];
      if (fase.done) continue; // já ganhou essa fase
      const faltantes = game.missingForPhase(c.card, state.drawnBalls, phase);
      const atual = porOwner.get(c.owner);
      // mantém a cartela com menor falta (desempate: menor id)
      if (!atual || fase.falta < atual.falta || (fase.falta === atual.falta && c.id < atual.cardId)) {
        porOwner.set(c.owner, { cardId: c.id, falta: fase.falta, faltantes });
      }
    }
    const lista = [];
    for (const [owner, melhor] of porOwner) {
      const u = users.get(owner);
      lista.push({
        cardId: melhor.cardId,
        owner,
        name: u ? u.nome : owner,
        falta: melhor.falta,
        faltantes: melhor.faltantes,
      });
    }
    lista.sort((a, b) => a.falta - b.falta || a.cardId - b.cardId);
    rankingPorFase[phase] = lista;
  }

  return {
    sorteio: state.sorteio,
    status: state.status,
    drawnBalls: state.drawnBalls,
    currentBall: state.currentBall,
    phaseIndex,
    winners: state.winners,
    startsAt: state.startsAt,
    prizes: PRIZES,
    acumuladoBalls: ACUMULADO_BALLS,
    acumuladoAberto: !state.winners.keno && state.drawnBalls.length <= ACUMULADO_BALLS,
    cardCost: game.CARD_COST,
    players,
    ranking: rankingPorFase,
    totalCards: roundCards.size,
  };
}

function broadcastState() {
  io.emit('state', publicState());
}

function cardsDoUser(owner) {
  const list = [];
  for (const c of roundCards.values()) if (c.owner === owner) list.push({ id: c.id, card: c.card });
  return list;
}

function emitMyCardsParaTodos() {
  for (const [id, s] of io.of('/').sockets) {
    const owner = s.data.cpf;
    if (owner) s.emit('myCards', cardsDoUser(owner));
  }
}

function emitSaldoParaUser(owner) {
  const u = users.get(owner);
  if (!u) return;
  for (const [id, s] of io.of('/').sockets) {
    if (s.data.cpf === owner) {
      s.emit('saldo', { balance: u.balance });
      s.emit('myCards', cardsDoUser(owner));
    }
  }
}

// ===== REST auth =====
function loginResponse(u, res) {
  const token = newToken();
  u.sessionToken = token;
  sessions.set(token, u.cpf);
  saveUsers();
  res.json({ sessionToken: token, cpf: u.cpf, nome: u.nome, email: u.email, balance: u.balance });
}

app.post('/api/register', (req, res) => {
  const { nome, cpf, email, senha, confirma, chavePix } = req.body || {};
  if (!nome || !cpf || !email || !senha || !chavePix) return res.status(400).json({ error: 'Preencha todos os campos.' });
  const cpfLimpo = String(cpf).replace(/\D/g, '');
  if (!validarCPF(cpfLimpo)) return res.status(400).json({ error: 'CPF inválido.' });
  if (senha.length < 4) return res.status(400).json({ error: 'Senha deve ter no mínimo 4 caracteres.' });
  if (senha !== confirma) return res.status(400).json({ error: 'Senhas não conferem.' });
  if (users.has(cpfLimpo)) return res.status(400).json({ error: 'CPF já cadastrado.' });
  const u = ensureUser(cpfLimpo, { nome: nome.trim(), email: email.trim(), chavePix: chavePix.trim(), senha });
  loginResponse(u, res);
});

app.post('/api/login', (req, res) => {
  const { cpf, senha } = req.body || {};
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  if (!cpfLimpo || !senha) return res.status(400).json({ error: 'Informe CPF e senha.' });
  const u = users.get(cpfLimpo);
  if (!u || u.password !== hash(senha)) return res.status(401).json({ error: 'CPF ou senha incorretos.' });
  loginResponse(u, res);
});

// Login demo: conta de teste pronta (sobe com BOTS=1 / demo)
const DEMO_CPF = '00000000000';
const DEMO_SENHA = 'demo123';
app.post('/api/login-demo', (req, res) => {
  const nomeReq = (req.body && req.body.nome || '').trim();
  if (!users.has(DEMO_CPF)) {
    users.set(DEMO_CPF, {
      cpf: DEMO_CPF, nome: nomeReq || 'Demo Jogador', email: 'demo@demo.com',
      chavePix: 'demo@demo.com', password: hash(DEMO_SENHA), balance: 50.0, sessionToken: null,
    });
    saveUsers();
  }
  const u = users.get(DEMO_CPF);
  if (nomeReq) { u.nome = nomeReq; saveUsers(); }
  loginResponse(u, res);
});

app.post('/api/validar-sessao', (req, res) => {
  const { sessionToken, cpf } = req.body || {};
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  const tokenKey = sessionToken && sessions.get(sessionToken);
  const u = users.get(cpfLimpo);
  if (u && tokenKey === cpfLimpo && u.sessionToken === sessionToken) {
    res.json({ valido: true, nome: u.nome, cpf: u.cpf, email: u.email, balance: u.balance });
  } else {
    res.json({ valido: false });
  }
});

// Estado atual (apenas com TEST=1) para inspecao/debug
if (process.env.TEST) {
  app.get('/api/state', (req, res) => res.json(publicState()));
}

// Endpoint de TESTE (apenas com TEST=1): injeta cartela de kuadra já fechada para forçar vitória.
if (process.env.TEST) {
  app.post('/api/_test_force_kuadra', (req, res) => {
    const token = req.headers.authorization && req.headers.authorization.replace('Bearer ', '');
    const key = token && sessions.get(token);
    if (!key) return res.status(401).json({ error: 'no auth' });
    if (state.status !== 'running') return res.status(400).json({ error: 'not running' });
    const card = [
      [1, 2, 3, '', '', '', '', '', 4],
      ['', '', '', '', '', '', '', '', ''],
      [5, 6, 7, '', '', '', '', '', 8],
    ];
    if (state.drawnBalls.length === 0) state.drawnBalls.push(1, 2, 3, 4, 5, 6, 7, 8);
    state.currentBall = 8;
    const idx = (++cardSeq);
    roundCards.set(idx, { id: idx, owner: key, card });
    checarVencedores();
    res.json({ ok: true, forced: true });
  });

  app.post('/api/_test_force_keno', (req, res) => {
    const token = req.headers.authorization && req.headers.authorization.replace('Bearer ', '');
    const key = token && sessions.get(token);
    if (!key) return res.status(401).json({ error: 'no auth' });
    if (state.status !== 'running') return res.status(400).json({ error: 'not running' });
    const card = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [10, 11, 12, 13, 14, 15, 16, 17, 18],
      [19, 20, 21, 22, 23, 24, 25, 26, 27],
    ];
    if (state.drawnBalls.length === 0) state.drawnBalls.push(...Array.from({length:27},(_,i)=>i+1));
    state.currentBall = 27;
    const idx = (++cardSeq);
    roundCards.set(idx, { id: idx, owner: key, card });
    checarVencedores();
    if (state.winners.keno) finalizarRodada();
    res.json({ ok: true, forced: true });
  });

  app.post('/api/_test_novarodada', (req, res) => {
    novaRodada();
    res.json({ ok: true });
  });
}

// ===== Socket.IO =====
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  const key = token && sessions.get(token);
  if (!key || !users.has(key)) return next(new Error('unauthorized'));
  socket.data.cpf = key;
  next();
});

io.on('connection', (socket) => {
  const owner = socket.data.cpf;
  const u = users.get(owner);
  socket.emit('state', publicState());
  socket.emit('saldo', { balance: u.balance });
  socket.emit('myCards', cardsDoUser(owner));

  socket.on('comprar', (qtd, cb) => {
    qtd = Math.max(1, Math.min(200, parseInt(qtd) || 1));
    const custo = qtd * game.CARD_COST;
    if (state.status === 'running') {
      return cb && cb({ error: 'Aguarde o intervalo para comprar cartelas.' });
    }
    if (u.balance < custo) return cb && cb({ error: 'Saldo insuficiente.' });
    u.balance = +(u.balance - custo).toFixed(2);
    saveUsers();
    for (let i = 0; i < qtd; i++) {
      const id = ++cardSeq;
      roundCards.set(id, { id, owner, card: game.generateBingoCard() });
    }
    socket.emit('saldo', { balance: u.balance });
    socket.emit('myCards', cardsDoUser(owner));
    broadcastState();
    cb && cb({ ok: true, balance: u.balance });
  });
});

novaRodada();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Bingo VIP Club rodando em http://localhost:${PORT}`);
});
