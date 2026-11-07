// Qual modelo a tela A4 está mostrando de verdade.
//
// A loja não troca o fundo da plaquinha — o fundo (background.url) é a
// "digital" do modelo. Quando o id guardado (activeLayoutId) e o fundo da
// tela não batem, o id está velho (ex.: rascunho de outra loja restaurado no
// login, plaquinha antiga reaberta da fila/pasta) e devolver as edições pra
// esse modelo grava o desenho de um modelo em cima de outro — aí "clica num
// modelo e abre outro" até recarregar a página.

interface ModeloComFundo {
  id?: string;
  background?: { url?: string | null } | null;
}

const mesmaUrl = (a?: string | null, b?: string | null) => (a || null) === (b || null);

/**
 * Índice do modelo que está na tela, ou -1 se não dá pra ter certeza.
 * 1º o id, se o fundo bater; senão o único modelo com aquele fundo.
 */
export function indiceModeloDaTela(
  layouts: ModeloComFundo[],
  activeLayoutId: string | null | undefined,
  activeLayoutIndex: number,
  fundoDaTela: string | null | undefined,
): number {
  const porId = activeLayoutId ? layouts.findIndex((l) => l.id === activeLayoutId) : activeLayoutIndex;
  if (porId >= 0 && layouts[porId] && mesmaUrl(layouts[porId].background?.url, fundoDaTela)) return porId;
  if (!fundoDaTela) return -1;
  const comEsseFundo: number[] = [];
  layouts.forEach((l, i) => { if (mesmaUrl(l.background?.url, fundoDaTela)) comEsseFundo.push(i); });
  return comEsseFundo.length === 1 ? comEsseFundo[0] : -1;
}
