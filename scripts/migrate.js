const { Pool } = require('pg');
const fs = require('fs');

async function importFromDump() {
  const dumpPath = require('path').join(__dirname, '..', 'render_dump.json');
  if (!fs.existsSync(dumpPath)) return { error: 'dump file not found' };

  const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      cpf TEXT PRIMARY KEY, nome TEXT, email TEXT, chave_pix TEXT,
      password TEXT, balance NUMERIC DEFAULT 10, session_token TEXT,
      admin BOOLEAN DEFAULT FALSE, bonus NUMERIC DEFAULT 0, deposito NUMERIC DEFAULT 0
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS saques (
      id TEXT PRIMARY KEY, cpf TEXT, nome TEXT, valor NUMERIC, pix TEXT,
      status TEXT, created_at BIGINT
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS depositos (
      id TEXT PRIMARY KEY, cpf TEXT, nome TEXT, valor NUMERIC, pix TEXT,
      status TEXT, order_nsu TEXT, created_at BIGINT
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS historico (
      id TEXT PRIMARY KEY, sorteio INTEGER, fase TEXT, prize NUMERIC,
      vencedores JSONB, created_at BIGINT
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value NUMERIC)`);

    let count = 0;
    for (const u of dump.users || []) {
      await pool.query(
        `INSERT INTO users (cpf, nome, email, chave_pix, password, balance, session_token, admin, bonus, deposito)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (cpf) DO NOTHING`,
        [u.cpf, u.nome, u.email, u.chave_pix, u.password, u.balance, u.session_token,
         !!u.admin, Number(u.bonus||0), Number(u.deposito||0)]
      );
      count++;
    }

    for (const s of dump.saques || []) {
      await pool.query(
        `INSERT INTO saques (id, cpf, nome, valor, pix, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [s.id, s.cpf, s.nome, s.valor, s.pix, s.status, s.created_at]
      );
    }

    for (const d of dump.depositos || []) {
      await pool.query(
        `INSERT INTO depositos (id, cpf, nome, valor, pix, status, order_nsu, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [d.id, d.cpf, d.nome, d.valor, d.pix, d.status, d.order_nsu, d.created_at]
      );
    }

    for (const h of dump.historico || []) {
      await pool.query(
        `INSERT INTO historico (id, sorteio, fase, prize, vencedores, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [h.id, h.sorteio, h.fase, h.prize, JSON.stringify(h.vencedores || []), h.created_at]
      );
    }

    if (dump.house > 0) {
      await pool.query(`INSERT INTO meta (key, value) VALUES ('house', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [dump.house]);
    }

    pool.end();
    return { ok: true, users: count, saques: (dump.saques||[]).length, historico: (dump.historico||[]).length };
  } catch(e) { pool.end(); return { error: e.message }; }
}

module.exports = { importFromDump };
