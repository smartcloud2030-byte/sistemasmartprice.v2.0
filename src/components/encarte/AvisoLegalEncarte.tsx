import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { AjusteAvisoLegal } from './encarteProduto';

// Letra miúda obrigatória por lei (remédio sem receita, leite). Nasce no pé
// do encarte; o usuário pode arrastar, redimensionar pelos 4 lados e cantos,
// mudar o tamanho da letra e as cores. Sem posição = rodapé, largura toda.

const FONTE_BASE = 5; // px no espaço do canvas (480 de largura)
const ESCALA_MIN = 0.6;
const ESCALA_MAX = 3;
const FUNDO_PADRAO = 'rgba(255,255,255,0.92)';
const TEXTO_PADRAO = '#111111';

const FUNDOS: { nome: string; valor: string; amostra: string }[] = [
  { nome: 'Transparente', valor: 'transparent', amostra: 'repeating-conic-gradient(#d4d4d8 0% 25%, #fff 0% 50%) 50% / 8px 8px' },
  { nome: 'Branco', valor: FUNDO_PADRAO, amostra: '#ffffff' },
  { nome: 'Preto', valor: '#000000', amostra: '#000000' },
  { nome: 'Amarelo', valor: '#ffe600', amostra: '#ffe600' },
];
const CORES_TEXTO = ['#111111', '#ffffff', '#e30613'];

// Alças: quais bordas cada uma mexe (e = esquerda, d = direita, c = cima, b = baixo).
type Borda = 'e' | 'd' | 'c' | 'b';
const ALCAS: { bordas: Borda[]; cls: string; cursor: string }[] = [
  { bordas: ['e'], cls: 'top-1/2 -left-1 -translate-y-1/2 w-2 h-4', cursor: 'ew-resize' },
  { bordas: ['d'], cls: 'top-1/2 -right-1 -translate-y-1/2 w-2 h-4', cursor: 'ew-resize' },
  { bordas: ['c'], cls: 'left-1/2 -top-1 -translate-x-1/2 w-4 h-2', cursor: 'ns-resize' },
  { bordas: ['b'], cls: 'left-1/2 -bottom-1 -translate-x-1/2 w-4 h-2', cursor: 'ns-resize' },
  { bordas: ['e', 'c'], cls: '-left-1 -top-1 w-2.5 h-2.5', cursor: 'nwse-resize' },
  { bordas: ['d', 'c'], cls: '-right-1 -top-1 w-2.5 h-2.5', cursor: 'nesw-resize' },
  { bordas: ['e', 'b'], cls: '-left-1 -bottom-1 w-2.5 h-2.5', cursor: 'nesw-resize' },
  { bordas: ['d', 'b'], cls: '-right-1 -bottom-1 w-2.5 h-2.5', cursor: 'nwse-resize' },
];

interface Props {
  texto: string;
  destaque: string;
  ajuste: AjusteAvisoLegal | null | undefined;
  onAjustar: (ajuste: AjusteAvisoLegal | null, opcoes?: { coalesce?: string }) => void;
  /** avisa quando seleciona/solta (o painel lateral de edição segue isso) */
  onSelecionado?: (sel: boolean) => void;
  /** muda de valor quando o painel lateral pede pra soltar a seleção */
  soltarToken?: number;
}

type Caixa = { xPct: number; yPct: number; wPct: number; hPct: number };

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export default function AvisoLegalEncarte({ texto, destaque, ajuste, onAjustar, onSelecionado, soltarToken }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [selecionado, setSelecionado] = useState(false);
  const arraste = useRef<{ bordas: Borda[] | 'mover'; x0: number; y0: number; pagina: DOMRect; inicio: Caixa } | null>(null);

  useEffect(() => { onSelecionado?.(selecionado); }, [selecionado]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (soltarToken) setSelecionado(false); }, [soltarToken]);
  useEffect(() => () => onSelecionado?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clique fora tira a seleção (menos no painel lateral, onde ficam as opções).
  useEffect(() => {
    if (!selecionado) return;
    const fora = (e: PointerEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest?.('[data-painel-lateral]')) return;
      if (ref.current && !ref.current.contains(e.target as Node)) setSelecionado(false);
    };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [selecionado]);

  const escala = ajuste?.escala ?? 1;
  const fundo = ajuste?.fundo ?? FUNDO_PADRAO;
  const corTexto = ajuste?.corTexto ?? TEXTO_PADRAO;
  // Solto = foi arrastado/redimensionado; sem posição fica no rodapé.
  const solto = ajuste?.xPct != null;

  /** Página do encarte (no modo rodapé o aviso fica dentro da faixa do rodapé). */
  const pagina = () => {
    const el = ref.current!;
    return (solto ? el.parentElement : el.parentElement?.parentElement)!.getBoundingClientRect();
  };

  /** Caixa atual em % da página — vira o ponto de partida quando ainda está no rodapé. */
  const caixaAtual = (pag: DOMRect): Caixa => {
    const r = ref.current!.getBoundingClientRect();
    return {
      xPct: ajuste?.xPct ?? ((r.left - pag.left) / pag.width) * 100,
      yPct: ajuste?.yPct ?? ((r.top - pag.top) / pag.height) * 100,
      wPct: ajuste?.wPct ?? (r.width / pag.width) * 100,
      hPct: ajuste?.hPct ?? (r.height / pag.height) * 100,
    };
  };

  const iniciar = (bordas: Borda[] | 'mover') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSelecionado(true);
    const pag = pagina();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    arraste.current = { bordas, x0: e.clientX, y0: e.clientY, pagina: pag, inicio: caixaAtual(pag) };
  };

  const mover = (e: React.PointerEvent) => {
    const st = arraste.current;
    if (!st) return;
    const dx = ((e.clientX - st.x0) / st.pagina.width) * 100;
    const dy = ((e.clientY - st.y0) / st.pagina.height) * 100;
    if (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2 && !solto) return; // clique simples não solta do rodapé
    let { xPct, yPct, wPct, hPct } = st.inicio;
    if (st.bordas === 'mover') {
      xPct = limitar(xPct + dx, 0, 100 - wPct);
      yPct = limitar(yPct + dy, 0, 100 - Math.min(hPct, 100));
    } else {
      const b = st.bordas;
      if (b.includes('e')) { const nx = limitar(xPct + dx, 0, xPct + wPct - 10); wPct += xPct - nx; xPct = nx; }
      if (b.includes('d')) wPct = limitar(wPct + dx, 10, 100 - xPct);
      if (b.includes('c')) { const ny = limitar(yPct + dy, 0, yPct + hPct - 1); hPct += yPct - ny; yPct = ny; }
      if (b.includes('b')) hPct = limitar(hPct + dy, 1, 100 - yPct);
    }
    onAjustar({ ...(ajuste ?? {}), xPct, yPct, wPct, hPct }, { coalesce: 'aviso-legal' });
  };

  const soltar = () => { arraste.current = null; };


  const estiloPosicao: React.CSSProperties = solto
    ? { position: 'absolute', left: `${ajuste!.xPct}%`, top: `${ajuste!.yPct}%`, width: `${ajuste!.wPct}%`, minHeight: ajuste!.hPct != null ? `${ajuste!.hPct}%` : undefined, zIndex: 30 }
    : { position: 'relative' };


  return (
    <div
      ref={ref}
      style={{ ...estiloPosicao, color: corTexto, background: fundo, fontSize: FONTE_BASE * escala, lineHeight: 1.25, pointerEvents: 'auto', touchAction: 'none' }}
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
          {ALCAS.map((a) => (
            <div
              key={a.bordas.join('')}
              data-html2canvas-ignore="true"
              className={`absolute ${a.cls} rounded-sm bg-emerald-500 border border-white`}
              style={{ cursor: a.cursor }}
              onPointerDown={iniciar(a.bordas)}
              onPointerMove={mover}
              onPointerUp={soltar}
              onPointerCancel={soltar}
            />
          ))}

        </>
      )}
    </div>
  );
}

/** Painel lateral do texto obrigatório (letra, fundo, cor da letra, voltar pro rodapé). */
export function AvisoLegalPainel({ ajuste, onAjustar, onFechar }: {
  ajuste: AjusteAvisoLegal | null | undefined;
  onAjustar: (ajuste: AjusteAvisoLegal | null, opcoes?: { coalesce?: string }) => void;
  onFechar: () => void;
}) {
  const escala = ajuste?.escala ?? 1;
  const fundo = ajuste?.fundo ?? FUNDO_PADRAO;
  const corTexto = ajuste?.corTexto ?? TEXTO_PADRAO;
  const solto = ajuste?.xPct != null;
  const mudar = (patch: Partial<AjusteAvisoLegal>, chave: string) => onAjustar({ ...(ajuste ?? {}), ...patch }, { coalesce: chave });
  const voltarProRodape = () => {
    const { xPct, yPct, wPct, hPct, ...resto } = ajuste ?? {};
    onAjustar(Object.keys(resto).length ? resto : null);
  };
  const quadrado = (ativo: boolean) => `w-7 h-7 rounded border ${ativo ? 'border-emerald-400 ring-2 ring-emerald-500/50' : 'border-zinc-600'}`;
  const arcoIris = 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)';

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={onFechar} title="Fechar" className="p-1.5 -ml-1.5 hover:bg-zinc-800 rounded-lg transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Texto do rodapé</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">Aviso obrigatório por lei — arraste no encarte pra mudar de lugar</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-300">Tamanho da letra</h3>
          <span className="text-[10px] tabular-nums text-zinc-500">{Math.round(escala * 100)}%</span>
        </div>
        <input
          type="range"
          min={ESCALA_MIN}
          max={ESCALA_MAX}
          step={0.1}
          value={escala}
          onChange={(e) => mudar({ escala: limitar(Number(e.target.value), ESCALA_MIN, ESCALA_MAX) }, 'aviso-legal-escala')}
          className="w-full accent-emerald-500"
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-300">Fundo</h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          {FUNDOS.map((f) => (
            <button key={f.nome} title={f.nome} className={quadrado(fundo === f.valor)} style={{ background: f.amostra }} onClick={() => mudar({ fundo: f.valor }, 'aviso-legal-cor')} />
          ))}
          <label title="Outra cor de fundo" className={`${quadrado(false)} relative overflow-hidden cursor-pointer`} style={{ background: arcoIris }}>
            <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={/^#[0-9a-f]{6}$/i.test(fundo) ? fundo : '#ffffff'} onChange={(e) => mudar({ fundo: e.target.value }, 'aviso-legal-cor')} />
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-300">Cor da letra</h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          {CORES_TEXTO.map((c) => (
            <button key={c} title={c} className={quadrado(corTexto.toLowerCase() === c)} style={{ background: c }} onClick={() => mudar({ corTexto: c }, 'aviso-legal-cor')} />
          ))}
          <label title="Outra cor de letra" className={`${quadrado(false)} relative overflow-hidden cursor-pointer`} style={{ background: arcoIris }}>
            <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={/^#[0-9a-f]{6}$/i.test(corTexto) ? corTexto : '#111111'} onChange={(e) => mudar({ corTexto: e.target.value }, 'aviso-legal-cor')} />
          </label>
        </div>
      </div>

      {solto && (
        <button
          onClick={voltarProRodape}
          className="w-full px-3 py-2 rounded-lg border border-zinc-700 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
        >
          Voltar pro rodapé (largura toda)
        </button>
      )}
    </div>
  );
}
