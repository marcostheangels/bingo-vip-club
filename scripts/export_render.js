const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: 'postgresql://bingo:N3TXFi5kRzDRavX0gi3QA4wGS26oSmUJ@dpg-d9dr6s3bc2fs73en7m20-a.oregon-postgres.render.com/bingo_7pf5',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const users = await pool.query('SELECT * FROM users ORDER BY admin DESC, nome ASC');
    const saques = await pool.query('SELECT * FROM saques ORDER BY created_at DESC');
    const depositos = await pool.query('SELECT * FROM depositos ORDER BY created_at DESC');
    const historico = await pool.query('SELECT * FROM historico ORDER BY created_at DESC');
    let house = 0;
    try {
      const meta = await pool.query("SELECT * FROM meta WHERE key='house'");
      if (meta.rows[0]) house = Number(meta.rows[0].value);
    } catch(e) { console.log('Meta table not found, house=0'); }

    const dump = {
      users: users.rows,
      saques: saques.rows,
      depositos: depositos.rows,
      historico: historico.rows,
      house
    };
    fs.writeFileSync('render_dump.json', JSON.stringify(dump, null, 2));
    console.log('EXPORTADO COM SUCESSO!');
    console.log('Usuarios:', users.rows.length);
    console.log('Saques:', saques.rows.length);
    console.log('Depositos:', depositos.rows.length);
    console.log('Historico:', historico.rows.length);
    console.log('House:', dump.house);
    pool.end();
  } catch(e) { console.error('ERRO:', e.message); pool.end(); }
})();
