import { Fragment, ReactNode } from 'react';

/**
 * Ícones dentro da caixa de texto do encarte. O texto guarda marcadores
 * `[whatsapp]` e `[instagram]`; na hora de desenhar viram uma bolinha na cor
 * do texto com o desenho vazado (o fundo do encarte aparece por dentro).
 */
export const MARCADOR_WHATSAPP = '[whatsapp]';
export const MARCADOR_INSTAGRAM = '[instagram]';

const RE_MARCADOR = /\[(whatsapp|instagram)\]/gi;

function Icone({ tipo, cor, uid }: { tipo: 'whatsapp' | 'instagram'; cor: string; uid: string }) {
  const mask = `m_${uid}`;
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.15em"
      height="1.15em"
      style={{ display: 'inline-block', verticalAlign: '-0.2em', marginRight: '0.15em' }}
      aria-hidden="true"
    >
      <defs>
        <mask id={mask}>
          <circle cx="12" cy="12" r="12" fill="white" />
          {tipo === 'whatsapp' ? (
            <>
              <path
                d="M12 5a7 7 0 0 0-6.06 10.5L5 19l3.6-.94A7 7 0 1 0 12 5z"
                fill="none"
                stroke="black"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M9.3 8.6c.2-.35.45-.4.7-.4h.45c.2 0 .35.1.45.35l.55 1.3c.1.2.05.42-.1.57l-.45.52c.4.85 1.1 1.55 1.95 1.95l.52-.45c.15-.15.37-.2.57-.1l1.3.55c.25.1.35.25.35.45v.45c0 .25-.05.5-.4.7-.5.35-1.2.5-1.95.3-2.05-.55-3.7-2.2-4.25-4.25-.2-.75-.05-1.45.31-1.94z"
                fill="black"
              />
            </>
          ) : (
            <>
              <rect x="6" y="6" width="12" height="12" rx="3.6" fill="none" stroke="black" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="2.9" fill="none" stroke="black" strokeWidth="1.6" />
              <circle cx="15.6" cy="8.4" r="0.95" fill="black" />
            </>
          )}
        </mask>
      </defs>
      <circle cx="12" cy="12" r="12" fill={cor} mask={`url(#${mask})`} />
    </svg>
  );
}

/** Troca os marcadores por ícones; texto sem marcador volta igual. */
export function textoComIcones(texto: string, cor: string, uid: string): ReactNode {
  if (!RE_MARCADOR.test(texto)) return texto;
  RE_MARCADOR.lastIndex = 0;
  const partes: ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  for (const m of texto.matchAll(RE_MARCADOR)) {
    const ini = m.index ?? 0;
    if (ini > ultimo) partes.push(<Fragment key={`t${i}`}>{texto.slice(ultimo, ini)}</Fragment>);
    const tipo = m[1].toLowerCase() as 'whatsapp' | 'instagram';
    partes.push(<Icone key={`i${i}`} tipo={tipo} cor={cor} uid={`${uid}_${i}`} />);
    ultimo = ini + m[0].length;
    i++;
  }
  if (ultimo < texto.length) partes.push(<Fragment key="fim">{texto.slice(ultimo)}</Fragment>);
  return partes;
}
