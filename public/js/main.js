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

  const editorActive = new URLSearchParams(location.search).has('edit');

  // ===== Retorno do checkout InfinitePay: confirma pagamento e mostra mensagem =====
  const retorno = new URLSearchParams(location.search);
  const orderNsu = retorno.get('order_nsu');
  if (orderNsu) {
    try {
      const r = await fetch('/api/deposito/status?sessionToken=' + encodeURIComponent(token) + '&cpf=' + encodeURIComponent(meuCpf) + '&orderNsu=' + encodeURIComponent(orderNsu));
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        if (d.status === 'pago') {
          const vmtxt = Number(d.valor) ? window.brl(d.valor) : '';
          mostrarAviso('✅ Pix enviado com sucesso!' + (vmtxt ? ' Seu saldo de ' + vmtxt + ' foi creditado.' : ''), 'ok');
        } else {
          mostrarAviso('⏳ Pagamento ainda não confirmado. Assim que o banco confirmar, o valor cai na sua conta.', 'info');
        }
      }
    } catch (e) {}
    // Limpa a URL para não reprocessar.
    history.replaceState({}, document.title, location.pathname);
  }

  // ===== Aviso flutuante (toast) =====
  function mostrarAviso(texto, tipo) {
    let el = document.getElementById('avisoFlutuante');
    if (!el) {
      el = document.createElement('div');
      el.id = 'avisoFlutuante';
      document.body.appendChild(el);
    }
    el.textContent = texto;
    el.className = 'aviso-flutuante show ' + (tipo || 'info');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = 'aviso-flutuante ' + (tipo || 'info'); }, 6000);
  }

  // ===== Inspeção de código: clique simples em painel com data-src =====
  const srcModal = document.getElementById('srcModal');
  const srcTitle = document.getElementById('srcTitle');
  const srcTabs = document.getElementById('srcTabs');
  const srcCode = document.getElementById('srcCode');
  const srcFiles = [];

  function fecharModal() { srcModal.classList.remove('show'); srcFiles.length = 0; srcTabs.innerHTML = ''; srcCode.innerHTML = ''; }
  document.getElementById('srcClose').addEventListener('click', fecharModal);
  srcModal.addEventListener('click', (e) => { if (e.target === srcModal) fecharModal(); });
  document.getElementById('srcCopy').addEventListener('click', async () => {
    const active = document.querySelector('.src-tab.active');
    if (!active) return;
    const { content } = srcFiles[+active.dataset.i];
    try { await navigator.clipboard.writeText(content); document.getElementById('srcCopy').textContent = '✓ Copiado'; setTimeout(() => document.getElementById('srcCopy').textContent = '⧉ Copiar', 1500); }
    catch { document.getElementById('srcCopy').textContent = 'Erro'; }
  });

  const SRC_MAX_LINES = 150;
  function mostrarArquivo(idx) {
    document.querySelectorAll('.src-tab').forEach((t, i) => t.classList.toggle('active', i === idx));
    const { name, content } = srcFiles[idx];
    srcTitle.textContent = 'Código: ' + name;
    const linhas = content.split('\n');
    const mostradas = linhas.slice(0, SRC_MAX_LINES);
    let html = mostradas.map((l, i) => `<span class="ln">${i + 1}</span>${escapeHtml(l)}`).join('\n');
    if (linhas.length > SRC_MAX_LINES) {
      html += `\n<span class="ln">…</span><span style="color:#8b5cff">// arquivo tem ${linhas.length} linhas — mostrando ${SRC_MAX_LINES}. Me diga o trecho exato que quer ver.</span>`;
    }
    srcCode.innerHTML = html;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function abrirPainel(el) {
    const src = el.getAttribute('data-src');
    if (!src) return;
    const nomes = src.split('|').map((s) => s.trim()).filter(Boolean);
    srcFiles.length = 0;
    for (const nome of nomes) {
      try {
        const resp = await fetch('/api/source?file=' + encodeURIComponent(nome));
        srcFiles.push({ name: nome, content: resp.ok ? await resp.text() : 'ERRO ao carregar ' + nome });
      } catch (e) {
        srcFiles.push({ name: nome, content: 'ERRO: ' + e.message });
      }
    }
    if (srcFiles.length === 0) return;
    srcTabs.innerHTML = srcFiles.map((f, i) => `<div class="src-tab${i === 0 ? ' active' : ''}" data-i="${i}">${f.name}</div>`).join('');
    srcTabs.querySelectorAll('.src-tab').forEach((tab) => {
      tab.addEventListener('click', () => mostrarArquivo(+tab.dataset.i));
    });
    mostrarArquivo(0);
    srcModal.classList.add('show');
  }

  // ===== MODO EDITAÇÃO: substitui painel-inspecionavel para permitir edição de TODOS os elementos =====
  if (editorActive) {
    document.querySelectorAll('[data-src]').forEach((el) => {
      el.classList.remove('painel-inspecionavel');
      el.removeEventListener('click', (e) => { e.stopPropagation(); abrirPainel(el); });
    });

    document.querySelectorAll('[contenteditable="true"]').forEach((el) => el.removeAttribute('contenteditable'));

    document.body.setAttribute('contenteditable', 'true');

    document.body.addEventListener('click', (e) => {
      const target = e.target;
      if (target.closest('#editorBar') || target.closest('.src-modal')) return;

      if (!target.closest('button, input, textarea, select, [contenteditable="true"])') && target !== document.body) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(target);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  }

  // ===== Funcionalidade extra do editor =====
  // Ajustar alturas dos painéis no modo edição
  const observer = new MutationObserver(() => {
    if (editorActive) {
      // Tornar panels laterais mais estreitos
      const rightPanel = document.querySelector('.right-panel');
      if (rightPanel) rightPanel.style.width = 'auto';
      const infoColumn = document.querySelector('.info-column');
      if (infoColumn) infoColumn.style.width = 'auto';

      // Tornar o mapa de bolas mais visível
      const boardGrid = document.querySelector('.balls-grid');
      if (boardGrid) boardGrid.style.background = 'rgba(255,255,255,.05)';

      // Tornar painéis de prêmios mais visíveis
      document.querySelectorAll('.prize-card').forEach(p => p.style.background = 'rgba(255,255,255,.05)');
      document.querySelectorAll('.info-card').forEach(i => i.style.background = 'rgba(255,255,255,.05)');
    }
  });
  observer.observe(document.body, { attributes: true, childList: true, subtree: true });

  // Indicador visual de altura dos painéis editáveis
  document.body.addEventListener('keydown', (e) => {
    if (editorActive && (e.ctrlKey || e.metaKey) && e.key === '=') {
      e.preventDefault();
      const board = document.querySelector('.balls-board');
      const rightPanel = document.querySelector('.right-panel');
      if (board) board.style.height = board.style.height ? '' : '400px';
      if (rightPanel) rightPanel.style.height = rightPanel.style.height ? '' : '500px';
    }
  });

  // ===== Wake Lock: mantém tela ligada enquanto o jogo estiver aberto =====
  let wakeSentinel = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeSentinel = await navigator.wakeLock.request('screen');
        wakeSentinel.addEventListener('release', () => { wakeSentinel = null; });
      }
    } catch {}
  }
  requestWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !wakeSentinel) requestWakeLock();
  });

  // ===== Mobile: layout vertical unico =====
  if (window.innerWidth <= 900) {
    const myCards = document.getElementById('myCards');
    const rightPanel = document.querySelector('.right-panel');
    const centerContent = document.querySelector('.center-content');
    if (myCards && rightPanel && centerContent) {
      if (!centerContent.contains(myCards)) centerContent.appendChild(myCards);
      if (!centerContent.contains(rightPanel)) centerContent.appendChild(rightPanel);
    }
  }
})();
