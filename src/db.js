const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ===== Camada de dados =====
// Em produção (Render) usa PostgreSQL quando DATABASE_URL está definida.
// Em dev/local usa users.json. O Map em memória é o cache de leitura (síncrono)
// e o PostgreSQL/users.json é o armazenamento de fundo (persistência).
const users = new Map();        // cpf -> { cpf, nome, email, chavePix, password, balance, sessionToken }
const sessions = new Map();     // token -> cpf
const saques = [];              // pedidos de saque: { id, cpf, nome, valor, pix, status, createdAt }
const config = require('./config');

const USERS_FILE = path.join(__dirname, '..', 'users.json');
const DATABASE_URL = process.env.DATABASE_URL;

let pg = null;       // módulo pg (ou null)
let pgPool = null;   // pool de conexões do PostgreSQL

async function initDB() {
  if (DATABASE_URL) {
    try {
      pg = require('pg');
      pgPool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 10 });
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS users (
          cpf TEXT PRIMARY KEY,
          nome TEXT,
          email TEXT,
          chave_pix TEXT,
          password TEXT,
          balance NUMERIC DEFAULT 10,
          session_token TEXT,
          admin BOOLEAN DEFAULT FALSE
        );
      `);
      // Garante a coluna em tabelas antigas.
      await pgPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin BOOLEAN DEFAULT FALSE`).catch(() => {});
      await pgPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus NUMERIC DEFAULT 0`).catch(() => {});
      await pgPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deposito NUMERIC DEFAULT 0`).catch(() => {});
      // Tabela de estado da rodada em andamento (snapshot para retomar após queda).
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS round_state (
          id TEXT PRIMARY KEY,
          state JSONB,
          cards JSONB,
          card_seq INTEGER,
          sorteio_seq INTEGER,
          updated_at BIGINT
        );
      `);
      // Tabela de pedidos de saque.
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS saques (
          id TEXT PRIMARY KEY,
          cpf TEXT,
          nome TEXT,
          valor NUMERIC,
          pix TEXT,
          status TEXT,
          created_at BIGINT
        );
      `);
      // Carrega todos para o cache em memória.
      const res = await pgPool.query('SELECT cpf, nome, email, chave_pix AS "chavePix", password, balance, session_token AS "sessionToken", COALESCE(admin, FALSE) AS "admin", COALESCE(bonus, 0) AS "bonus", COALESCE(deposito, 0) AS "deposito" FROM users');
      for (const row of res.rows) {
        users.set(row.cpf, {
          cpf: row.cpf,
          nome: row.nome,
          email: row.email,
          chavePix: row.chavePix,
          password: row.password,
          balance: Number(row.balance),
          deposito: Number(row.deposito) || 0,
          bonus: Number(row.bonus) || 0,
          sessionToken: row.sessionToken || null,
          admin: !!row.admin || config.ADMIN_CPF.includes(row.cpf),
        });
      }
      console.log('[db] PostgreSQL conectado. usuarios carregados:', users.size);
    } catch (e) {
      console.error('[db] Falha ao conectar PostgreSQL, usando users.json:', e.message);
      pgPool = null;
      loadUsersFile();
    }
  } else {
    loadUsersFile();
  }
}

function loadUsersFile() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const arr = JSON.parse(raw);
    for (const u of arr) {
      u.admin = !!u.admin || config.ADMIN_CPF.includes(u.cpf);
      u.bonus = Number(u.bonus) || 0;
      u.deposito = Number(u.deposito) || 0;
      users.set(u.cpf, u);
    }
    console.log('[users] carregados', users.size, 'do users.json');
  } catch (e) { /* arquivo inexistente ou vazio: começa vazio */ }
}

// Salva o usuário no armazenamento de fundo (PG ou arquivo).
async function persistUser(u) {
  if (pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO users (cpf, nome, email, chave_pix, password, balance, session_token, admin, bonus, deposito)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (cpf) DO UPDATE SET
          nome=EXCLUDED.nome, email=EXCLUDED.email, chave_pix=EXCLUDED.chave_pix,
          password=EXCLUDED.password, balance=EXCLUDED.balance, session_token=EXCLUDED.session_token,
          admin=EXCLUDED.admin, bonus=EXCLUDED.bonus, deposito=EXCLUDED.deposito`,
        [u.cpf, u.nome, u.email, u.chavePix, u.password, u.balance, u.sessionToken || null, !!u.admin, Number(u.bonus) || 0, Number(u.deposito) || 0]
      );
      return;
    } catch (e) {
      console.error('[db] erro ao persistir usuario no PG:', e.message);
    }
  }
  // Fallback: arquivo
  saveUsersFile();
}

// Persistência de todos os usuários no arquivo (usado como fallback do PG).
function saveUsersFile() {
  try {
    const arr = Array.from(users.values());
    fs.writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2));
  } catch (e) { console.error('[users] falha ao salvar', e.message); }
}

// Salva (mantém compatível com chamadas síncronas: dispara persistência em background).
// Persiste apenas usuários modificados (marcados com _dirty) para evitar N queries.
function saveUsers() {
  const dirty = [];
  for (const u of users.values()) {
    if (u._dirty) { dirty.push(u); u._dirty = false; }
  }
  if (dirty.length === 0) return;
  for (const u of dirty) persistUser(u);
}

// Versão async explícita se necessário.
async function saveUsersAsync() {
  for (const u of users.values()) {
    if (u._dirty) { await persistUser(u); u._dirty = false; }
  }
}

function markDirty(cpf) {
  const u = users.get(cpf);
  if (u) u._dirty = true;
}

// ===== Pedidos de saque =====
async function addSaque(pedido) {
  saques.unshift(pedido);
  if (pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO saques (id, cpf, nome, valor, pix, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO NOTHING`,
        [pedido.id, pedido.cpf, pedido.nome, pedido.valor, pedido.pix, pedido.status, pedido.createdAt]
      );
    } catch (e) { console.error('[db] erro saque PG:', e.message); }
  }
  return pedido;
}

async function listSaques() {
  if (pgPool) {
    try {
      const r = await pgPool.query('SELECT * FROM saques ORDER BY created_at DESC');
      return r.rows.map((x) => ({ id: x.id, cpf: x.cpf, nome: x.nome, valor: Number(x.valor), pix: x.pix, status: x.status, createdAt: Number(x.created_at) }));
    } catch (e) { console.error('[db] erro listSaques:', e.message); }
  }
  return saques.slice();
}

async function updateSaque(id, status) {
  const s = saques.find((x) => x.id === id);
  if (s) s.status = status;
  if (pgPool) {
    try { await pgPool.query('UPDATE saques SET status=$1 WHERE id=$2', [status, id]); }
    catch (e) { console.error('[db] erro updateSaque:', e.message); }
  }
  return s;
}

// ===== Snapshot da rodada em andamento (retomada após queda) =====
async function saveRound(snapshot) {
  if (!pgPool) return;
  try {
    await pgPool.query(
      `INSERT INTO round_state (id, state, cards, card_seq, sorteio_seq, updated_at)
       VALUES ('current', $1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
        state=EXCLUDED.state, cards=EXCLUDED.cards, card_seq=EXCLUDED.card_seq,
        sorteio_seq=EXCLUDED.sorteio_seq, updated_at=EXCLUDED.updated_at`,
      [JSON.stringify(snapshot.state), JSON.stringify(snapshot.cards), snapshot.cardSeq, snapshot.sorteioSeq, Date.now()]
    );
  } catch (e) { console.error('[db] erro saveRound:', e.message); }
}

async function loadRound() {
  if (!pgPool) return null;
  try {
    const r = await pgPool.query("SELECT * FROM round_state WHERE id='current'");
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return {
      state: typeof row.state === 'string' ? JSON.parse(row.state) : row.state,
      cards: typeof row.cards === 'string' ? JSON.parse(row.cards) : row.cards,
      cardSeq: row.card_seq,
      sorteioSeq: row.sorteio_seq,
    };
  } catch (e) { console.error('[db] erro loadRound:', e.message); return null; }
}

async function clearRound() {
  if (!pgPool) return;
  try { await pgPool.query("DELETE FROM round_state WHERE id='current'"); }
  catch (e) { console.error('[db] erro clearRound:', e.message); }
}

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
    { cpf: key, password: hash(dados.senha || ''), balance: 0, deposito: 0, bonus: 10.0, sessionToken: null, admin: false },
    dados
  );
    u.password = hash(dados.senha || '');
    u.admin = !!u.admin || config.ADMIN_CPF.includes(key);
    users.set(key, u);
    persistUser(u);
  }
  return users.get(key);
}


// Tenta debitar 'valor' para jogar, na ordem: balance (sacavel) -> deposito -> bonus.
// Retorna true se debitou (e ajusta os campos), false se insuficiente (reverte).
function debitarParaJogar(cpf, valor) {
  const u = users.get(cpf);
  if (!u) return false;
  const valorAlvo = +(valor).toFixed(2);
  const snapshot = { balance: Number(u.balance) || 0, deposito: Number(u.deposito) || 0, bonus: Number(u.bonus) || 0 };
  let restante = valorAlvo;
  const pegar = (campo) => {
    const disp = snapshot[campo];
    const usa = Math.min(disp, restante);
    if (usa > 0) { u[campo] = +(snapshot[campo] - usa).toFixed(2); restante = +(restante - usa).toFixed(2); }
  };
  pegar('balance');
  pegar('deposito');
  pegar('bonus');
  if (restante <= 0.001) {
    markDirty(cpf);
    return true;
  }
  // Insuficiente: restaura o snapshot para não deixar saldo inconsistente.
  u.balance = snapshot.balance;
  u.deposito = snapshot.deposito;
  u.bonus = snapshot.bonus;
  return false;
}

function saldoJogavel(cpf) {
  const u = users.get(cpf);
  if (!u) return 0;
  return +(Number(u.balance) + Number(u.deposito) + Number(u.bonus)).toFixed(2);
}


module.exports = {
  users,
  sessions,
  initDB,
  saveUsers,
  saveUsersAsync,
  hash,
  newToken,
  validarCPF,
  ensureUser,
  debitarParaJogar,
  saldoJogavel,
  markDirty,
  saveUsersFile,
  addSaque,
  listSaques,
  updateSaque,
  saveRound,
  loadRound,
  clearRound,
  isPG: () => !!pgPool,
};
