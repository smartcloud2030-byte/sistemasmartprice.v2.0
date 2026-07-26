// import type nao gera import em tempo de execucao (so tipo, apagado na
// compilacao) — evita carregar src/store.ts (que usa import.meta.env/zustand)
// quando este modulo roda isolado no teste standalone via tsx.
import type { Product } from '../store';

function normalizeProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

interface DuplicateCandidate {
  name: string;
  barcode?: string | null;
  barcode2?: string | null;
}

// Acha o primeiro produto ja cadastrado que bate com o candidato, por codigo
// de barras (barcode OU barcode2, comparacao exata e nao vazia, ignorando
// espacos nas pontas) ou por nome (normalizado). excludeId evita acusar
// duplicata do proprio produto ao editar (o item sendo editado nao deve se
// auto-marcar como duplicata).
export function findDuplicateProduct(
  candidate: DuplicateCandidate,
  products: Product[],
  excludeId?: string | number
): Product | null {
  const candidateCodes = [candidate.barcode, candidate.barcode2]
    .filter((c): c is string => !!c && c.trim() !== '')
    .map(c => c.trim());
  const candidateName = normalizeProductName(candidate.name || '');

  for (const product of products) {
    if (excludeId !== undefined && product.id === excludeId) continue;

    const existingCodes = [product.barcode, product.barcode2]
      .filter((c): c is string => !!c && c.trim() !== '')
      .map(c => c.trim());
    const codeMatch = candidateCodes.some(code => existingCodes.includes(code));
    const nameMatch = candidateName !== '' && normalizeProductName(product.name || '') === candidateName;

    if (codeMatch || nameMatch) return product;
  }
  return null;
}
