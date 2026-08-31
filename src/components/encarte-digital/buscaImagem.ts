// Busca de imagem na internet (Google Programmable Search, restrito a sites
// de farmácia) — fallback do painel Produtos quando o item não está no
// catálogo. As URLs já vêm apontando pro nosso proxy (/api/encarte/image-proxy)
// pra não sujar o canvas na exportação do PNG.

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';

export interface ImagemInternet {
  title: string;
  source: string;
  url: string;
  thumb: string;
  largura: number | null;
  altura: number | null;
}

export async function buscarImagensInternet(q: string, limit = 6): Promise<ImagemInternet[]> {
  const res = await fetch(`/api/encarte/image-search?q=${encodeURIComponent(q)}&limit=${limit}`, {
    headers: { 'x-api-token': API_SECRET },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 501) throw new Error('Busca de imagens não configurada no servidor (GOOGLE_CSE_*).');
    if (res.status === 429) throw new Error('Cota diária de busca de imagens esgotada. Tente amanhã.');
    throw new Error(json?.error || `Falha na busca (HTTP ${res.status})`);
  }
  return (json.itens ?? []) as ImagemInternet[];
}
