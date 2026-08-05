import type { EncarteElementLayout, EncarteMolde, SelectedProduct } from '../store';

// Só os campos de POSIÇÃO/TAMANHO/FONTE de um produto no card — nunca nome,
// preço, foto ou id, que são conteúdo, não layout.
export interface ProductLayoutFields {
  offsetX?: number;
  offsetY?: number;
  width?: number;
  height?: number;
  elementLayout?: EncarteElementLayout;
  nameFontSize?: number;
  subtitleFontSize?: number;
  priceFontSize?: number;
}

export function extractLayoutFields(product: SelectedProduct): ProductLayoutFields {
  return {
    offsetX: product.offsetX,
    offsetY: product.offsetY,
    width: product.width,
    height: product.height,
    elementLayout: product.elementLayout,
    nameFontSize: product.nameFontSize,
    subtitleFontSize: product.subtitleFontSize,
    priceFontSize: product.priceFontSize,
  };
}

// Aplica `layout` a todo produto já preenchido cujo slotId esteja em
// `slotIds` (o chamador restringe à frente OU ao verso — os dois lados
// dividem o mesmo mapa `produtos`, então sem essa restrição o botão
// "aplicar a todos" da frente bagunçaria o verso). Slots vazios (null) e
// slots fora de `slotIds` ficam intocados. Nome/preço/foto/id de cada
// produto são preservados — só o layout muda.
export function applyLayoutToAll(
  produtos: Record<string, SelectedProduct | null>,
  slotIds: string[],
  layout: ProductLayoutFields
): Record<string, SelectedProduct | null> {
  const result: Record<string, SelectedProduct | null> = { ...produtos };
  for (const slotId of slotIds) {
    const product = produtos[slotId];
    if (product) result[slotId] = { ...product, ...layout };
  }
  return result;
}

// Converte o layout de um produto de referência nos campos de PADRÃO DO
// MOLDE. `defaultCardRect` só é gravado se as 4 dimensões estiverem
// definidas (produto nunca arrastado = índice do card ainda usa o
// fallback embutido em EncarteWeekly, não grava um retângulo pela metade).
export function buildMoldeDefaults(
  layout: ProductLayoutFields
): Pick<EncarteMolde, 'defaultCardRect' | 'defaultElementLayout' | 'defaultNameFontSize' | 'defaultSubtitleFontSize' | 'defaultPriceFontSize'> {
  const hasFullCardRect =
    layout.offsetX !== undefined && layout.offsetY !== undefined &&
    layout.width !== undefined && layout.height !== undefined;

  return {
    defaultCardRect: hasFullCardRect
      ? { offsetX: layout.offsetX!, offsetY: layout.offsetY!, width: layout.width!, height: layout.height! }
      : undefined,
    defaultElementLayout: layout.elementLayout,
    defaultNameFontSize: layout.nameFontSize,
    defaultSubtitleFontSize: layout.subtitleFontSize,
    defaultPriceFontSize: layout.priceFontSize,
  };
}
