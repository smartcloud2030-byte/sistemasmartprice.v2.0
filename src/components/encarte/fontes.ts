import { FONTES_ENCARTE } from './encarteProduto';

// As 10 primeiras fontes de FONTES_ENCARTE já vêm no src/index.css (carregam
// com a página). As demais só interessam pra quem abre o editor de encarte, e
// baixar ~140 famílias de fonte no boot deixaria o app inteiro lento — então
// carregamos aqui, sob demanda, quando o EncarteCanvas monta.

const JA_NO_CSS = 10;
let carregado = false;

/** Injeta os <link> do Google Fonts pras fontes extras do encarte. Idempotente. */
export function carregarFontesEncarte(): void {
  if (carregado || typeof document === 'undefined') return;
  carregado = true;

  // preconnect ajuda o primeiro download
  for (const href of ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']) {
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = href;
    if (href.includes('gstatic')) l.crossOrigin = 'anonymous';
    document.head.appendChild(l);
  }

  const extras = FONTES_ENCARTE.slice(JA_NO_CSS);
  const CHUNK = 8; // famílias por requisição — mantém a URL curta
  for (let i = 0; i < extras.length; i += CHUNK) {
    const familias = extras
      .slice(i, i + CHUNK)
      .map((f) => `family=${encodeURIComponent(f.trim()).replace(/%20/g, '+')}`)
      .join('&');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${familias}&display=swap`;
    document.head.appendChild(link);
  }
}
