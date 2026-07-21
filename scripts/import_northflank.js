const { Pool } = require('pg');
const fs = require('fs');

const NORTH_URL = process.env.NORTH_DB;
const dump = JSON.parse(fs.readFileSync('render_dump.json', 'utf8'));

(async () => {
  const pool = new Pool({ connectionString: NORTH_URL, ssl: { rejectUnauthorized: false } });

  try {
    // Cria tabelas (ignora se ja existem)
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
    await pool.query(`CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY, value NUMERIC
    )`);

    // Importa usuarios
    for (const u of dump.users) {
      await pool.query(
        `INSERT INTO users (cpf, nome, email, chave_pix, password, balance, session_token, admin, bonus, deposito)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (cpf) DO UPDATE SET
           nome=EXCLUDED.nome, email=EXCLUDED.email, balance=EXCLUDED.balance,
           admin=EXCLUDED.admin, bonus=EXCLUDED.bonus, deposito=EXCLUDED.deposito`,
        [u.cpf, u.nome, u.email, u.chave_pix, u.password, u.balance,
         u.session_token, !!u.admin, Number(u.bonus||0), Number(u.deposito||0)]
      );
    }
    console.log('Usuarios importados:', dump.users.length);

    // Importa saques
    for (const s of dump.saques) {
      await pool.query(
        `INSERT INTO saques (id, cpf, nome, valor, pix, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [s.id, s.cpf, s.nome, s.valor, s.pix, s.status, s.created_at]
      );
    }
    console.log('Saques importados:', dump.saques.length);

    // Importa depositos
    for (const d of dump.depositos) {
      await pool.query(
        `INSERT INTO depositos (id, cpf, nome, valor, pix, status, order_nsu, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [d.id, d.cpf, d.nome, d.valor, d.pix, d.status, d.order_nsu, d.created_at]
      );
    }
    console.log('Depositos importados:', dump.depositos.length);

    // Importa historico
    for (const h of dump.historico) {
      await pool.query(
        `INSERT INTO historico (id, sorteio, fase, prize, vencedores, created_at)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [h.id, h.sorteio, h.fase, h.prize,
         JSON.stringify(typeof h.vencedores === 'string' ? JSON.parse(h.vencedores) : h.vencedores),
         h.created_at]
      );
    }
    console.log('Historico importado:', dump.historico.length);

    // House balance
    if (dump.house > 0) {
      await pool.query(
        `INSERT INTO meta (key, value) VALUES ('house', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [dump.house]
      );
    }
    console.log('House balance:', dump.house);

    console.log('IMPORTACAO CONCLUIDA!');
  } catch(e) { console.error('ERRO:', e.message); }
  pool.end();
})();
