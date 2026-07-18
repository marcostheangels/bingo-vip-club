// Migra os usuários do users.json para o PostgreSQL.
// Uso: node scripts/migrate.js
// Só insere quem ainda não existir (não sobrescreve usuários já cadastrados no PG).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pg = require('pg');

const USERS_FILE = path.join(__dirname, '..', 'users.json');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL não definida no .env');
    process.exit(1);
  }

  const pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pgClient.connect();
  await pgClient.query(`
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
  await pgClient.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin BOOLEAN DEFAULT FALSE`).catch(() => {});

  let arr = [];
  try {
    arr = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    console.error('Falha ao ler users.json:', e.message);
    process.exit(1);
  }

  let inseridos = 0;
  for (const u of arr) {
    const cpf = String(u.cpf || '').replace(/\D/g, '');
    if (!cpf) continue;
    const nome = u.nome || 'Jogador';
    const email = u.email || '';
    const chavePix = u.chavePix || '';
    const password = u.password || crypto.createHash('sha256').update('').digest('hex');
    const balance = Number(u.balance) || 0;
    const sessionToken = u.sessionToken || null;
    const admin = !!u.admin;
    try {
      await pgClient.query(
        `INSERT INTO users (cpf, nome, email, chave_pix, password, balance, session_token, admin)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (cpf) DO NOTHING`,
        [cpf, nome, email, chavePix, password, balance, sessionToken, admin]
      );
      inseridos++;
    } catch (e) {
      console.error('Erro ao inserir', cpf, e.message);
    }
  }

  const res = await pgClient.query('SELECT COUNT(*)::int AS total FROM users');
  console.log('Inseridos (novos):', inseridos);
  console.log('Total de usuarios no PG:', res.rows[0].total);
  await pgClient.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
