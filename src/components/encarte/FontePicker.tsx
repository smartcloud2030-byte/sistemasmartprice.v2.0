import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { FONTES_ENCARTE } from './encarteProduto';
import { carregarFontesEncarte } from './fontes';

interface FontePickerProps {
  /** fonte atual selecionada */
  valor: string;
  titulo?: string;
  onEscolher: (fonte: string) => void;
  onFechar: () => void;
  className?: string;
}

/** Lista de fontes com busca — cada nome renderiza na própria fonte. */
export default function FontePicker({ valor, titulo, onEscolher, onFechar, className }: FontePickerProps) {
  const [busca, setBusca] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    carregarFontesEncarte();
    inputRef.current?.focus();
  }, []);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? FONTES_ENCARTE.filter((f) => f.toLowerCase().includes(q)) : FONTES_ENCARTE;
  }, [busca]);

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className={
        'w-60 max-w-[calc(100vw-2rem)] bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-[60] overflow-hidden ' +
        (className ?? '')
      }
    >
      {titulo && (
        <p className="px-3 pt-2 pb-1 text-[9px] font-black uppercase tracking-widest text-zinc-600">{titulo}</p>
      )}
      <div className="p-2 border-b border-zinc-800">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            ref={inputRef}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onFechar(); }}
            placeholder={`Buscar em ${FONTES_ENCARTE.length} fontes...`}
            className="w-full pl-7 pr-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-100 outline-none focus:border-emerald-500/60"
          />
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {lista.length === 0 ? (
          <p className="px-3 py-4 text-xs text-zinc-500 text-center">Nenhuma fonte com “{busca}”.</p>
        ) : (
          lista.map((f) => (
            <button
              key={f}
              onClick={() => { onEscolher(f); onFechar(); }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-zinc-800 transition-colors text-left text-[15px] text-zinc-200"
              style={{ fontFamily: `'${f}', sans-serif` }}
            >
              <span className="truncate">{f}</span>
              {valor === f && <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
