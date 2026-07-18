// ===== Boot da aplicação =====
(async function init() {
  if (!token) { location.href = '/login.html'; return; }

  await validarSessaoExistente();

  if (!document.getElementById('userName').textContent) {
    document.getElementById('userName').textContent = meuCpf
      ? 'CPF ' + meuCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4')
      : 'jogador';
  }

  document.getElementById('btnSair').addEventListener('click', sairDaConta);
})();
