import { useState } from 'react';
import { Users, Search } from 'lucide-react';
import { VisibilidadeClassificacao } from '../../lib/galeriaVisibilidade';

interface VisibilidadeEditorProps {
  value: VisibilidadeClassificacao;
  onChange: (v: VisibilidadeClassificacao) => void;
  bandeiras: string[];
  grupos: { id: string; name: string }[];
  lojas: { cnpj: string; bandeira: string }[];
}

const soDigitos = (s: string) => (s || '').replace(/\D/g, '');

function Chip({ label, ativo, onClick }: { label: string; ativo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
        ativo
          ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
          : 'bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  );
}

/** Editor controlado de "quem enxerga esta classificação". Sem persistência — o pai salva. */
export default function VisibilidadeEditor({ value, onChange, bandeiras, grupos, lojas }: VisibilidadeEditorProps) {
  const [buscaLoja, setBuscaLoja] = useState('');

  const toggle = (campo: 'cnpjs' | 'bandeiras' | 'grupos', item: string) => {
    const set = new Set(value[campo]);
    set.has(item) ? set.delete(item) : set.add(item);
    onChange({ ...value, [campo]: [...set] });
  };

  const lojasFiltradas = lojas
    .filter((l) => {
      const q = buscaLoja.trim().toLowerCase();
      if (!q) return true;
      return l.cnpj.toLowerCase().includes(q) || (l.bandeira || '').toLowerCase().includes(q);
    })
    .slice(0, 40);

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-2.5 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Quem pode ver</span>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          checked={value.modo === 'todos'}
          onChange={() => onChange({ ...value, modo: 'todos' })}
          className="accent-emerald-500"
        />
        <span className="text-xs text-zinc-200">Exibir para todos</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          checked={value.modo === 'restrito'}
          onChange={() => onChange({ ...value, modo: 'restrito' })}
          className="accent-emerald-500"
        />
        <span className="text-xs text-zinc-200">Exibir só para usuário, bandeira ou grupo</span>
      </label>

      {value.modo === 'restrito' && (
        <div className="space-y-2.5 pl-1 border-l-2 border-zinc-700 ml-1">
          <div className="pl-2 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Bandeiras</p>
            <div className="flex flex-wrap gap-1">
              {bandeiras.length === 0 && <span className="text-[11px] text-zinc-600">nenhuma cadastrada</span>}
              {bandeiras.map((b) => (
                <Chip key={b} label={b} ativo={value.bandeiras.includes(b)} onClick={() => toggle('bandeiras', b)} />
              ))}
            </div>
          </div>

          <div className="pl-2 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Grupos</p>
            <div className="flex flex-wrap gap-1">
              {grupos.length === 0 && <span className="text-[11px] text-zinc-600">nenhum cadastrado</span>}
              {grupos.map((g) => (
                <Chip key={g.id} label={g.name} ativo={value.grupos.includes(g.id)} onClick={() => toggle('grupos', g.id)} />
              ))}
            </div>
          </div>

          <div className="pl-2 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Usuários (lojas){value.cnpjs.length ? ` · ${value.cnpjs.length} marcado(s)` : ''}
            </p>
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                value={buscaLoja}
                onChange={(e) => setBuscaLoja(e.target.value)}
                placeholder="Buscar por CNPJ ou bandeira"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-md pl-6 pr-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-emerald-500/50"
              />
            </div>
            <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
              {lojasFiltradas.map((l) => {
                const d = soDigitos(l.cnpj);
                const marcada = value.cnpjs.map(soDigitos).includes(d);
                return (
                  <label key={l.cnpj} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-zinc-800/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => toggle('cnpjs', l.cnpj)}
                      className="accent-emerald-500 flex-shrink-0"
                    />
                    <span className="text-[11px] text-zinc-300 truncate">{l.cnpj}</span>
                    {l.bandeira && <span className="text-[10px] text-zinc-600 flex-shrink-0">{l.bandeira}</span>}
                  </label>
                );
              })}
              {lojasFiltradas.length === 0 && (
                <p className="text-[11px] text-zinc-600 px-1.5 py-1">nenhuma loja encontrada</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
