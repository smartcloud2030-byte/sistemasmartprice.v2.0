import { useStore, QueuedPlaquinhaState, buildWorkingStateFromLayout } from '../../store';
import { getProxyUrl } from '../../lib/utils';
import { EncarteProduto } from './encarteProduto';

/**
 * Monta o preço da plaquinha a partir do produto do encarte. O campo de
 * preço da plaquinha SÓ aceita ou um número (que ele mesmo separa em
 * reais/centavos por conta própria, tirando tudo que não for dígito/vírgula/
 * ponto do texto) ou um percentual — colocar "De R$X / Por R$Y" nesse mesmo
 * campo faz esse parser juntar os dois números num valor só, sem sentido.
 * Por isso o preço "de" (quando existe) vai à parte, no campo "subtítulo"
 * do slot — não risca no preço, mas pelo menos não estraga o preço de
 * oferta, que é a informação mais importante da placa.
 */
function formatarPrecoPlaquinha(produto: EncarteProduto): { preco: string; subtitulo?: string } {
  const oferta = (produto.precoOferta || '').trim();
  const ehPercentual = /^\d+([.,]\d+)?\s*%$/.test(oferta);
  const preco = ehPercentual ? oferta : `R$ ${oferta || '0,00'}`;
  const de = (produto.precoDe || '').trim();
  return { preco, subtitulo: de ? `De R$ ${de}` : undefined };
}

/** Baixa a imagem antecipadamente (mesma URL que o Konva vai pedir) pra ela já
 * estar no cache do navegador quando a plaquinha daquele produto for capturada
 * — sem isso, numa rede mais lenta, a captura podia sair sem a foto porque o
 * carregamento ainda não tinha terminado. Nunca rejeita: falha de rede vira
 * "sem foto" na placa, não trava o lote inteiro. */
function precarregarFoto(url: string | null | undefined): Promise<void> {
  return new Promise((resolve) => {
    const src = getProxyUrl(url);
    if (!src) return resolve();
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
    setTimeout(resolve, 4000);
  });
}

function formatarDescricaoPlaquinha(produto: EncarteProduto): string {
  const medida = [produto.medidaQtd, produto.medidaUnidade].filter(Boolean).join(' ').trim();
  if (!medida) return produto.descricao || '';
  return produto.descricao ? `${produto.descricao}\nC/ ${medida}` : `C/ ${medida}`;
}

const CAMPOS_EDITOR = [
  'activeLayoutIndex', 'orientation', 'background',
  'productImage1', 'productImage2', 'productImage3',
  'textElements1', 'textElements2', 'textElements3',
  'optionalText1', 'optionalText2', 'optionalText3',
  'customTexts', 'isSingleProduct', 'showSingleProductControl', 'showOptionalTextControl',
] as const;

function capturarEditorState(s: ReturnType<typeof useStore.getState>): QueuedPlaquinhaState {
  const out = {} as QueuedPlaquinhaState;
  for (const campo of CAMPOS_EDITOR) (out as any)[campo] = (s as any)[campo];
  return out;
}

/**
 * Gera uma plaquinha por produto (ou uma a cada N produtos, se o modelo
 * escolhido tiver mais de um slot) usando o MODELO de plaquinha
 * `layoutIndex` (da galeria "Modelos disponíveis", os mesmos layouts do
 * editor de plaquinha) como estilo/visual, substituindo nome, descrição,
 * medida, preço e foto pelos do produto do encarte — e manda cada uma
 * direto pra fila de impressão.
 *
 * Dirige o editor de plaquinha "por baixo dos panos" via `useStore.setState`
 * direto (nunca `setElement`/`selectProduct`/`setActiveLayout`, que além de
 * atualizar o texto também GRAVAM a mudança no modelo/no servidor — usar
 * eles aqui destruiria o modelo original a cada produto do lote). Ao
 * final, restaura o estado do editor de antes de começar, pra não deixar
 * lixo do último produto gerado nem mexer no que quer que o usuário
 * estivesse editando.
 */
export async function gerarPlaquinhasDoEncarte(
  layoutIndex: number,
  produtosEncarte: EncarteProduto[],
): Promise<number> {
  const produtos = produtosEncarte.filter((p) => p.nome?.trim());
  if (produtos.length === 0) return 0;

  // Todas as fotos baixando em paralelo desde já — pelo tempo que leva pra
  // trocar de tela e gerar as primeiras placas, a maioria já chega pronta
  // no cache do navegador na hora de cada captura.
  void Promise.all(produtos.map((p) => precarregarFoto(p.product.image)));

  const layout = useStore.getState().layouts[layoutIndex];
  if (!layout) return 0;
  const estadoBase = buildWorkingStateFromLayout(layout, layoutIndex);

  const estadoOriginal = capturarEditorState(useStore.getState());
  const { currentView, editingSavedPlaquinhaId, editingQueueIndex } = useStore.getState();

  // Quantos produtos cabem por plaquinha nesse modelo: 1 se for "produto
  // único", senão 2 ou 3 conforme o 3º slot do modelo estar mesmo visível
  // (mesma info que a etiqueta "2/3 Produtos" mostra na galeria de modelos).
  const porGrupo = estadoBase.isSingleProduct ? 1 : estadoBase.productImage3.visible ? 3 : 2;
  let gerados = 0;

  try {
    for (let i = 0; i < produtos.length; i += porGrupo) {
      const grupo = produtos.slice(i, i + porGrupo);

      // Recarrega o modelo inteiro a cada grupo — evita que sobra de um
      // slot do grupo anterior (nome/preço/foto que esse grupo não usa)
      // vaze pra próxima plaquinha gerada.
      useStore.setState({
        ...estadoBase,
        activeLayoutIndex: layoutIndex,
        currentView: 'editor',
        editingSavedPlaquinhaId: null,
        editingQueueIndex: null,
      });

      grupo.forEach((produto, idx) => {
        const slot = idx + 1;
        const elementKey = `textElements${slot}` as 'textElements1' | 'textElements2' | 'textElements3';
        const imageKey = `productImage${slot}` as 'productImage1' | 'productImage2' | 'productImage3';
        const { preco, subtitulo } = formatarPrecoPlaquinha(produto);
        const descricaoTexto = formatarDescricaoPlaquinha(produto);
        useStore.setState((s) => ({
          [elementKey]: {
            ...(s as any)[elementKey],
            name: { ...(s as any)[elementKey].name, text: produto.nome },
            description: { ...(s as any)[elementKey].description, text: descricaoTexto },
            price: { ...(s as any)[elementKey].price, text: preco },
            ...(subtitulo
              ? { subtitle: { ...(s as any)[elementKey].subtitle, text: subtitulo, visible: true } }
              : null),
          },
          [imageKey]: { ...(s as any)[imageKey], url: produto.product.image },
        }) as any);
      });

      // Espera o Konva re-renderizar (texto + carregar a foto nova) antes
      // de capturar — sem isso a imagem capturada sai com o quadro antigo.
      await new Promise((resolve) => setTimeout(resolve, 700));

      const imageData = (window as any).getCanvasData?.();
      if (!imageData) continue;

      const state = useStore.getState();
      const activeLayout = state.layouts[state.activeLayoutIndex];
      const isQuartSuplemMaxi = activeLayout?.name === 'Quart Suplem Maxi';
      const isLandscape = !isQuartSuplemMaxi && (state.orientation === 'landscape' || state.activeLayoutIndex === 10);

      state.addToQueue(imageData, isLandscape, capturarEditorState(state));
      gerados++;
    }
  } finally {
    useStore.setState({ ...estadoOriginal, currentView, editingSavedPlaquinhaId, editingQueueIndex });
  }

  return gerados;
}
