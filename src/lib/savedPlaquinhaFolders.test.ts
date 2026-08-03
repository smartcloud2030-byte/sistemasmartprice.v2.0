import assert from 'node:assert';
import { groupByFolder } from './savedPlaquinhaFolders';
import type { SavedPlaquinha } from '../store';

function makeItem(overrides: Partial<SavedPlaquinha>): SavedPlaquinha {
  return {
    id: overrides.id || 'id-1',
    folder: overrides.folder ?? 'Pasta A',
    name: overrides.name ?? 'Produto',
    imageData: 'data:image/png;base64,',
    isLandscape: false,
    editorState: {} as any,
    createdAt: overrides.createdAt || '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-01-01T00:00:00.000Z',
  };
}

function returnsEmptyArrayForEmptyInput() {
  assert.deepStrictEqual(groupByFolder([]), []);
}

function groupsItemsWithTheSameFolderTogether() {
  const items = [
    makeItem({ id: '1', folder: 'Dia da Beleza' }),
    makeItem({ id: '2', folder: 'Dia da Beleza' }),
    makeItem({ id: '3', folder: 'Fralda' }),
  ];
  const result = groupByFolder(items);
  assert.strictEqual(result.length, 2);
  const beleza = result.find((g) => g.folder === 'Dia da Beleza');
  assert.strictEqual(beleza?.items.length, 2);
}

function sortsFoldersAlphabetically() {
  const items = [
    makeItem({ id: '1', folder: 'Zeta' }),
    makeItem({ id: '2', folder: 'Alfa' }),
  ];
  const result = groupByFolder(items);
  assert.deepStrictEqual(result.map((g) => g.folder), ['Alfa', 'Zeta']);
}

function sortsItemsWithinFolderByMostRecentlyUpdatedFirst() {
  const items = [
    makeItem({ id: '1', folder: 'Pasta A', updatedAt: '2026-01-01T00:00:00.000Z' }),
    makeItem({ id: '2', folder: 'Pasta A', updatedAt: '2026-01-03T00:00:00.000Z' }),
  ];
  const result = groupByFolder(items);
  assert.deepStrictEqual(result[0].items.map((i) => i.id), ['2', '1']);
}

function trimsWhitespaceFromFolderNameBeforeGrouping() {
  const items = [
    makeItem({ id: '1', folder: 'Pasta A' }),
    makeItem({ id: '2', folder: 'Pasta A  ' }),
  ];
  const result = groupByFolder(items);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].items.length, 2);
}

try {
  returnsEmptyArrayForEmptyInput();
  groupsItemsWithTheSameFolderTogether();
  sortsFoldersAlphabetically();
  sortsItemsWithinFolderByMostRecentlyUpdatedFirst();
  trimsWhitespaceFromFolderNameBeforeGrouping();
  console.log('PASS: todos os testes de savedPlaquinhaFolders passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
