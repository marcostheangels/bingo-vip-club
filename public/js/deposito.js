// ===== Depósito via PIX (InfinitePay Checkout Integrado) =====
(function () {
  let valorAtual = 0;

  function montarPayloadPix(valor) {
    function campo(id, valorCampo) {
      const tamanho = String(valorCampo.length).padStart(2, '0');
      return id + tamanho + valorCampo;
    }
    // Merchant Account Information (chave PIX)
    const gui = 'BR.GOV.BCB.PIX';
    const mai = campo('00', gui) + campo('01', PIX_KEY);
    const maiCompleto = campo('26', mai);
    // Additional Data (txid)
    const additional = campo('05', '***');
    const payloadSemCrc =
      '000201' +
      maiCompleto +
      campo('52', '0000') +
      campo('53', '986') +
      campo('54', valor.toFixed(2)) +
      campo('58', 'BR') +
      campo('59', PIX_NOME.slice(0, 25)) +
      campo('60', PIX_CIDADE.slice(0, 15)) +
      campo('62', additional) +
      '6304';
    return payloadSemCrc + crc16(payloadSemCrc);
  }

  function crc16(payload) {
    let polinomio = 0x1021;
    let resultado = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
      resultado ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if (resultado << 1 & 0x10000) resultado = (resultado << 1) ^ polinomio;
        else resultado = resultado << 1;
        resultado &= 0xFFFF;
      }
    }
    return resultado.toString(16).toUpperCase().padStart(4, '0');
  }

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
        <button class="dep-q" data-v="10">R$ 10</button>
        <button class="dep-q" data-v="30">R$ 30</button>
        <button class="dep-q" data-v="50">R$ 50</button>
        <button class="dep-q" data-v="100">R$ 100</button>
        <button class="dep-q" data-v="200">R$ 200</button>
        <button class="dep-q" data-v="500">R$ 500</button>
      </div>
      <div class="dep-custom">
        <span>R$</span>
        <input id="depValor" type="number" min="1" placeholder="Outro valor" inputmode="numeric">
      </div>
      <button class="dep-confirm" id="depConfirm">Gerar PIX</button>
      <div class="dep-msg" id="depMsg"></div>
      <div class="dep-hint">Pagamento via Pix. Escaneie o QR Code ou copie o código e pague no seu banco. Após o pagamento, seu saldo é creditado pelo administrador.</div>
    `;
  }

  function bindInicial() {
    const box = document.querySelector('#depModal .dep-box');
    box.querySelectorAll('.dep-q').forEach((b) => {
      b.addEventListener('click', () => {
        box.querySelectorAll('.dep-q').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        const inp = box.querySelector('#depValor');
        if (inp) inp.value = '';
        valorAtual = +b.dataset.v;
      });
    });
    const inp = box.querySelector('#depValor');
    if (inp) inp.addEventListener('input', () => {
      box.querySelectorAll('.dep-q').forEach((x) => x.classList.remove('active'));
      valorAtual = parseFloat(inp.value) || 0;
    });
    box.querySelector('#depConfirm').addEventListener('click', confirmar);
  }

  function confirmar() {
    const v = parseFloat(String(valorAtual).replace(',', '.'));
    const msg = document.getElementById('depMsg');
    if (!v || v < 1) { msg.className = 'dep-msg'; msg.textContent = 'Escolha um valor válido (mín. R$ 1,00).'; return; }
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
