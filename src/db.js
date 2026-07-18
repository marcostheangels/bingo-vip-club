const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ===== Camada de dados =====
// Em produção (Render) usa PostgreSQL quando DATABASE_URL está definida.
// Em dev/local usa users.json. O Map em memória é o cache de leitura (síncrono)
// e o PostgreSQL/users.json é o armazenamento de fundo (persistência).
const users = new Map();        // cpf -> { cpf, nome, email, chavePix, password, balance, sessionToken }
const sessions = new Map();     // token -> cpf

const USERS_FILE = path.join(__dirname, '..', 'users.json');
const DATABASE_URL = process.env.DATABASE_URL;

let pg = null;       // pool do PostgreSQL (ou null)
let pgClient = null; // cliente único (baixo tráfego)

async function initDB() {
  if (DATABASE_URL) {
    try {
      pg = require('pg');
      pgClient = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
      await pgClient.connect();
      await pgClient.query(`
        CREATE TABLE IF NOT EXISTS users (
          cpf TEXT PRIMARY KEY,
          nome TEXT,
          email TEXT,
          chave_pix TEXT,
          password TEXT,
          balance NUMERIC DEFAULT 10,
          session_token TEXT
        );
      `);
      // Carrega todos para o cache em memória.
      const res = await pgClient.query('SELECT cpf, nome, email, chave_pix AS "chavePix", password, balance, session_token AS "sessionToken" FROM users');
      for (const row of res.rows) {
        users.set(row.cpf, {
          cpf: row.cpf,
          nome: row.nome,
          email: row.email,
          chavePix: row.chavePix,
          password: row.password,
          balance: Number(row.balance),
          sessionToken: row.sessionToken || null,
        });
      }
      console.log('[db] PostgreSQL conectado. usuarios carregados:', users.size);
    } catch (e) {
      console.error('[db] Falha ao conectar PostgreSQL, usando users.json:', e.message);
      pgClient = null;
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
    for (const u of arr) users.set(u.cpf, u);
    console.log('[users] carregados', users.size, 'do users.json');
  } catch (e) { /* arquivo inexistente ou vazio: começa vazio */ }
}

// Salva o usuário no armazenamento de fundo (PG ou arquivo).
async function persistUser(u) {
  if (pgClient) {
    try {
      await pgClient.query(
        `INSERT INTO users (cpf, nome, email, chave_pix, password, balance, session_token)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (cpf) DO UPDATE SET
           nome=EXCLUDED.nome, email=EXCLUDED.email, chave_pix=EXCLUDED.chave_pix,
           password=EXCLUDED.password, balance=EXCLUDED.balance, session_token=EXCLUDED.session_token`,
        [u.cpf, u.nome, u.email, u.chavePix, u.password, u.balance, u.sessionToken || null]
      );
      return;
    } catch (e) {
      console.error('[db] erro ao persistir usuario no PG:', e.message);
    }
  }
  // Fallback: arquivo
  try {
    const arr = Array.from(users.values());
    fs.writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2));
  } catch (e) { console.error('[users] falha ao salvar', e.message); }
}

// Salva (mantém compatível com chamadas síncronas: dispara persistência em background).
function saveUsers() {
  // atualiza cache já está feito pelo chamador; apenas persiste.
  for (const u of users.values()) {
    persistUser(u); // fire-and-forget (no aguardo)
  }
}

// Versão async explícita se necessário.
async function saveUsersAsync() {
  for (const u of users.values()) await persistUser(u);
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
      { cpf: key, password: hash(dados.senha || ''), balance: 10.0, sessionToken: null },
      dados
    );
    u.password = hash(dados.senha || '');
    users.set(key, u);
    persistUser(u);
  }
  return users.get(key);
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
  isPG: () => !!pgClient,
};
