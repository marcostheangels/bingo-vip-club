// ===== Modo Edição: barra flutuante que ativa contentEditable e salva no servidor =====
// SÓ é ativado com ?edit=1 na URL (acesso administrativo). Requer sessão válida.
(function () {
  const params = new URLSearchParams(location.search);
  if (!params.has('edit')) return;

  const token = localStorage.getItem('bingo_session_token');
  const meuCpf = localStorage.getItem('bingo_meu_cpf') || '';
  if (!token || !meuCpf) return;

  window.editorActive = true;

  // Barra flutuante
  const bar = document.createElement('div');
  bar.id = 'editorBar';
  bar.innerHTML = `
    <button id="edToggle" title="Ativar/Desativar modo edição">✏️ Modo Edição</button>
    <button id="edSave"   style="display:none" title="Salvar alterações no servidor">💾 Salvar</button>
    <button id="edCancel" style="display:none" title="Cancelar e recarregar">✕ Cancelar</button>
    <span id="edHint" style="display:none">Clique nos textos para editar. Ao terminar, clique em Salvar.</span>
  `;
  document.body.appendChild(bar);

  const btnToggle = document.getElementById('edToggle');
  const btnSave = document.getElementById('edSave');
  const btnCancel = document.getElementById('edCancel');
  const hint = document.getElementById('edHint');

  let editing = false;

  function setEditable(on) {
    if (on) {
      document.querySelectorAll('[data-src]').forEach((el) => {
        el.classList.remove('painel-inspecionavel');
      });

      document.body.setAttribute('contenteditable', 'true');
      bar.setAttribute('contenteditable', 'false');

      document.querySelectorAll('button, input, select, textarea').forEach((el) => {
        el.setAttribute('contenteditable', 'false');
      });

      document.querySelectorAll('script, style, link').forEach((el) => {
        el.setAttribute('contenteditable', 'false');
      });

      document.querySelectorAll('.src-modal, #winOverlay, #jackpotOverlay').forEach((el) => {
        el.setAttribute('contenteditable', 'false');
      });

      document.body.classList.add('editor-active');
    } else {
      document.body.removeAttribute('contenteditable');
      document.body.classList.remove('editor-active');
    }

    editing = on;
    btnSave.style.display = on ? '' : 'none';
    btnCancel.style.display = on ? '' : 'none';
    hint.style.display = on ? '' : 'none';
    btnToggle.textContent = on ? '🔒 Modo Visualização' : '✏️ Modo Edição';
    btnToggle.title = on ? 'Voltar para visualização' : 'Ativar modo edição';
  }

  btnToggle.addEventListener('click', () => setEditable(!editing));

  btnSave.addEventListener('click', async () => {
    if (!editing) return;
    // Salva o corpo do documento sem duplicar scripts/barras de edição.
    const clone = document.body.cloneNode(true);
    // Remove a própria barra de edição do conteúdo salvo.
    const barClone = clone.querySelector('#editorBar');
    if (barClone) barClone.remove();
    // Garante que o body não fique gravado como editável.
    clone.removeAttribute('contenteditable');
    clone.classList.remove('editor-active');
    const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML.replace(document.body.outerHTML, clone.outerHTML) + '\n';
    btnSave.textContent = '⏳ Salvando...';
    btnSave.disabled = true;
    try {
      const resp = await fetch('/api/save-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken: token, cpf: meuCpf, html }),
      });
      let data;
      try {
        data = await resp.json();
      } catch (jsonErr) {
        throw new Error('Resposta inesperada do servidor');
      }
      if (!resp.ok || !data.ok) throw new Error(data.error || 'Falha ao salvar');
      btnSave.textContent = '✓ Salvo';
      setTimeout(() => { location.reload(); }, 800);
    } catch (e) {
      btnSave.textContent = '💾 Salvar';
      btnSave.disabled = false;
      console.error('Save error:', e);
      alert('Erro ao salvar: ' + e.message);
    }
  });

  btnCancel.addEventListener('click', () => {
    if (!confirm('Cancelar edições não salvas e recarregar a página?')) return;
    location.reload();
  });
})();
