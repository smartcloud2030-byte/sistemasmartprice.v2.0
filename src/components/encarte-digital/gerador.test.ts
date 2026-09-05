import assert from 'node:assert';
import {
  LARGURA, ALTURA, AREA_PADRAO, CARD_ASPECT, GAP,
  areaPx, cardPx, gradeLayout, posicaoNaGrade,
  AreaProdutos,
} from './gerador';

const perto = (a: number, b: number, eps = 0.75) =>
  assert.ok(Math.abs(a - b) <= eps, `esperava ~${b}, veio ${a}`);

const retangulos = (area: AreaProdutos, colunas: number, qtd: number) => {
  const { w, h } = cardPx(area, colunas, qtd);
  return Array.from({ length: qtd }, (_, i) => {
    const p = posicaoNaGrade(i, area, colunas, qtd);
    return { x: (p.xPct / 100) * LARGURA, y: (p.yPct / 100) * ALTURA, w, h };
  });
};

// ── grade cabe toda dentro da caixa ─────────────────────────────────

function todosOsCardsCabemNaCaixa() {
  for (const qtd of [1, 2, 3, 5, 7, 12, 18, 24]) {
    for (const area of [AREA_PADRAO, { xPct: 8, yPct: 25, wPct: 50, hPct: 45 }]) {
      const a = areaPx(area);
      for (const r of retangulos(area, 3, qtd)) {
        assert.ok(r.x >= a.x - 0.5 && r.x + r.w <= a.x + a.w + 0.5, `qtd=${qtd}: card fora no X`);
        assert.ok(r.y >= a.y - 0.5 && r.y + r.h <= a.y + a.h + 0.5, `qtd=${qtd}: card fora no Y`);
      }
    }
  }
}

function nenhumParDeCardsSeSobrepoe() {
  for (const qtd of [2, 3, 5, 7, 12, 18, 25]) {
    const rects = retangulos(AREA_PADRAO, 3, qtd);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlap =
          a.x < b.x + b.w - 0.5 && a.x + a.w - 0.5 > b.x &&
          a.y < b.y + b.h - 0.5 && a.y + a.h - 0.5 > b.y;
        assert.ok(!overlap, `qtd=${qtd}: cards ${i} e ${j} se sobrepõem`);
      }
    }
  }
}

// ── card se adapta à quantidade ────────────────────────────────────

function maisProdutosCardMenor() {
  const p3 = cardPx(AREA_PADRAO, 3, 3).w;
  const p12 = cardPx(AREA_PADRAO, 3, 12).w;
  const p24 = cardPx(AREA_PADRAO, 3, 24).w;
  assert.ok(p3 > p12 && p12 > p24, `esperava card encolhendo: ${p3} > ${p12} > ${p24}`);
}

function proporcaoDoCardMantida() {
  for (const qtd of [1, 4, 9, 20]) {
    const c = cardPx(AREA_PADRAO, 3, qtd);
    perto(c.h / c.w, CARD_ASPECT, 0.01);
  }
}

// ── colunas efetivas ──────────────────────────────────────────────

function colunasNaoPassamDaQtdNemDoLimite() {
  assert.strictEqual(gradeLayout(AREA_PADRAO, 4, 2).cols, 2, '2 produtos e 4 colunas → usa 2');
  assert.strictEqual(gradeLayout(AREA_PADRAO, 3, 20).cols, 3, '20 produtos e 3 colunas → usa 3');
  assert.strictEqual(gradeLayout(AREA_PADRAO, 99, 5).cols, 5, 'colunas satura no nº de produtos (≤ MAX)');
}

function linhasCertas() {
  assert.strictEqual(gradeLayout(AREA_PADRAO, 3, 3).rows, 1);
  assert.strictEqual(gradeLayout(AREA_PADRAO, 3, 4).rows, 2);
  assert.strictEqual(gradeLayout(AREA_PADRAO, 3, 7).rows, 3);
}

// ── alinhamento (grade e linhas centralizadas) ────────────────────

function gradeCentralizadaNaCaixa() {
  // 12 produtos → grade mais estreita que a caixa (limitada pela altura) → centrada
  const a = areaPx(AREA_PADRAO);
  const rects = retangulos(AREA_PADRAO, 3, 12);
  const minX = Math.min(...rects.map((r) => r.x));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  perto(minX - a.x, a.x + a.w - maxX, 1); // margem esquerda == margem direita
}

function ultimaLinhaIncompletaCentralizada() {
  // 5 produtos, 3 colunas: linha 1 cheia (3), linha 2 com 2 → linha 2 mais pra dentro
  const rects = retangulos(AREA_PADRAO, 3, 5);
  const x0Linha1 = rects[0].x;
  const x0Linha2 = rects[3].x;
  assert.ok(x0Linha2 > x0Linha1 + 1, 'linha incompleta deveria estar centralizada (mais à direita)');
  // e simétrica: a sobra à esquerda da linha 2 == sobra à direita
  const dirLinha1 = rects[2].x + rects[2].w;
  const dirLinha2 = rects[4].x + rects[4].w;
  perto(x0Linha2 - x0Linha1, dirLinha1 - dirLinha2, 1);
}

function primeiroCardNoTopo() {
  const g = gradeLayout(AREA_PADRAO, 3, 6);
  const p0 = posicaoNaGrade(0, AREA_PADRAO, 3, 6);
  perto((p0.yPct / 100) * ALTURA, g.offY);
}

try {
  todosOsCardsCabemNaCaixa();
  nenhumParDeCardsSeSobrepoe();
  maisProdutosCardMenor();
  proporcaoDoCardMantida();
  colunasNaoPassamDaQtdNemDoLimite();
  linhasCertas();
  gradeCentralizadaNaCaixa();
  ultimaLinhaIncompletaCentralizada();
  primeiroCardNoTopo();
  console.log('PASS: todos os testes de gerador (encarte-digital) passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
