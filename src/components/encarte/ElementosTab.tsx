import { Shapes, Plus, Trash2, Minus } from 'lucide-react';
import { DivisorEncarte } from './encarteProduto';

interface ElementosTabProps {
  divisores: DivisorEncarte[];
  rodape: { ativo: boolean; texto: string };
  onAdicionarDivisor: () => void;
  onAtualizarDivisor: (id: string, texto: string) => void;
  onRemoverDivisor: (id: string) => void;
  onAtualizarRodape: (patch: Partial<{ ativo: boolean; texto: string }>) => void;
}

export default function ElementosTab({
  divisores,
  rodape,
  onAdicionarDivisor,
  onAtualizarDivisor,
  onRemoverDivisor,
  onAtualizarRodape,
}: ElementosTabProps) {
  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-2">
        <Shapes className="w-4 h-4 text-emerald-500" />
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Elementos</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">Divisores de seção e rodapé</p>
        </div>
      </div>

      {/* Divisores */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Divisores de seção</h3>
          <button
            onClick={onAdicionarDivisor}
            className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </button>
        </div>

        {divisores.length === 0 ? (
          <p className="text-[11px] text-zinc-600 py-2">Nenhum divisor. O divisor é uma faixa com texto no meio (ex.: "Genéricos e Similares"), arrastável na vertical.</p>
        ) : (
          <div className="space-y-2">
            {divisores.map((d) => (
              <div key={d.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={d.texto}
                  onChange={(e) => onAtualizarDivisor(d.id, e.target.value)}
                  className="flex-grow px-2.5 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <button
                  onClick={() => onRemoverDivisor(d.id)}
                  className="text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0 p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="space-y-2.5">
        <label className="flex items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2.5 cursor-pointer">
          <div className="flex items-center gap-2">
            <Minus className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs font-semibold text-zinc-200">Mostrar rodapé</span>
          </div>
          <input
            type="checkbox"
            checked={rodape.ativo}
            onChange={(e) => onAtualizarRodape({ ativo: e.target.checked })}
            className="w-4 h-4 accent-emerald-500"
          />
        </label>
        {rodape.ativo && (
          <input
            type="text"
            value={rodape.texto}
            onChange={(e) => onAtualizarRodape({ texto: e.target.value })}
            placeholder="Ex.: 5 unidades por cliente | @perfil"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        )}
      </div>
    </div>
  );
}
