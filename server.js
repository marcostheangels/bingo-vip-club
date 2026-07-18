const path = require('path');
const express = require('express');
const http = require('http');
const game = require('./src/game');
const config = require('./src/config');
const db = require('./src/db');
const auth = require('./src/auth');
const socket = require('./src/socket');
const round = require('./src/round');
const core = require('./src/game-core');

require('dotenv').config();

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

auth.registerRoutes(app);

// Estado atual (apenas com TEST=1) para inspecao/debug
if (process.env.TEST) {
  app.get('/api/state', (req, res) => res.json(round.publicState()));
}

// Endpoints de TESTE (apenas com TEST=1): forçam vitórias para validação.
if (process.env.TEST) {
  function authToken(req) {
    const token = req.headers.authorization && req.headers.authorization.replace('Bearer ', '');
    return token && db.sessions.get(token);
  }

  app.post('/api/_test_force_kuadra', (req, res) => {
    const key = authToken(req);
    if (!key) return res.status(401).json({ error: 'no auth' });
    if (core.state.status !== 'running') return res.status(400).json({ error: 'not running' });
    const card = [
      [1, 2, 3, '', '', '', '', '', 4],
      ['', '', '', '', '', '', '', '', ''],
      [5, 6, 7, '', '', '', '', '', 8],
    ];
    if (core.state.drawnBalls.length === 0) core.state.drawnBalls.push(1, 2, 3, 4, 5, 6, 7, 8);
    core.state.currentBall = 8;
    const idx = (++core.cardSeq);
    core.roundCards.set(idx, { id: idx, owner: key, card });
    round.checarVencedores();
    res.json({ ok: true, forced: true });
  });

  app.post('/api/_test_force_keno', (req, res) => {
    const key = authToken(req);
    if (!key) return res.status(401).json({ error: 'no auth' });
    if (core.state.status !== 'running') return res.status(400).json({ error: 'not running' });
    const card = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [10, 11, 12, 13, 14, 15, 16, 17, 18],
      [19, 20, 21, 22, 23, 24, 25, 26, 27],
    ];
    if (core.state.drawnBalls.length === 0) core.state.drawnBalls.push(...Array.from({ length: 27 }, (_, i) => i + 1));
    core.state.currentBall = 27;
    const idx = (++core.cardSeq);
    core.roundCards.set(idx, { id: idx, owner: key, card });
    round.checarVencedores();
    if (core.state.winners.keno) round.finalizarRodada();
    res.json({ ok: true, forced: true });
  });

  app.post('/api/_test_novarodada', (req, res) => {
    round.comecarRodada();
    res.json({ ok: true });
  });
}

socket.init(server);

// Inicia a primeira rodada.
round.comecarRodada();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Bingo VIP Club rodando em http://localhost:${PORT}`);
});
