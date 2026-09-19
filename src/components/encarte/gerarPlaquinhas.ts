import { useStore, SavedPlaquinha, QueuedPlaquinhaState } from '../../store';
import { EncarteProduto } from './encarteProduto';

/**
 * Monta o texto de preço da plaquinha a partir do produto do encarte —
 * o editor de plaquinha só tem UM campo de texto pro preço (sem "de"/"por"
 * separados como no encarte), então quando existe preço "de" ele entra
 * numa linha antes do preço de oferta. Percentual (ex.: "15%", o mesmo
 * formato que a etiqueta do encarte usa pra desconto) passa direto, sem
 * "R$" na frente — igual o editor de plaquinha já faz pra desconto em %.
 */
function formatarPrecoPlaquinha(produto: EncarteProduto): string {
  const oferta = (produto.precoOferta || '').trim();
  const ehPercentual = /^\d+([.,]\d+)?\s*%$/.test(oferta);
  const precoFmt = ehPercentual ? oferta : `R$ ${oferta || '0,00'}`;
  const de = (produto.precoDe || '').trim();
  return de ? `De R$ ${de}\nPor ${precoFmt}` : precoFmt;
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
 * escolhido tiver mais de um slot) usando o modelo salvo `template` como
 * estilo/visual, substituindo nome, descrição, medida, preço e foto pelos
 * do produto do encarte — e manda cada uma direto pra fila de impressão.
 *
 * Dirige o editor de plaquinha "por baixo dos panos" via `useStore.setState`
 * direto (nunca `setElement`/`selectProduct`, que além de atualizar o texto
 * também GRAVAM a mudança no modelo salvo/no servidor — usar eles aqui
 * destruiria o modelo original a cada produto do lote). Ao final, restaura
 * o estado do editor de antes de começar, pra não deixar lixo do último
 * produto gerado nem mexer no que quer que o usuário estivesse editando.
 */
export async function gerarPlaquinhasDoEncarte(
  template: SavedPlaquinha,
  produtosEncarte: EncarteProduto[],
): Promise<number> {
  const produtos = produtosEncarte.filter((p) => p.nome?.trim());
  if (produtos.length === 0) return 0;

  const estadoOriginal = capturarEditorState(useStore.getState());
  const { currentView, editingSavedPlaquinhaId, editingQueueIndex } = useStore.getState();

  const porGrupo = template.editorState.isSingleProduct ? 1 : 3;
  let gerados = 0;

  try {
    for (let i = 0; i < produtos.length; i += porGrupo) {
      const grupo = produtos.slice(i, i + porGrupo);

      // Recarrega o modelo inteiro a cada grupo — evita que sobra de um
      // slot do grupo anterior (nome/preço/foto que esse grupo não usa)
      // vaze pra próxima plaquinha gerada.
      useStore.setState({
        ...template.editorState,
        currentView: 'editor',
        editingSavedPlaquinhaId: null,
        editingQueueIndex: null,
      });

      grupo.forEach((produto, idx) => {
        const slot = idx + 1;
        const elementKey = `textElements${slot}` as 'textElements1' | 'textElements2' | 'textElements3';
        const imageKey = `productImage${slot}` as 'productImage1' | 'productImage2' | 'productImage3';
        const precoTexto = formatarPrecoPlaquinha(produto);
        const descricaoTexto = formatarDescricaoPlaquinha(produto);
        useStore.setState((s) => ({
          [elementKey]: {
            ...(s as any)[elementKey],
            name: { ...(s as any)[elementKey].name, text: produto.nome },
            description: { ...(s as any)[elementKey].description, text: descricaoTexto },
            price: { ...(s as any)[elementKey].price, text: precoTexto },
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
