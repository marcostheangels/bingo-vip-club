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
      s.emit('saldo', { balance: u.balance, bonus: u.bonus, deposito: u.deposito, saldoJogavel: db.saldoJogavel(owner) });
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
    const emitirEstado = () => {
      if (process.env.BINGO_DEBUG) console.log('[socket] emitirEstado -> cpf=' + owner + ' status=' + core.state.status + ' sorteio=' + core.state.sorteio);
      socket.emit('state', round.publicState());
      socket.emit('saldo', { balance: u.balance, bonus: u.bonus, deposito: u.deposito, saldoJogavel: db.saldoJogavel(owner) });
      socket.emit('myCards', round.cardsDoUser(owner));
    };
    emitirEstado();
    // Cliente pede estado explícito (ex.: após reconexão) para não ficar com tela congelada.
    socket.on('requestState', emitirEstado);

    socket.on('comprar', (qtd, cb) => {
      // Limite rígido por compra (não confia no cliente).
      qtd = Math.max(1, Math.min(200, parseInt(qtd) || 1));
      // Limite total de cartelas do jogador nesta rodada (evita travar o servidor
      // com milhares de cartelas de uma vez).
      const MAX_CARTAS_POR_JOGADOR = 300;
      let minhas = 0;
      for (const c of core.roundCards.values()) if (c.owner === owner) minhas++;
      if (minhas + qtd > MAX_CARTAS_POR_JOGADOR) {
        qtd = Math.max(0, MAX_CARTAS_POR_JOGADOR - minhas);
        if (qtd <= 0) return cb && cb({ error: `Limite de ${MAX_CARTAS_POR_JOGADOR} cartelas por rodada atingido.` });
      }
      const custo = qtd * (core.state.cardCost || game.CARD_COST_BASE);
      if (core.state.status === 'running') {
        return cb && cb({ error: 'Aguarde o intervalo para comprar cartelas.' });
      }
      if (db.saldoJogavel(owner) < custo) return cb && cb({ error: 'Saldo insuficiente.' });
      db.debitarParaJogar(owner, custo);
      db.addHouse(custo); // receita da casa (só jogadores reais compram por aqui)
      db.saveUsers();
      for (let i = 0; i < qtd; i++) {
        const id = ++core.cardSeq;
        core.roundCards.set(id, { id, owner, card: game.generateBingoCard() });
      }
      core.state.totalCardsVendidos = (core.state.totalCardsVendidos || 0) + qtd;
      socket.emit('saldo', { balance: u.balance, bonus: u.bonus, deposito: u.deposito, saldoJogavel: db.saldoJogavel(owner) });
      socket.emit('myCards', round.cardsDoUser(owner));
      round.broadcastState();
      cb && cb({ ok: true, balance: u.balance });
    });
  });

  return io;
}

module.exports = { init, emitSaldoParaUser, emitMyCardsParaTodos, _io: () => io };
