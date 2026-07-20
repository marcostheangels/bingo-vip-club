const CARD_COST_BASE = 0.15;

const PHASE_SEQUENCE = ['kuadra', 'kina', 'keno'];
const NOME = { kuadra: 'Kuadra', kina: 'Kina', keno: 'Keno' };

// Gera custo da cartela variando a cada rodada (R$0,10 ~ R$0,25)
function calcularCardCost() {
  const variacao = 0.9 + Math.random() * 0.6; // 0.9 a 1.5
  return +(CARD_COST_BASE * variacao).toFixed(2);
}

// Calcula prêmios PROPORCIONAIS à RECEITA REAL da rodada (cartelas de jogadores
// reais compradas). O pagamento total nunca passa de 80% da receita -> a casa
// sempre lucra ao menos 20% por rodada, não importa quem ganhe.
// receitaReal = (nº de cartelas reais) x (custo da cartela).
function calcularPremios(receitaReal) {
  const receita = Math.max(0, Number(receitaReal) || 0);
  // Sem receita real (ex.: só bots / ninguém comprou) => nenhum prêmio.
  // A casa só paga com dinheiro que entrou via cartelas de jogadores reais.
  if (receita <= 0) return { kuadra: 0, kina: 0, keno: 0, acumulado: 0 };
  // Teto de pagamento = 80% da receita desta rodada. A casa retém 20% => lucro garantido.
  // SEM mínimos fixos: o prêmio só existe se houver receita (nunca se paga mais do que entrou).
  const teto = receita * 0.80;
  const keno = +(teto * 0.45).toFixed(2);       // maior prêmio
  const kina = +(teto * 0.28).toFixed(2);
  const kuadra = +(teto * 0.17).toFixed(2);
  const acumulado = +(teto * 0.10).toFixed(2);  // jackpot progressivo (dentro do teto)
  return { kuadra, kina, keno, acumulado };
}

function faixaGrid(n) {
  return n <= 30 ? 'f1' : n <= 60 ? 'f2' : 'f3';
}

// Gera cartela oficial de bingo 90 bolas: 3 linhas x 9 colunas, 15 números, 5 por linha.
// Cada coluna respeita a faixa (col 0: 1-9, col 1: 10-19, ..., col 8: 80-90). '' = espaço vazio.
function buildBingoCard() {
  const card = Array.from({ length: 3 }, () => Array(9).fill(''));

  for (let column = 0; column < 9; column++) {
    const start = column === 0 ? 1 : column * 10;
    const end = column === 8 ? 90 : column * 10 + 9;
    const pool = [];
    for (let n = start; n <= end; n++) pool.push(n);

    const selected = [];
    for (let row = 0; row < 3; row++) {
      const index = Math.floor(Math.random() * pool.length);
      selected.push(pool.splice(index, 1)[0]);
    }
    selected.sort((a, b) => a - b);
    for (let row = 0; row < 3; row++) card[row][column] = selected[row];
  }

  // Cada linha deve ter exatamente 5 números (4 vazios). Começa com 3 por coluna.
  const colCount = Array(9).fill(3);
  for (let row = 0; row < 3; row++) {
    const candidates = [];
    for (let col = 0; col < 9; col++) if (colCount[col] > 1) candidates.push(col);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    candidates.slice(0, 4).forEach((col) => {
      card[row][col] = '';
      colCount[col]--;
    });
  }

  // Validação de segurança: cada linha deve ter exatamente 5 números e o total 15.
  let ok = true;
  for (let row = 0; row < 3; row++) {
    const cnt = card[row].filter((v) => v !== '').length;
    if (cnt !== 5) ok = false;
  }
  if (!ok || cardNumbers(card).length !== 15) return null;

  return card;
}

// Gera uma cartela válida com limite de tentativas (evita recursão infinita).
function generateBingoCardSafe() {
  for (let t = 0; t < 50; t++) {
    const c = buildBingoCard();
    if (c) return c;
  }
  // Fallback determinístico: 3 linhas de 5 em faixas distintas.
  const card = Array.from({ length: 3 }, () => Array(9).fill(''));
  let n = 1;
  for (let row = 0; row < 3; row++) {
    for (const col of [0, 1, 2, 3, 4]) card[row][col] = n++;
  }
  return card;
}

// Lista plana (só números) de uma cartela.
function cardNumbers(card) {
  return card.flat().filter((v) => v !== '');
}

// Versão de exibição: 3 linhas x 5 números, na ordem de leitura da matriz 9x3 (sem buracos).
function displayRows(card) {
  const nums = cardNumbers(card);
  const rows = [];
  for (let i = 0; i < 15; i += 5) rows.push(nums.slice(i, i + 5));
  return rows;
}

function rowMarks(card, row, drawnSet) {
  return card[row].reduce((c, v) => c + (v !== '' && drawnSet.has(Number(v)) ? 1 : 0), 0);
}

// Marcações por "linha vertical" da cartela exibida: cada uma das 3 colunas
// verticais de 5 números (displayRows). Usado para Kuadra (4) e Kina (5).
function verticalMarks(card, idx, drawnSet) {
  const vrows = displayRows(card);
  const col = vrows[idx];
  return col.reduce((c, v) => c + (v !== '' && drawnSet.has(Number(v)) ? 1 : 0), 0);
}

// Avalia estado da cartela para todas as fases.
// Kuadra = 4 num na mesma linha vertical (de 5), Kina = 5 na mesma linha vertical,
// Keno = cartela cheia (15).
function evaluateCard(card, drawnBalls) {
  const drawn = new Set(drawnBalls.map(Number));
  const vrows = displayRows(card);
  const verts = vrows.map((_, i) => verticalMarks(card, i, drawn));
  const rows = [0, 1, 2].map((r) => rowMarks(card, r, drawn));
  const total = rows.reduce((a, b) => a + b, 0);

  const kuadraFalta = Math.max(0, Math.min(...verts.map((h) => 4 - h)));
  const kinaFalta = Math.max(0, Math.min(...verts.map((h) => 5 - h)));
  const kenoFalta = Math.max(0, 15 - total);

  return {
    marks: total,
    kuadra: { done: verts.some((h) => h >= 4), falta: kuadraFalta },
    kina: { done: verts.some((h) => h >= 5), falta: kinaFalta },
    keno: { done: total >= 15, falta: kenoFalta },
  };
}

function faltaForPhase(card, drawnBalls, phase) {
  const ev = evaluateCard(card, drawnBalls);
  return ev[phase].falta;
}

// Numeros que faltam para fechar a FASE, considerando a linha mais proxima
// (para kuadra/kina) ou a cartela toda (keno). Respeita a regra de cada fase:
// kuadra = 4 em linha, kina = 5 em linha, keno = 15 (cartela completa).
function missingForPhase(card, drawnBalls, phase) {
  const drawn = new Set(drawnBalls.map(Number));
  if (phase === 'keno') {
    return cardNumbers(card)
      .map(Number)
      .filter((n) => !drawn.has(n))
      .sort((a, b) => a - b);
  }
  const alvo = phase === 'kuadra' ? 4 : 5;
  // linha vertical (bloco de 5) com mais marcacoes (mais perto de fechar)
  const vrows = displayRows(card);
  let melhorIdx = 0;
  let melhorHits = -1;
  for (let i = 0; i < vrows.length; i++) {
    const hits = verticalMarks(card, i, drawn);
    if (hits > melhorHits) { melhorHits = hits; melhorIdx = i; }
  }
  // Quantidade que REALMENTE falta (deve bater com evaluateCard.falta).
  const faltaReal = Math.max(0, alvo - melhorHits);
  const faltantes = vrows[melhorIdx]
    .filter((v) => v !== '' && !drawn.has(Number(v)))
    .map(Number)
    .sort((a, b) => a - b);
  return faltantes.slice(0, faltaReal);
}

module.exports = {
  CARD_COST_BASE,
  PHASE_SEQUENCE,
  NOME,
  faixaGrid,
  generateBingoCard: generateBingoCardSafe,
  buildBingoCard,
  cardNumbers,
  displayRows,
  evaluateCard,
  faltaForPhase,
  missingForPhase,
  calcularCardCost,
  calcularPremios,
};
