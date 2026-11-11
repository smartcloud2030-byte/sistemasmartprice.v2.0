import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Crosshair } from 'lucide-react';
import { getProxyUrl } from '../../lib/utils';
import { ehFundoBuiltin } from './encarteProduto';

/** Posição do fundo (tema) quando ele não cabe inteiro no formato: 0 = topo/esquerda, 50 = centro, 100 = base/direita. */
export interface PosicaoFundo { x: number; y: number }
export const POSICAO_FUNDO_PADRAO: PosicaoFundo = { x: 50, y: 50 };

const proporcoes = new Map<string, number>();

/** largura/altura natural da imagem do tema (null enquanto carrega / fundo embutido). */
export function useProporcaoImagem(url: string | null): number | null {
  const [r, setR] = useState<number | null>(() => (url ? proporcoes.get(url) ?? null : null));
  useEffect(() => {
    if (!url || ehFundoBuiltin(url)) { setR(null); return; }
    const conhecida = proporcoes.get(url);
    if (conhecida) { setR(conhecida); return; }
    setR(null);
    let vivo = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const v = img.naturalWidth / img.naturalHeight;
      proporcoes.set(url, v);
      if (vivo) setR(v);
    };
    img.src = getProxyUrl(url);
    return () => { vivo = false; };
  }, [url]);
  return r;
}

/**
 * Tamanho/posição da imagem do fundo em % da caixa do encarte — o mesmo que
 * `object-fit: cover` + `object-position`, mas com medidas explícitas
 * (o html2canvas do PNG/PDF não entende object-position).
 */
export function caixaDoFundo(propImg: number, propCanvas: number, pos: PosicaoFundo) {
  if (propImg < propCanvas) {
    // imagem mais alta que o encarte: corta em cima/embaixo
    const h = (propCanvas / propImg) * 100;
    return { left: 0, top: -((h - 100) * pos.y) / 100, width: 100, height: h };
  }
  // imagem mais larga: corta nos lados
  const w = (propImg / propCanvas) * 100;
  return { left: -((w - 100) * pos.x) / 100, top: 0, width: w, height: 100 };
}

/**
 * Controle "Posição do fundo": escolhe qual parte do tema aparece quando o
 * formato corta a imagem (sobe/desce, ou esquerda/direita).
 */
export default function AjusteFundo({
  url,
  propCanvas,
  posicao,
  onMudar,
}: {
  url: string | null;
  propCanvas: number;
  posicao?: PosicaoFundo | null;
  onMudar: (p: PosicaoFundo) => void;
}) {
  const propImg = useProporcaoImagem(url);
  if (!url || ehFundoBuiltin(url) || propImg == null) return null;
  const pos = posicao ?? POSICAO_FUNDO_PADRAO;
  const diff = Math.abs(propImg - propCanvas) / propCanvas;
  const cabeInteiro = diff < 0.01;
  const vertical = propImg < propCanvas; // corte em cima/embaixo
  const valor = vertical ? pos.y : pos.x;
  const mudar = (v: number) => {
    const n = Math.max(0, Math.min(100, Math.round(v)));
    onMudar(vertical ? { ...pos, y: n } : { ...pos, x: n });
  };
  const btn = 'flex items-center justify-center gap-1 flex-1 py-1.5 rounded-lg border border-zinc-700 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-3 space-y-2">
      <div>
        <p className="text-xs font-semibold text-zinc-200">Posição do fundo</p>
        <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">
          {cabeInteiro
            ? 'O fundo cabe inteiro neste formato, não precisa ajustar.'
            : vertical
              ? 'Este formato corta o fundo em cima e embaixo. Escolha qual parte aparece.'
              : 'Este formato corta o fundo nos lados. Escolha qual parte aparece.'}
        </p>
      </div>
      {!cabeInteiro && (
        <>
          <div className="flex gap-1.5">
            <button className={btn} disabled={valor >= 100} onClick={() => mudar(valor + 5)} title={vertical ? 'Sobe o fundo (aparece mais da parte de baixo)' : 'Leva o fundo pra esquerda'}>
              {vertical ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
              {vertical ? 'Subir' : 'Esquerda'}
            </button>
            <button className={btn} disabled={valor === 50} onClick={() => mudar(50)} title="Voltar pro centro">
              <Crosshair className="w-3.5 h-3.5" />
              Centro
            </button>
            <button className={btn} disabled={valor <= 0} onClick={() => mudar(valor - 5)} title={vertical ? 'Desce o fundo (aparece mais da parte de cima)' : 'Leva o fundo pra direita'}>
              {vertical ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
              {vertical ? 'Descer' : 'Direita'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-10">{vertical ? 'Topo' : 'Esq.'}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={valor}
              onChange={(e) => mudar(Number(e.target.value))}
              className="flex-1 accent-emerald-500"
            />
            <span className="text-[10px] text-zinc-500 w-10 text-right">{vertical ? 'Base' : 'Dir.'}</span>
          </div>
        </>
      )}
    </div>
  );
}
