const fs = require('fs');
let s = fs.readFileSync('public/js/ui.js', 'utf8');

// Reverter: remover badge fixo de ganhou, voltar ao original (item.done da fase atual)
const oldBlock = `    playersContainer.innerHTML = '';
    const faseAtual = PHASE_SEQUENCE[s.phaseIndex] || 'kuadra';
    document.getElementById('fasePainel').textContent = '— ' + NOME[faseAtual];
    window.__playersGanhou = {};
    (s.players || []).forEach((p) => { if (p.ganhou && p.ganhou.length) window.__playersGanhou[p.id] = p.ganhou; });

    // ===== Lista da fase atual (quem está perto) =====
    const lista = ((s.ranking && s.ranking[faseAtual]) || []).slice();
    if (lista.length === 0) {
      const vazio = document.createElement('div');
      vazio.className = 'pphase-empty';
      vazio.textContent = 'Aguardando cartelas...';
      playersContainer.appendChild(vazio);
    } else {
      lista.forEach((item, i) => {
        const isMe = item.owner === meuCpf;
        const faltantes = item.faltantes || [];
        let balls;
        if (item.done) {
          balls = \`<span class="fase-badge-won" title="Fez \${NOME[faseAtual]}">✓ \${NOME[faseAtual].toUpperCase()}</span>\`;
        } else {
          balls = faltantes.map((n) => \`<span class="pballmini" title="\${n}">\${n}</span>\`).join('');
        }
        // Badges de fases ja ganhas por este jogador (fixos no nome).
        const ganhou = (window.__playersGanhou && window.__playersGanhou[item.owner]) || [];
        const badgesGanhou = ganhou.map((ph) => \`<span class="fase-badge-won sm" title="Fez \${NOME[ph]}">✓ \${NOME[ph].toUpperCase()}</span>\`).join(' ');
        const row = document.createElement('div');
        row.className = 'player-row' + (isMe ? ' me' : '') + (item.done ? ' done-row' : '');
        row.dataset.owner = item.owner;
        row.dataset.cardId = item.cardId;
        row.innerHTML = \`
          <span class="prank">\${i + 1}</span>
          <span class="pcode">\${isMe ? '★' : ''}#\${item.cardId}</span>
          <span class="player-name">\${item.name} \${badgesGanhou}</span>
          <div class="pballs">\${balls}</div>\`;
        playersContainer.appendChild(row);
      });
    }`;

const newBlock = `    playersContainer.innerHTML = '';
    const faseAtual = PHASE_SEQUENCE[s.phaseIndex] || 'kuadra';
    document.getElementById('fasePainel').textContent = '— ' + NOME[faseAtual];

    // ===== Lista da fase atual (quem está perto) =====
    const lista = ((s.ranking && s.ranking[faseAtual]) || []).slice();
    if (lista.length === 0) {
      const vazio = document.createElement('div');
      vazio.className = 'pphase-empty';
      vazio.textContent = 'Aguardando cartelas...';
      playersContainer.appendChild(vazio);
    } else {
      lista.forEach((item, i) => {
        const isMe = item.owner === meuCpf;
        const faltantes = item.faltantes || [];
        let balls;
        if (item.done) {
          balls = \`<span class="fase-badge-won" title="Fez \${NOME[faseAtual]}">✓ \${NOME[faseAtual].toUpperCase()}</span>\`;
        } else {
          balls = faltantes.map((n) => \`<span class="pballmini" title="\${n}">\${n}</span>\`).join('');
        }
        const row = document.createElement('div');
        row.className = 'player-row' + (isMe ? ' me' : '') + (item.done ? ' done-row' : '');
        row.dataset.owner = item.owner;
        row.dataset.cardId = item.cardId;
        row.innerHTML = \`
          <span class="prank">\${i + 1}</span>
          <span class="pcode">\${isMe ? '★' : ''}#\${item.cardId}</span>
          <span class="player-name">\${item.name}</span>
          <div class="pballs">\${balls}</div>\`;
        playersContainer.appendChild(row);
      });
    }`;

if (s.includes(oldBlock)) { s = s.replace(oldBlock, newBlock); console.log('ui revertido OK'); }
else console.log('ui revert NAO achou');

fs.writeFileSync('public/js/ui.js', s);
