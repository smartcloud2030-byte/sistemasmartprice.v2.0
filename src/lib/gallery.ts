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
