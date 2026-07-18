const config = require('./config');
const db = require('./db');

// Resposta padrão de login (gera token, salva e responde).
function loginResponse(u, res) {
  const token = db.newToken();
  u.sessionToken = token;
  db.sessions.set(token, u.cpf);
  db.saveUsers();
  res.json({ sessionToken: token, cpf: u.cpf, nome: u.nome, email: u.email, balance: u.balance });
}

function registerRoutes(app) {
  app.post('/api/register', (req, res) => {
    const { nome, cpf, email, senha, confirma, chavePix } = req.body || {};
    if (!nome || !cpf || !email || !senha || !chavePix) return res.status(400).json({ error: 'Preencha todos os campos.' });
    const cpfLimpo = String(cpf).replace(/\D/g, '');
    if (!db.validarCPF(cpfLimpo)) return res.status(400).json({ error: 'CPF inválido.' });
    if (senha.length < 4) return res.status(400).json({ error: 'Senha deve ter no mínimo 4 caracteres.' });
    if (senha !== confirma) return res.status(400).json({ error: 'Senhas não conferem.' });
    if (db.users.has(cpfLimpo)) return res.status(400).json({ error: 'CPF já cadastrado.' });
    const u = db.ensureUser(cpfLimpo, { nome: nome.trim(), email: email.trim(), chavePix: chavePix.trim(), senha });
    loginResponse(u, res);
  });

  app.post('/api/login', (req, res) => {
    const { cpf, senha } = req.body || {};
    const cpfLimpo = String(cpf || '').replace(/\D/g, '');
    if (!cpfLimpo || !senha) return res.status(400).json({ error: 'Informe CPF e senha.' });
    const u = db.users.get(cpfLimpo);
    if (!u || u.password !== db.hash(senha)) return res.status(401).json({ error: 'CPF ou senha incorretos.' });
    loginResponse(u, res);
  });

  // Login demo: conta de teste pronta (sobe com BOTS=1 / demo)
  app.post('/api/login-demo', (req, res) => {
    const nomeReq = (req.body && req.body.nome || '').trim();
    if (!db.users.has(config.DEMO_CPF)) {
      db.users.set(config.DEMO_CPF, {
        cpf: config.DEMO_CPF, nome: nomeReq || 'Demo Jogador', email: 'demo@demo.com',
        chavePix: 'demo@demo.com', password: db.hash(config.DEMO_SENHA), balance: 50.0, sessionToken: null,
      });
      db.saveUsers();
    }
    const u = db.users.get(config.DEMO_CPF);
    if (nomeReq) { u.nome = nomeReq; db.saveUsers(); }
    loginResponse(u, res);
  });

  app.post('/api/validar-sessao', (req, res) => {
    const { sessionToken, cpf } = req.body || {};
    const cpfLimpo = String(cpf || '').replace(/\D/g, '');
    const tokenKey = sessionToken && db.sessions.get(sessionToken);
    const u = db.users.get(cpfLimpo);
    if (u && tokenKey === cpfLimpo && u.sessionToken === sessionToken) {
      res.json({ valido: true, nome: u.nome, cpf: u.cpf, email: u.email, balance: u.balance });
    } else {
      res.json({ valido: false });
    }
  });
}

module.exports = { loginResponse, registerRoutes };
