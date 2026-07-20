const game = require('./game');
const core = require('./game-core');
const db = require('./db');

const FIRST_NAMES = [
  'Ana', 'Beto', 'Caio', 'Duda', 'Eva', 'Felipe', 'Gustavo', 'Lia', 'Marcos', 'Nicole',
  'Alana', 'Breno', 'Camila', 'Diego', 'Elisa', 'Fabio', 'Geovana', 'Heitor', 'Isis', 'Joao',
  'Karen', 'Leo', 'Manu', 'Nando', 'Olivia', 'Paulo', 'Quelia', 'Rui', 'Sara', 'Tomas',
  'Ursula', 'Vitor', 'Wanda', 'Xavier', 'Yara', 'Zeca', 'Alice', 'Bernardo', 'Carla', 'Daniel',
  'Elena', 'Fernando', 'Gabriela', 'Hugo', 'Iara', 'Jorge', 'Larissa', 'Mario', 'Natalia', 'Otavio',
  'Patricia', 'Rafael', 'Silvia', 'Thiago', 'Valeria', 'Wagner', 'Aline', 'Bruno', 'Cintia', 'Eduardo',
  'Flavia', 'Gilberto', 'Helena', 'Igor', 'Julia', 'Lucas', 'Marina', 'Nelson', 'Priscila', 'Ricardo',
  'Sabrina', 'Tiago', 'Vanessa', 'William', 'Adriana', 'Alex', 'Bianca', 'Carlos', 'Daniele', 'Elton',
  'Fabiana', 'Gabriel', 'Humberto', 'Isabela', 'Joaquim', 'Luana', 'Murilo', 'Nina', 'Orlando', 'Renata',
  'Simone', 'Tatiane', 'Vinicius', 'Alessandra', 'Andre', 'Barbara', 'Cesar', 'Debora', 'Edson', 'Fatima',
  'Gisele', 'Henrique', 'Irene', 'Jeferson', 'Kleber', 'Leticia', 'Maicon', 'Naira', 'Osmar', 'Paloma',
  'Ramon', 'Sheila', 'Tainara', 'Ulisses', 'Veronica', 'Wesley', 'Ariane', 'Benedito', 'Cristiane', 'Darlan',
  'Edna', 'Francisco', 'Gloria', 'Hélio', 'Ingrid', 'Jailson', 'Kenia', 'Luan', 'Meire', 'Nilson',
  'Onofre', 'Pâmela', 'Regina', 'Sandro', 'Tereza', 'Ubirajara', 'Vilma', 'Welington', 'Yuri', 'Zelia',
  'Adilson', 'Aurea', 'Belmiro', 'Celia', 'Danilo', 'Eliane', 'Evelyn', 'Fábio', 'Genilson', 'Graça',
  'Hilda', 'Ivan', 'Janaina', 'Junior', 'Lais', 'Lorenzo', 'Michele', 'Milton', 'Nayara', 'Odair',
  'Pietra', 'Rogério', 'Selma', 'Sergio', 'Talita', 'Uéslei', 'Valdir', 'Vera', 'Viviane', 'Washington',
  'Adenilson', 'Amanda', 'Bartolomeu', 'Brenda', 'Claudio', 'Cristina', 'Davi', 'Diones', 'Edileusa', 'Elias',
  'Ester', 'Everton', 'Fátima', 'Frida', 'Givaldo', 'Hadassa', 'Inácio', 'Jadson', 'Jane', 'Josué',
  'Luciana', 'Ludmila', 'Márcia', 'Moisés', 'Neusa', 'Nivaldo', 'Olavo', 'Priscila', 'Rivaldo', 'Rosana',
  'Salete', 'Saulo', 'Tânia', 'Túlio', 'Vânia', 'Vidal', 'Zilmar', 'Cristiano', 'Emanuele', 'Gilmar',
];

// Gera 210 bots com CPFs variados e nomes aleatorios que mudam a cada rodada.
// Usa CPFs fixos para manter o saldo entre rodadas, mas nomes randomicos.
const BOT_CPFS = [];
for (let i = 0; i < 210; i++) {
  BOT_CPFS.push(String(10000000000 + i));
}

function nomeAleatorio(exclude, usado) {
  const disp = FIRST_NAMES.filter((n) => !usado || !usado.has(n) || Math.random() > 0.7);
  if (disp.length === 0) return FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)] + ' ' + Math.floor(Math.random() * 999);
  return disp[Math.floor(Math.random() * disp.length)] + ' ' + (exclude || 'S.');
}

function garantirBots(users) {
  for (const cpf of BOT_CPFS) {
    if (!users.has(cpf)) {
      const nome = nomeAleatorio();
      users.set(cpf, { cpf, nome, email: cpf + '@bot', chavePix: cpf, password: 'bot', balance: 999, sessionToken: null });
    }
  }
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function botComprarCartelas(roundCards, users) {
  garantirBots(users);
  // Embaralha a ordem dos bots a cada rodada para nao parecer sequencial.
  const ordem = [...BOT_CPFS];
  for (let i = ordem.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  }
  // Renomeia os bots com nomes aleatorios diferentes a cada rodada.
  const usados = new Set();
  for (const cpf of BOT_CPFS) {
    const u = users.get(cpf);
    if (u) {
      const nome = nomeAleatorio('S.', usados);
      usados.add(nome.split(' ')[0]);
      u.nome = nome;
      db.markDirty(cpf);
    }
  }
  // Cada rodada: 60-80% dos bots compram (parece mais natural), quantidades variadas.
  const proporcao = randInt(60, 80);
  const compradores = Math.floor(BOT_CPFS.length * proporcao / 100);
  for (let i = 0; i < compradores; i++) {
    const cpf = ordem[i];
    const qtd = randInt(1, 5);
    for (let j = 0; j < qtd; j++) {
      const id = ++core.cardSeq;
      roundCards.set(id, { id, owner: cpf, card: game.generateBingoCard() });
    }
  }
}

module.exports = {
  BOT_CPFS,
  garantirBots,
  botComprarCartelas,
};
