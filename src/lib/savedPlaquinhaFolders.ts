import type { SavedPlaquinha } from '../store';

export interface FolderGroup {
  folder: string;
  items: SavedPlaquinha[];
}

// Agrupa plaquinhas salvas pelo campo `folder` (trima de novo por seguranca,
// mesmo ja vindo trimado ao salvar), pastas em ordem alfabetica e, dentro de
// cada pasta, itens do mais recente pro mais antigo.
export function groupByFolder(items: SavedPlaquinha[]): FolderGroup[] {
  const map = new Map<string, SavedPlaquinha[]>();
  for (const item of items) {
    const key = item.folder.trim();
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  }
  const groups: FolderGroup[] = Array.from(map.entries()).map(([folder, groupItems]) => ({
    folder,
    items: [...groupItems].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }));
  groups.sort((a, b) => a.folder.localeCompare(b.folder, 'pt-BR'));
  return groups;
}
