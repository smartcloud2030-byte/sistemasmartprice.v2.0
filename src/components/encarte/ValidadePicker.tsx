import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { toast } from 'sonner';

/** Date → "2026-11-10" (fuso local, pro <input type="date">). */
function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-11-10" → "10/11" ou "10/11/2026". */
function br(iso: string, comAno: boolean): string {
  const [a, m, d] = iso.split('-');
  return comAno ? `${d}/${m}/${a}` : `${d}/${m}`;
}

/**
 * Frase da validade: "Ofertas válidas para o dia 10/11/2026" (um dia) ou
 * "Ofertas válidas de 10/11 a 15/11/2026" (período), + "ou enquanto durarem
 * os estoques" opcional.
 */
export function fraseValidade(inicio: string, fim: string, estoque: boolean): string {
  const resto = estoque ? ' ou enquanto durarem os estoques' : '';
  if (!fim) return '';
  if (!inicio || inicio === fim) return `Ofertas válidas para o dia ${br(fim, true)}${resto}`;
  const mesmoAno = inicio.slice(0, 4) === fim.slice(0, 4);
  return `Ofertas válidas de ${br(inicio, !mesmoAno)} a ${br(fim, true)}${resto}`;
}

/**
 * Botão "Validade" da barra do encarte: escolhe início e fim da promoção e a
 * frase entra como caixa de texto normal (dois cliques edita).
 */
export default function ValidadePicker({
  compacto,
  onValidade,
}: {
  compacto: boolean;
  onValidade: (texto: string) => void;
}) {
  const hoje = new Date();
  const [aberto, setAberto] = useState(false);
  const [inicio, setInicio] = useState(isoLocal(hoje));
  const [fim, setFim] = useState(isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 6)));
  const [estoque, setEstoque] = useState(true);
  const [periodo, setPeriodo] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const frase = periodo ? fraseValidade(inicio, fim, estoque) : fraseValidade('', inicio, estoque);

  function colocar() {
    if (!inicio || (periodo && !fim)) { toast.error('Escolha a data da promoção.'); return; }
    if (periodo && inicio > fim) { toast.error('A data inicial está depois da final.'); return; }
    onValidade(frase);
    setAberto(false);
  }

  const campo = 'w-full px-2.5 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none [color-scheme:dark]';
  const rotulo = 'block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1';

  return (
    <div className="relative" ref={caixa}>
      <button
        onClick={() => setAberto((v) => !v)}
        title="Adicionar a validade da promoção"
        className={
          'whitespace-nowrap flex items-center gap-1.5 py-2 rounded-lg transition-colors text-xs font-semibold ' +
          (compacto ? 'px-2 ' : 'px-3 ') +
          (aberto ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200')
        }
      >
        <CalendarDays className="w-3.5 h-3.5" />
        Validade da oferta
      </button>
      {aberto && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50 p-3 space-y-2.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Validade da promoção</p>
          <div className="grid grid-cols-2 border border-zinc-700 rounded-lg overflow-hidden text-[11px] font-semibold">
            {[['Um dia', false], ['Período', true]].map(([nome, v]) => (
              <button
                key={String(v)}
                onClick={() => setPeriodo(v as boolean)}
                className={periodo === v ? 'py-1.5 bg-zinc-700 text-zinc-100' : 'py-1.5 text-zinc-400 hover:bg-zinc-800'}
              >
                {nome as string}
              </button>
            ))}
          </div>
          {periodo ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={rotulo}>De</label>
                <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} />
              </div>
              <div>
                <label className={rotulo}>Até</label>
                <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={campo} />
              </div>
            </div>
          ) : (
            <div>
              <label className={rotulo}>Dia da oferta</label>
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} />
            </div>
          )}
          <label className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={estoque} onChange={(e) => setEstoque(e.target.checked)} className="w-3.5 h-3.5 accent-emerald-500" />
            Incluir "ou enquanto durarem os estoques"
          </label>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-[11px] text-zinc-300">
            {frase || 'Escolha as datas'}
          </div>
          <p className="text-[10px] text-zinc-500">Vai pro rodapé, acima do endereço. Dá pra arrastar e editar com dois cliques.</p>
          <button onClick={colocar} className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors">
            Colocar no encarte
          </button>
        </div>
      )}
    </div>
  );
}
