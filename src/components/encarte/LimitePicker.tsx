import { useEffect, useRef, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';

type Quem = 'cliente' | 'cpf';

/** "Limite de 5 unidades por cliente" / "Limitado a 1 unidade por CPF". */
export function fraseLimite(qtd: number, quem: Quem, modelo: 'limite' | 'limitado'): string {
  const un = qtd === 1 ? 'unidade' : 'unidades';
  const alvo = quem === 'cpf' ? 'CPF' : 'cliente';
  return modelo === 'limitado'
    ? `Produtos limitados a ${qtd} ${un} por ${alvo}`
    : `Limite de ${qtd} ${un} por ${alvo}`;
}

/**
 * Botão "Limite por cliente" da barra do encarte: escolhe a quantidade máxima
 * e a frase entra como caixa de texto normal no rodapé (dois cliques edita).
 */
export default function LimitePicker({
  compacto,
  onLimite,
}: {
  compacto: boolean;
  onLimite: (texto: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [qtd, setQtd] = useState('5');
  const [quem, setQuem] = useState<Quem>('cliente');
  const [modelo, setModelo] = useState<'limite' | 'limitado'>('limite');
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const n = parseInt(qtd, 10);
  const valido = Number.isFinite(n) && n >= 1 && n <= 99;
  const frase = valido ? fraseLimite(n, quem, modelo) : '';

  function colocar() {
    if (!valido) { toast.error('Coloque uma quantidade de 1 a 99.'); return; }
    onLimite(frase);
    setAberto(false);
  }

  const rotulo = 'block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1';
  const opcoes = <T extends string>(lista: [string, T][], atual: T, set: (v: T) => void) => (
    <div className="grid grid-cols-2 border border-zinc-700 rounded-lg overflow-hidden text-[11px] font-semibold">
      {lista.map(([nome, v]) => (
        <button
          key={v}
          onClick={() => set(v)}
          className={atual === v ? 'py-1.5 bg-zinc-700 text-zinc-100' : 'py-1.5 text-zinc-400 hover:bg-zinc-800'}
        >
          {nome}
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative" ref={caixa}>
      <button
        onClick={() => setAberto((v) => !v)}
        title="Limitar a quantidade por cliente"
        className={
          'whitespace-nowrap flex items-center gap-1.5 py-2 rounded-lg transition-colors text-xs font-semibold ' +
          (compacto ? 'px-2 ' : 'px-3 ') +
          (aberto ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200')
        }
      >
        <ShoppingBag className="w-3.5 h-3.5" />
        Limite por cliente
      </button>
      {aberto && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50 p-3 space-y-2.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Produto limitado</p>
          <div>
            <label className={rotulo}>Máximo por cliente</label>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 5, 10].map((v) => (
                <button
                  key={v}
                  onClick={() => setQtd(String(v))}
                  className={
                    'w-9 py-1.5 rounded-md text-xs font-bold border ' +
                    (qtd === String(v) ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800')
                  }
                >
                  {v}
                </button>
              ))}
              <input
                value={qtd}
                onChange={(e) => setQtd(e.target.value.replace(/\D/g, '').slice(0, 2))}
                inputMode="numeric"
                className="w-12 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-100 text-center outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className={rotulo}>Por</label>
            {opcoes<Quem>([['Cliente', 'cliente'], ['CPF', 'cpf']], quem, setQuem)}
          </div>
          <div>
            <label className={rotulo}>Frase</label>
            {opcoes<'limite' | 'limitado'>([['Limite de…', 'limite'], ['Limitados a…', 'limitado']], modelo, setModelo)}
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-[11px] text-zinc-300">
            {frase || 'Escolha a quantidade'}
          </div>
          <p className="text-[10px] text-zinc-500">Vai pro rodapé, acima da validade. Dá pra arrastar e editar com dois cliques.</p>
          <button onClick={colocar} className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors">
            Colocar no encarte
          </button>
        </div>
      )}
    </div>
  );
}
