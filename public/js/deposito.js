// ===== Depósito via PIX (QR Code do administrador + confirmação "Já paguei") =====
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
    const gui = 'BR.GOV.BCB.PIX';
    const mai = campo('00', gui) + campo('01', PIX_KEY);
    const maiCompleto = campo('26', mai);
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
      <div class="dep-warn">⚠️ <b>Atenção:</b> É sacável apenas o <b>Crédito</b> (saldo liberado pelo administrador) e o que você <b>ganhar nas rodadas Kuadra, Kina e Keno</b>. O <b>depósito PIX</b> e o <b>bônus só podem ser usados para jogar</b> e não são sacáveis. Valor mínimo para saque: <b>R$ 10,00</b>.</div>
      <div class="dep-hint">Escaneie o QR Code com o app do seu banco e pague. Depois clique em "Já paguei" para o administrador confirmar e creditar seu saldo.</div>
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
    gerarPix(v);
  }

  // Garante que a biblioteca QRCode esteja disponível. Fallback CDN se ausente.
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
        <button class="pix-paid" id="pixPaid">✅ Já paguei</button>
        <div class="pix-status">📷 Escaneie com o app do seu banco e pague. Depois clique em "Já paguei" para o administrador confirmar o crédito.</div>
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
    const paidBtn = box.querySelector('#pixPaid');
    if (paidBtn) paidBtn.addEventListener('click', () => registrarDeposito(valor, payload));
  }

  async function registrarDeposito(valor, payload) {
    const box = document.querySelector('#depModal .dep-box');
    const btn = box.querySelector('#pixPaid');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    try {
      const token = localStorage.getItem('bingo_session_token');
      const cpf = localStorage.getItem('bingo_meu_cpf');
      if (!token || !cpf) throw new Error('Sessão inválida. Faça login novamente.');
      const r = await fetch('/api/deposito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken: token, cpf, valor, pix: payload })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Erro ao registrar depósito.');
      box.querySelector('.pix-status').innerHTML = '✅ Pedido registrado! Assim que o administrador confirmar o pagamento, o saldo cai na sua conta.';
    } catch (e) {
      const st = box.querySelector('.pix-status');
      st.innerHTML = '❌ ' + e.message;
      if (btn) { btn.disabled = false; btn.textContent = '✅ Já paguei'; }
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
