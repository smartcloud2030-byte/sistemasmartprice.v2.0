import type { Product } from '../store';
import { findDuplicateProduct } from './duplicateProductMatch';

export interface ReportRow {
  id: string;
  name: string;
  barcode: string | null;
  barcode2: string | null;
  price: string;
  category: string;
  description: string;
}

export type ReportConflict =
  | { row: ReportRow; reason: 'catalog'; matchedProduct: Product }
  | { row: ReportRow; reason: 'batch'; matchedRow: ReportRow };

function rowToProductLike(row: ReportRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    image: null,
    category: row.category,
    barcode: row.barcode,
    barcode2: row.barcode2,
  };
}

// Acha conflitos numa lista de linhas importadas de planilha: cada linha
// contra o catalogo atual (excluindo o proprio produto, pelo id da linha) e
// cada linha contra as OUTRAS linhas da mesma planilha (pega o caso de a
// propria edicao criar uma colisao nova entre duas linhas).
export function findImportConflicts(rows: ReportRow[], products: Product[]): ReportConflict[] {
  const conflicts: ReportConflict[] = [];

  for (const row of rows) {
    const catalogMatch = findDuplicateProduct(
      { name: row.name, barcode: row.barcode, barcode2: row.barcode2 },
      products,
      row.id
    );
    if (catalogMatch) {
      conflicts.push({ row, reason: 'catalog', matchedProduct: catalogMatch });
      continue;
    }

    const otherRows = rows.filter(r => r !== row);
    const batchMatch = findDuplicateProduct(
      { name: row.name, barcode: row.barcode, barcode2: row.barcode2 },
      otherRows.map(rowToProductLike)
    );
    if (batchMatch) {
      const matchedRow = otherRows.find(r => r.id === batchMatch.id)!;
      conflicts.push({ row, reason: 'batch', matchedRow });
    }
  }

  return conflicts;
}
