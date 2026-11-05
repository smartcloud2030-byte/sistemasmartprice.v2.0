import { useEffect, useRef, useState } from 'react';
import type { AjusteAvisoLegal } from './encarteProduto';

// Letra miúda obrigatória por lei (remédio sem receita, leite). Nasce no pé
// do encarte; o usuário pode arrastar, mudar a largura e o tamanho da letra.
// Sem `ajuste` = posição padrão (rodapé, largura toda).

const FONTE_BASE = 5; // px no espaço do canvas (480 de largura)
const ESCALA_MIN = 0.6;
const ESCALA_MAX = 3;

interface Props {
  texto: string;
  destaque: string;
  ajuste: AjusteAvisoLegal | null | undefined;
  onAjustar: (ajuste: AjusteAvisoLegal | null, opcoes?: { coalesce?: string }) => void;
}

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export default function AvisoLegalEncarte({ texto, destaque, ajuste, onAjustar }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [selecionado, setSelecionado] = useState(false);
  const arraste = useRef<{
    tipo: 'mover' | 'largura';
    x0: number; y0: number;
    pagina: DOMRect;
    inicio: Required<AjusteAvisoLegal>;
  } | null>(null);

  // Clique fora tira a seleção.
  useEffect(() => {
    if (!selecionado) return;
    const fora = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setSelecionado(false);
    };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [selecionado]);

  const escala = ajuste?.escala ?? 1;
  // Solto = foi arrastado; sem posição fica no rodapé (mesmo com a letra mudada).
  const solto = ajuste?.xPct != null;

  /** Página do encarte (no modo padrão o aviso fica dentro da faixa do rodapé). */
  const pagina = () => {
    const el = ref.current!;
    return (solto ? el.parentElement : el.parentElement?.parentElement)!.getBoundingClientRect();
  };

  /** Posição atual em % da página — vira o ponto de partida quando ainda está no padrão. */
  const posicaoAtual = (pag: DOMRect): Required<AjusteAvisoLegal> => {
    if (solto) return ajuste as Required<AjusteAvisoLegal>;
    const r = ref.current!.getBoundingClientRect();
    return {
      xPct: ((r.left - pag.left) / pag.width) * 100,
      yPct: ((r.top - pag.top) / pag.height) * 100,
      wPct: (r.width / pag.width) * 100,
      escala,
    };
  };

  const iniciar = (tipo: 'mover' | 'largura') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSelecionado(true);
    const pag = pagina();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    arraste.current = { tipo, x0: e.clientX, y0: e.clientY, pagina: pag, inicio: posicaoAtual(pag) };
  };

  const mover = (e: React.PointerEvent) => {
    const st = arraste.current;
    if (!st) return;
    const dx = ((e.clientX - st.x0) / st.pagina.width) * 100;
    const dy = ((e.clientY - st.y0) / st.pagina.height) * 100;
    if (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2 && !solto) return; // clique simples não solta do rodapé
    const a = st.inicio;
    const novo =
      st.tipo === 'mover'
        ? { ...a, xPct: limitar(a.xPct + dx, 0, 100 - a.wPct), yPct: limitar(a.yPct + dy, 0, 97) }
        : { ...a, wPct: limitar(a.wPct + dx, 15, 100 - a.xPct) };
    onAjustar(novo, { coalesce: 'aviso-legal' });
  };

  const soltar = () => { arraste.current = null; };

  const mudarEscala = (passo: number) => {
    onAjustar({ ...(ajuste ?? {}), escala: limitar(Math.round((escala + passo) * 10) / 10, ESCALA_MIN, ESCALA_MAX) }, { coalesce: 'aviso-legal-escala' });
  };

  const estiloPosicao: React.CSSProperties = solto
    ? { position: 'absolute', left: `${ajuste!.xPct}%`, top: `${ajuste!.yPct}%`, width: `${ajuste!.wPct}%`, zIndex: 30 }
    : { position: 'relative' };

  return (
    <div
      ref={ref}
      style={{ ...estiloPosicao, color: '#111', background: 'rgba(255,255,255,0.92)', fontSize: FONTE_BASE * escala, lineHeight: 1.25, pointerEvents: 'auto', touchAction: 'none' }}
      className={`px-[5%] py-[3px] text-justify cursor-move select-none ${selecionado ? 'outline outline-1 outline-emerald-500' : ''}`}
      onPointerDown={iniciar('mover')}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      title="Texto obrigatório por lei — arraste pra mudar de lugar"
    >
      {texto && <p>{texto}</p>}
      {destaque && <p className="font-bold">{destaque}</p>}

      {selecionado && (
        <>
          {/* Alça da largura (lado direito) */}
          <div
            data-html2canvas-ignore="true"
            className="absolute top-0 bottom-0 -right-1.5 w-3 cursor-ew-resize flex items-center justify-center"
            onPointerDown={iniciar('largura')}
            onPointerMove={mover}
            onPointerUp={soltar}
            onPointerCancel={soltar}
          >
            <div className="w-1.5 h-4 rounded-sm bg-emerald-500" />
          </div>
          {/* Barrinha: tamanho da letra e voltar pro rodapé */}
          <div
            data-html2canvas-ignore="true"
            className="absolute left-1/2 -translate-x-1/2 -top-8 flex items-center gap-1 rounded-md bg-zinc-900 text-white text-[11px] font-bold px-1.5 py-1 shadow whitespace-nowrap"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button className="px-1.5 hover:text-emerald-400" onClick={() => mudarEscala(-0.2)} title="Letra menor">A−</button>
            <span className="text-zinc-400 font-normal">{Math.round(escala * 100)}%</span>
            <button className="px-1.5 hover:text-emerald-400" onClick={() => mudarEscala(0.2)} title="Letra maior">A+</button>
            {solto && (
              <button className="ml-1 px-1.5 border-l border-zinc-700 hover:text-emerald-400" onClick={() => onAjustar(escala !== 1 ? { escala } : null)} title="Volta pro pé do encarte, largura toda">
                Voltar pro rodapé
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
