// ===== Depósito via PIX (InfinitePay Checkout Integrado) =====
(function () {
  let valorAtual = 0;

  function abrirDeposito() {
    valorAtual = 0;
    const modal = document.getElementById('depModal');
    modal.classList.add('show');
    document.querySelector('#depModal .dep-box').innerHTML = templateInicial();
    bindInicial();
  }

  function fecharDeposito() {
    document.getElementById('depModal').classList.remove('show');
  }

  function templateInicial() {
    return `
      <div class="dep-head">
        <span class="dep-title">💰 Recarregar Saldo</span>
        <button class="dep-close" onclick="fecharDeposito()">✕</button>
      </div>
      <div class="dep-balance">Saldo atual: <b id="depSaldoAtual">${document.getElementById('balanceVal').textContent}</b></div>
      <div class="dep-quick">
        <button class="dep-q" data-v="5">R$ 5</button>
        <button class="dep-q" data-v="10">R$ 10</button>
        <button class="dep-q" data-v="30">R$ 30</button>
        <button class="dep-q" data-v="50">R$ 50</button>
        <button class="dep-q" data-v="100">R$ 100</button>
        <button class="dep-q" data-v="200">R$ 200</button>
      </div>
      <div class="dep-custom">
        <span>R$</span>
        <input id="depValor" type="number" min="5" step="1" placeholder="Outro valor (mín. 5)" inputmode="numeric">
      </div>
      <div class="dep-selecionado">Valor selecionado: <b id="depSelecionado">R$ 0,00</b></div>
      <button class="dep-confirm" id="depConfirm">Gerar PIX</button>
      <div class="dep-msg" id="depMsg"></div>
      <div class="dep-warn">⚠️ Atenção: o <b>Crédito (saldo sacável)</b> depositado aqui pode ser usado para jogar e sacado. O <b>Bônus</b> e eventuais prêmios têm regras próprias e <b>não são sacáveis</b>.</div>
      <div class="dep-hint">Pagamento via Pix pela InfinitePay. Você será redirecionado para o checkout e, ao pagar, o saldo cai automaticamente na sua conta.</div>
    `;
  }

  function bindInicial() {
    const box = document.querySelector('#depModal .dep-box');
    const sel = box.querySelector('#depSelecionado');
    const atualizarSelecionado = () => { if (sel) sel.textContent = window.brl ? window.brl(valorAtual || 0) : (valorAtual || 0); };
    box.querySelectorAll('.dep-q').forEach((b) => {
      b.addEventListener('click', () => {
        box.querySelectorAll('.dep-q').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        const inp = box.querySelector('#depValor');
        if (inp) inp.value = '';
        valorAtual = +b.dataset.v;
        atualizarSelecionado();
      });
    });
    const inp = box.querySelector('#depValor');
    if (inp) inp.addEventListener('input', () => {
      box.querySelectorAll('.dep-q').forEach((x) => x.classList.remove('active'));
      valorAtual = parseFloat(inp.value) || 0;
      atualizarSelecionado();
    });
    box.querySelector('#depConfirm').addEventListener('click', confirmar);
  }

  function confirmar() {
    const v = parseFloat(String(valorAtual).replace(',', '.'));
    const msg = document.getElementById('depMsg');
    if (!v || v < 5) { msg.className = 'dep-msg'; msg.textContent = 'O valor mínimo de recarga é R$ 5,00.'; return; }
    criarDeposito(v);
  }

  async function criarDeposito(valor) {
    const btn = document.getElementById('depConfirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando PIX...'; }
    try {
      const token = localStorage.getItem('bingo_session_token');
      const cpf = localStorage.getItem('bingo_meu_cpf');
      if (!token || !cpf) throw new Error('Sessão inválida. Faça login novamente.');
      const r = await fetch('/api/deposito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken: token, cpf, valor })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.checkoutUrl) throw new Error(data.error || 'Erro ao gerar pagamento.');
      // Redireciona o jogador para o checkout da InfinitePay (Pix).
      window.location.href = data.checkoutUrl;
    } catch (e) {
      const msg = document.getElementById('depMsg');
      msg.className = 'dep-msg'; msg.textContent = e.message;
      if (btn) { btn.disabled = false; btn.textContent = 'Gerar PIX'; }
    }
  }

  window.abrirDeposito = abrirDeposito;
  window.fecharDeposito = fecharDeposito;

  // Fecha ao clicar fora
  document.addEventListener('click', (e) => {
    const m = document.getElementById('depModal');
    if (m && m.classList.contains('show') && e.target === m) fecharDeposito();
  });
})();
