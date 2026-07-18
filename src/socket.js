const { Server } = require('socket.io');
const db = require('./db');
const game = require('./game');
const core = require('./game-core');
const round = require('./round');

let io = null;

function emitSaldoParaUser(owner) {
  const u = db.users.get(owner);
  if (!u) return;
  for (const [, s] of io.of('/').sockets) {
    if (s.data.cpf === owner) {
      s.emit('saldo', { balance: u.balance });
      s.emit('myCards', round.cardsDoUser(owner));
    }
  }
}

function emitMyCardsParaTodos() {
  for (const [, s] of io.of('/').sockets) {
    const owner = s.data.cpf;
    if (owner) s.emit('myCards', round.cardsDoUser(owner));
  }
}

function init(server) {
  io = new Server(server);

  // Passa io + hooks para o módulo de rodada.
  round.init(io, { emitSaldoParaUser, emitMyCardsParaTodos });

  // ===== Socket.IO auth =====
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const key = token && db.sessions.get(token);
    if (!key || !db.users.has(key)) return next(new Error('unauthorized'));
    socket.data.cpf = key;
    next();
  });

  io.on('connection', (socket) => {
    const owner = socket.data.cpf;
    const u = db.users.get(owner);
    socket.emit('state', round.publicState());
    socket.emit('saldo', { balance: u.balance });
    socket.emit('myCards', round.cardsDoUser(owner));

    socket.on('comprar', (qtd, cb) => {
      qtd = Math.max(1, Math.min(200, parseInt(qtd) || 1));
      const custo = qtd * game.CARD_COST;
      if (core.state.status === 'running') {
        return cb && cb({ error: 'Aguarde o intervalo para comprar cartelas.' });
      }
      if (u.balance < custo) return cb && cb({ error: 'Saldo insuficiente.' });
      u.balance = +(u.balance - custo).toFixed(2);
      db.saveUsers();
      for (let i = 0; i < qtd; i++) {
        const id = ++core.cardSeq;
        core.roundCards.set(id, { id, owner, card: game.generateBingoCard() });
      }
      socket.emit('saldo', { balance: u.balance });
      socket.emit('myCards', round.cardsDoUser(owner));
      round.broadcastState();
      cb && cb({ ok: true, balance: u.balance });
    });
  });

  return io;
}

module.exports = { init, emitSaldoParaUser, emitMyCardsParaTodos };
