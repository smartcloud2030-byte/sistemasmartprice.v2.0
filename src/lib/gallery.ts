import { extractGalleryPath } from './utils';

export const GALLERY_PASSWORD = import.meta.env.VITE_GALLERY_PASSWORD || 'smartprice@admin2026';

export function slugifyCategory(value: string): string {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

export async function uploadBackgroundImage(file: File, category: string): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`/gallery/upload/${category}`, {
    method: 'POST',
    headers: { 'x-gallery-token': GALLERY_PASSWORD },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha no upload');
  }
  return res.json();
}

export interface GalleryImage {
  filename: string;
  displayName: string;
  fullPath: string;
  url: string;
  size: number;
  lastModified: string;
}

export async function listGalleryImages(category: string): Promise<GalleryImage[]> {
  const res = await fetch(`/gallery/list/${category}`, {
    headers: { 'x-gallery-token': GALLERY_PASSWORD },
  });
  if (!res.ok) throw new Error('Falha ao carregar as imagens.');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Exclusão definitiva do arquivo na galeria (MinIO) — usada junto com a
// remoção do estado local para não deixar imagens órfãs.
export async function deleteGalleryImage(url: string | null | undefined): Promise<void> {
  const path = extractGalleryPath(url);
  if (!path) return;
  await fetch(`/gallery/delete/${path}`, {
    method: 'DELETE',
    headers: { 'x-gallery-token': GALLERY_PASSWORD },
  });
}

// ── Classificações (pastas) ──────────────────────────────────────────
// Cada aba da galeria (Temas, Tags, Marca) tem uma categoria-base no MinIO.
// As classificações são pastas irmãs no padrão `<base>--<slug>`; a própria
// base é a classificação "Geral". Renomear/criar/excluir é coisa de admin.

const GALLERY_HEADERS = { 'x-gallery-token': GALLERY_PASSWORD };

export async function listGalleryCategories(): Promise<string[]> {
  const res = await fetch('/gallery/categories?all=1', { headers: GALLERY_HEADERS });
  if (!res.ok) throw new Error('Falha ao carregar as classificações.');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createGalleryCategory(name: string): Promise<void> {
  const res = await fetch('/gallery/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...GALLERY_HEADERS },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao criar a classificação.');
  }
}

export async function renameGalleryCategory(oldName: string, newName: string): Promise<void> {
  const res = await fetch(`/gallery/categories/${encodeURIComponent(oldName)}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...GALLERY_HEADERS },
    body: JSON.stringify({ newName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao renomear a classificação.');
  }
}

export async function deleteGalleryCategory(name: string): Promise<void> {
  const res = await fetch(`/gallery/categories/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: GALLERY_HEADERS,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao excluir a classificação.');
  }
}

const SEP_CLASSIFICACAO = '--';

/** Classificações de uma base, sempre com a base ("Geral") em primeiro. */
export function classificacoesDaBase(todas: string[], base: string): string[] {
  const filhas = todas
    .filter((c) => c.startsWith(base + SEP_CLASSIFICACAO))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return [base, ...filhas];
}

/** Nome amigável de uma categoria (a base vira "Geral"). */
export function nomeClassificacao(categoria: string, base: string): string {
  if (categoria === base) return 'Geral';
  const slug = categoria.slice(base.length + SEP_CLASSIFICACAO.length);
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() || slug;
}

/** Monta o nome de categoria de uma classificação nova a partir do texto digitado. */
export function categoriaDaClassificacao(base: string, nomeDigitado: string): string {
  return `${base}${SEP_CLASSIFICACAO}${slugifyCategory(nomeDigitado)}`;
}
