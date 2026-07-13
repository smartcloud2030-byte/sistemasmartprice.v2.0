import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Valida se uma URL é uma imagem pública válida.
 * Aceita praticamente qualquer string que pareça uma URL ou caminho de arquivo,
 * priorizando a flexibilidade para aceitar CDNs e proxies.
 */
export const isValidImageUrl = (url: string): boolean => {
  if (!url) return false;
  
  const trimmedUrl = url.trim();
  
  // Aceita data URLs
  if (trimmedUrl.startsWith('data:image/')) {
    return true;
  }

  // Aceita URLs que começam com // (protocol-relative)
  if (trimmedUrl.startsWith('//')) {
    return true;
  }
  
  // Aceita URLs que começam com protocolos comuns
  if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
    return true;
  }
  
  // Se não tem protocolo, mas parece uma URL (tem um ponto e não tem espaços)
  // Tentamos validar se é uma URL válida adicionando o protocolo
  if (trimmedUrl.includes('.') && !trimmedUrl.includes(' ')) {
    try {
      // Se já tem um ponto e não tem espaços, é muito provável que seja uma URL válida
      // ou um caminho de arquivo que o navegador consiga resolver.
      return true;
    } catch (e) {
      // Ignora erro e continua para outros checks
    }
  }

  // Check for common image extensions anywhere in the string (case insensitive)
  const extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.bmp', '.tiff'];
  const lowerUrl = trimmedUrl.toLowerCase();
  if (extensions.some(ext => lowerUrl.includes(ext))) {
    return true;
  }

  // Fallback final: se tiver pelo menos um ponto e não tiver espaços, aceitamos.
  // Isso é o mais permissivo possível para URLs de CDNs complexas.
  return trimmedUrl.includes('.') && !trimmedUrl.includes(' ');
};

/**
 * Retorna uma URL de imagem segura para CORS, usando um proxy se necessário.
 * Suporta uma opção de miniatura para carregamento mais rápido.
 */
export const getProxyUrl = (url: string | undefined | null, options?: { thumbnail?: boolean }) => {
  if (!url || typeof url !== 'string' || url.startsWith('data:') || url.startsWith('blob:')) {
    return url || '';
  }

  // Imagens do nosso próprio MinIO: quando uma miniatura é pedida, redireciona para o
  // endpoint local que redimensiona sob demanda e cacheia o resultado (evita baixar a
  // imagem em tamanho real só para exibir em 40-400px).
  if (options?.thumbnail && url.includes('imagens.sistemasmartprice.com.br')) {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean); // [bucket, ...objectPath]
      if (segments.length > 1) {
        const objectPath = segments.slice(1).join('/');
        return `/gallery/thumb/${objectPath}?w=400`;
      }
    } catch {
      // URL malformada — cai para o retorno padrão abaixo
    }
  }

  // URLs do MinIO próprio (sem miniatura pedida) não precisam de proxy
  if (url.includes('imagens.sistemasmartprice.com.br')) return url;

  return url; // URLs externas: carrega direto (sem proxy de terceiros)
};

/**
 * Extrai o caminho (bucket/objeto) de uma URL de imagem hospedada na nossa galeria,
 * para permitir excluir o arquivo físico via `/gallery/delete/:path`.
 */
export const extractGalleryPath = (url: string | null | undefined): string | null => {
  if (!url || !url.includes('imagens.sistemasmartprice.com.br')) return null;
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length > 1) return segments.slice(1).join('/');
  } catch {
    // URL malformada — ignora
  }
  return null;
};
