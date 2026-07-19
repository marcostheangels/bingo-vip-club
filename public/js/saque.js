// ===== Saque (jogador solicita) =====
(function () {
  function abrirSaque() {
    const modal = document.getElementById('saqueModal');
    const saldoEl = document.getElementById('saqueSaldo');
    saldoEl.textContent = document.getElementById('balanceVal').textContent;
    const v = document.getElementById('saqueValor');
    const p = document.getElementById('saquePix');
    v.value = ''; p.value = '';
    document.getElementById('saqueMsg').textContent = '';
    document.getElementById('saqueMsg').className = 'dep-msg';
    modal.classList.add('show');
    v.focus();
  }

  function fecharSaque() {
    document.getElementById('saqueModal').classList.remove('show');
  }

  async function enviar() {
    const msg = document.getElementById('saqueMsg');
    const v = parseFloat(document.getElementById('saqueValor').value.replace(',', '.'));
    const pix = document.getElementById('saquePix').value.trim();
    if (!v || v < 1) { msg.className = 'dep-msg'; msg.textContent = 'Informe um valor válido (mín. R$ 1,00).'; return; }
    if (!pix) { msg.className = 'dep-msg'; msg.textContent = 'Informe sua chave Pix.'; return; }
    msg.className = 'dep-msg'; msg.textContent = 'Enviando...';
    try {
      const r = await fetch('/api/saque', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken: token, cpf: meuCpf, valor: v, pix }),
      });
      const data = await r.json();
      if (!r.ok) { msg.className = 'dep-msg'; msg.textContent = data.error || 'Erro ao solicitar saque.'; return; }
      msg.className = 'dep-msg ok';
      msg.textContent = '✅ Pedido enviado! Admin vai pagar via Pix.';
      // O servidor emite o evento 'saldo' para o jogador; atualizamos direto o display.
      const el = document.getElementById('balanceVal');
      if (el && typeof data.saldo === 'number') el.textContent = window.brl ? window.brl(data.saldo) : data.saldo;
      if (window.__saldoJogavel !== undefined && typeof data.saldo === 'number') window.__saldoJogavel = data.saldo;
      setTimeout(fecharSaque, 1800);
    } catch (e) {
      msg.className = 'dep-msg'; msg.textContent = 'Falha de conexão.';
    }
  }

  window.abrirSaque = abrirSaque;
  window.fecharSaque = fecharSaque;
  document.addEventListener('click', (e) => {
    const m = document.getElementById('saqueModal');
    if (m && m.classList.contains('show') && e.target === m) fecharSaque();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('saqueConfirm');
    if (btn) btn.addEventListener('click', enviar);
  });
  // Caso o script carregue depois do DOMContentLoaded
  if (document.readyState !== 'loading') {
    const btn = document.getElementById('saqueConfirm');
    if (btn) btn.addEventListener('click', enviar);
  }
})();
