const path = require('path');
const crypto = require('crypto');

// ===== "Banco de dados" em memória (persistido em users.json) =====
// users: cpf -> { cpf, nome, email, chavePix, password(hash), balance, sessionToken }
const users = new Map();
// sessions: token -> cpf
const sessions = new Map();

const USERS_FILE = path.join(__dirname, '..', 'users.json');

function loadUsers() {
  try {
    const raw = require('fs').readFileSync(USERS_FILE, 'utf8');
    const arr = JSON.parse(raw);
    for (const u of arr) users.set(u.cpf, u);
    console.log('[users] carregados', users.size, 'do users.json');
  } catch (e) { /* arquivo inexistente ou vazio: começa vazio */ }
}

function saveUsers() {
  try {
    const arr = Array.from(users.values());
    require('fs').writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2));
  } catch (e) { console.error('[users] falha ao salvar', e.message); }
}

loadUsers();

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
    saveUsers();
  }
  return users.get(key);
}

module.exports = {
  users,
  sessions,
  loadUsers,
  saveUsers,
  hash,
  newToken,
  validarCPF,
  ensureUser,
};
