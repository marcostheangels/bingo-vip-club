// ===== Depósito via PIX (QR Code copia-e-cola) =====
(function () {
  const PIX_KEY = '+5538998551336'; // chave PIX do administrador (telefone, com +55 conforme padrão Bacen)
  const PIX_NOME = 'MARCOS THE ANGELS';
  const PIX_CIDADE = 'BRASIL';

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
    gerarPix(v);
  }

  // Garante que a biblioteca QRCode esteja disponível. Se o /js/qrcode.min.js
  // der 404 (ausente no servidor) ou tiver sido removido do HTML pelo editor,
  // tenta carregar de um CDN como fallback. Resolve true se disponível.
  function ensureQRCode() {
    return new Promise((resolve) => {
      if (window.QRCode) return resolve(true);
      const cdn = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      const s = document.createElement('script');
      s.src = cdn;
      s.onload = () => resolve(!!window.QRCode);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  function gerarPix(valor) {
    const payload = montarPayloadPix(valor);
    const box = document.querySelector('#depModal .dep-box');
    box.innerHTML = `
      <div class="dep-head">
        <span class="dep-title">💰 Pague o PIX</span>
        <button class="dep-close" onclick="fecharDeposito()">✕</button>
      </div>
      <div class="dep-pix">
        <div class="pix-amount">${window.brl(valor)}</div>
        <div class="pix-qr" id="pixQr"></div>
        <div class="pix-copy-row">
          <input class="pix-code" id="pixCode" readonly value="${payload}">
          <button class="pix-copy" id="pixCopy">Copiar</button>
        </div>
        <button class="pix-back" onclick="abrirDeposito()">← Outro valor</button>
        <div class="pix-status">📷 Escaneie com o app do seu banco.<br>Saldo será creditado pelo administrador após a confirmação do pagamento.</div>
      </div>
    `;
    const qr = box.querySelector('#pixQr');
    ensureQRCode().then((ok) => {
      if (ok && window.QRCode) {
        new window.QRCode(qr, { text: payload, width: 180, height: 180, correctLevel: window.QRCode.CorrectLevel.M });
      } else {
        qr.innerHTML = '<div style="color:#333;font-size:11px;padding-top:60px">QR indisponível — use Copiar o código PIX.</div>';
      }
    });
    box.querySelector('#pixCopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(payload); box.querySelector('#pixCopy').textContent = '✓ Copiado'; setTimeout(() => box.querySelector('#pixCopy').textContent = 'Copiar', 1500); }
      catch { box.querySelector('#pixCode').select(); document.execCommand('copy'); }
    });
  }

  window.abrirDeposito = abrirDeposito;
  window.fecharDeposito = fecharDeposito;

  // Fecha ao clicar fora
  document.addEventListener('click', (e) => {
    const m = document.getElementById('depModal');
    if (m && m.classList.contains('show') && e.target === m) fecharDeposito();
  });
})();
