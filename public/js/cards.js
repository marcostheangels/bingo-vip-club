// ===== Lógica e render das Minhas Cartelas (cartela oficial 9x3) =====
const myCardsGrid = document.getElementById('myCardsGrid');
let myCards = [];
let gameState = null;

function setMyCards(cards) { myCards = cards; }
function getMyCards() { return myCards; }
function setGameState(s) { gameState = s; }

function cardMarks(card, drawn) {
  let m = 0;
  card.forEach((row) => row.forEach((v) => { if (v !== '' && drawn.has(Number(v))) m++; }));
  return m;
}

// Marcações por "linha vertical" exibida (cada bloco de 5 da displayRows)
function verticalMarks(card, drawn) {
  const disp = displayRows(card);
  return disp.map((row) => row.reduce((c, v) => c + (v !== '' && drawn.has(Number(v)) ? 1 : 0), 0));
}

// Quantas bolas faltam para fechar a fase indicada nesta cartela.
// Kuadra = 4 num bloco vertical, Kina = 5 no mesmo bloco, Keno = cartela cheia.
function faltaFase(card, drawn, fase) {
  const verts = verticalMarks(card, drawn);
  if (fase === 'kuadra') return Math.max(0, Math.min(...verts.map((h) => 4 - h)));
  if (fase === 'kina') return Math.max(0, Math.min(...verts.map((h) => 5 - h)));
  return Math.max(0, 15 - cardMarks(card, drawn)); // keno
}

// Exibição: 3 linhas x 5 números na ordem de leitura da cartela (sem buracos).
function displayRows(card) {
  const nums = card.flat().filter((v) => v !== '');
  const rows = [];
  for (let i = 0; i < 15; i += 5) rows.push(nums.slice(i, i + 5));
  return rows;
}

const BADGE_INFO = {
  kuadra: { txt: 'KUADRA', cls: 'badge-kuadra' },
  kina: { txt: 'KINA', cls: 'badge-kina' },
  keno: { txt: 'KENO', cls: 'badge-keno' },
};

function renderMyCards() {
  const drawn = new Set(gameState ? gameState.drawnBalls : []);
  const fase = gameState ? PHASE_SEQUENCE[gameState.phaseIndex] : 'kuadra';

  // Ordena: primeiro quem já fechou a fase EM DISPUTA, depois por menor falta na fase atual.
  // Desempate final: mais números marcados no total.
  const ordenado = [...myCards].sort((a, b) => {
    const fa = faltaFase(a.card, drawn, fase);
    const fb = faltaFase(b.card, drawn, fase);
    if (fa !== fb) return fa - fb;
    return cardMarks(b.card, drawn) - cardMarks(a.card, drawn);
  });

  myCardsGrid.innerHTML = '';
  ordenado.forEach((c, idx) => {
    const marks = cardMarks(c.card, drawn);
    const falta = faltaFase(c.card, drawn, fase);
    const fechouAtual = falta === 0;

    const dispRows = displayRows(c.card);
    const cells = dispRows
      .map((row) =>
        row
          .map((v) => `<div class="tnum ${drawn.has(Number(v)) ? 'mark' : ''}">${v}</div>`)
          .join('')
      )
      .join('');

    let statusTxt;
    if (fechouAtual) statusTxt = `<span class="falta-tag win">🏆 Fechou ${NOME[fase]}!</span>`;
    else if (falta === 1) statusTxt = `<span class="falta-tag hot">🔥 falta 1 p/ ${NOME[fase]}</span>`;
    else statusTxt = `<span class="falta-tag">faltam ${falta} p/ ${NOME[fase]}</span>`;

    // Badge: mostra somente a badge da FASE ATUAL em disputa quando esta cartela a fechou.
    // Ao avançar de fase (ex: Kuadra -> Kina), o badge da fase anterior some automaticamente.
    let badges = '';
    if (fechouAtual) {
      const b = BADGE_INFO[fase];
      badges = `<span class="card-badge ${b.cls}">🏆 ${b.txt}</span>`;
    }

    const div = document.createElement('div');
    let extraCls = '';
    if (fechouAtual) extraCls = ' won';
    else if (falta === 1) extraCls = ' almost';
    else if (idx === 0 && falta <= 2) extraCls = ' leader';
    div.className = 'ticket3d' + extraCls;
    div.innerHTML = `<div class="th"><span class="cid">#${c.id}</span><span class="card-badges">${badges}</span><span>${marks}/15</span></div>
      ${statusTxt}
      <div class="tgrid">${cells}</div>`;
    myCardsGrid.appendChild(div);
  });
}

window.setMyCards = setMyCards;
window.getMyCards = getMyCards;
window.setGameState = setGameState;
window.cardMarks = cardMarks;
window.rowMarks = rowMarks;
window.faltaFase = faltaFase;
window.displayRows = displayRows;
window.renderMyCards = renderMyCards;
