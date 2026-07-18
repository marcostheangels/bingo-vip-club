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

  document.querySelectorAll('[data-src]').forEach((el) => {
    el.classList.add('painel-inspecionavel');
    el.addEventListener('click', (e) => { e.stopPropagation(); abrirPainel(el); });
  });
})();
