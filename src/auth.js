const config = require('./config');
const db = require('./db');

// Resposta padrão de login (gera token, salva e responde).
function loginResponse(u, res) {
  const token = db.newToken();
  u.sessionToken = token;
  db.sessions.set(token, u.cpf);
  db.markDirty(u.cpf);
  db.saveUsers();
  res.json({ sessionToken: token, cpf: u.cpf, nome: u.nome, email: u.email, balance: u.balance, admin: !!u.admin });
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function registerRoutes(app) {
  app.post('/api/register', (req, res) => {
    const { nome, cpf, email, senha, confirma, chavePix } = req.body || {};
    if (!nome || !cpf || !email || !senha || !chavePix) return res.status(400).json({ error: 'Preencha todos os campos.' });
    const cpfLimpo = String(cpf).replace(/\D/g, '');
    if (!db.validarCPF(cpfLimpo)) return res.status(400).json({ error: 'CPF inválido.' });
    if (!emailValido(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (senha.length < 4) return res.status(400).json({ error: 'Senha deve ter no mínimo 4 caracteres.' });
    if (senha !== confirma) return res.status(400).json({ error: 'Senhas não conferem.' });
    if (db.users.has(cpfLimpo)) return res.status(400).json({ error: 'CPF já cadastrado.' });
    const emailLower = String(email).trim().toLowerCase();
    for (const u of db.users.values()) {
      if (String(u.email || '').trim().toLowerCase() === emailLower) {
        return res.status(400).json({ error: 'E-mail já cadastrado.' });
      }
    }
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

  app.post('/api/validar-sessao', (req, res) => {
    const { sessionToken, cpf } = req.body || {};
    const cpfLimpo = String(cpf || '').replace(/\D/g, '');
    const tokenKey = sessionToken && db.sessions.get(sessionToken);
    const u = db.users.get(cpfLimpo);
    if (u && tokenKey === cpfLimpo && u.sessionToken === sessionToken) {
      res.json({ valido: true, nome: u.nome, cpf: u.cpf, email: u.email, balance: u.balance, admin: !!u.admin });
    } else {
      res.json({ valido: false });
    }
  });
}

module.exports = { loginResponse, registerRoutes };
