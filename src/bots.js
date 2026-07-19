const game = require('./game');
const core = require('./game-core');
const db = require('./db');

// ===== Bots de teste (apenas com BOTS=1) =====
const BOT_DEFS = [
  { cpf: '11111111111', nome: 'Ana Lima' },
  { cpf: '22222222222', nome: 'Beto Souza' },
  { cpf: '33333333333', nome: 'Caio Ferreira' },
  { cpf: '44444444444', nome: 'Duda Martins' },
  { cpf: '55555555555', nome: 'Eva Cardoso' },
  { cpf: '66666666666', nome: 'Felipe Rocha' },
  { cpf: '77777777777', nome: 'Gustavo Dias' },
  { cpf: '88888888888', nome: 'Lia Pereira' },
  { cpf: '99999999999', nome: 'Marcos Alves' },
  { cpf: '12121212121', nome: 'Nicole Castro' },
];

function garantirBots(users) {
  for (const b of BOT_DEFS) {
    if (!users.has(b.cpf)) {
      users.set(b.cpf, { cpf: b.cpf, nome: b.nome, email: b.cpf + '@bot', chavePix: b.cpf, password: 'bot', balance: 999, sessionToken: null });
    } else {
      // Sempre atualiza o nome para remover eventuais "Robo ..." antigos.
      const u = users.get(b.cpf);
      if (u && u.nome !== b.nome) { u.nome = b.nome; db.markDirty(b.cpf); }
    }
  }
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function botComprarCartelas(roundCards, users) {
  garantirBots(users);
  for (const b of BOT_DEFS) {
    const qtd = randInt(1, 3);
    for (let i = 0; i < qtd; i++) {
      const id = ++core.cardSeq;
      roundCards.set(id, { id, owner: b.cpf, card: game.generateBingoCard() });
    }
  }
}

module.exports = {
  BOT_DEFS,
  garantirBots,
  botComprarCartelas,
};
