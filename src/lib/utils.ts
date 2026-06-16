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
  
  // Se já for uma URL do proxy weserv, extraímos a URL original para remontar com novos parâmetros
  let originalUrl = url;
  if (url.includes('weserv.nl')) {
    try {
      const urlObj = new URL(url);
      originalUrl = urlObj.searchParams.get('url') || url;
    } catch (e) {
      // Ignora erro
    }
  }
  
  const params = new URLSearchParams();
  params.append('url', originalUrl);
  params.append('default', originalUrl);
  
  if (options?.thumbnail) {
    params.append('w', '400');
    params.append('q', '70');
    params.append('output', 'webp');
  }
  
  return `https://images.weserv.nl/?${params.toString()}`;
};
