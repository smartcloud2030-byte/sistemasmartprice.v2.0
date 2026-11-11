import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Loader2, Search, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '../../store';
import { MARCADOR_WHATSAPP, MARCADOR_INSTAGRAM } from './iconesTexto';

const soDigitos = (v: string) => (v || '').replace(/\D/g, '');

function formatarCnpj(v: string): string {
  const d = soDigitos(v);
  if (d.length !== 14) return v;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const ESTADOS: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
/** "RUA ELOI FERREIRA" → "Rua Eloi Ferreira" (preposições em minúsculo). */
function capitalizar(v: string): string {
  return (v || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

function formatarTelefone(raw: string | undefined): string {
  const d = soDigitos(raw || '');
  if (d.length < 10) return '';
  const ddd = d.slice(0, 2);
  const r = d.slice(2);
  return r.length === 9 ? `(${ddd})${r.slice(0, 5)}-${r.slice(5)}` : `(${ddd})${r.slice(0, 4)}-${r.slice(4)}`;
}

interface DadosLoja { endereco: string; telefone: string }

/** Endereço no padrão dos encartes: "Rua Eloi Ferreira Nº 33, Itaueira - Piauí". */
async function buscarLoja(cnpj: string): Promise<DadosLoja | null> {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (!res.ok) return null;
  const r = await res.json();
  const rua = capitalizar([r?.descricao_tipo_de_logradouro, r?.logradouro].filter(Boolean).join(' '));
  const numero = (r?.numero || '').trim();
  const ruaNum = rua ? (numero && !/^s\/?n$/i.test(numero) ? `${rua} Nº ${numero}` : rua) : '';
  const bairro = capitalizar(r?.bairro || '');
  const cidade = capitalizar(r?.municipio || '');
  const uf = (r?.uf || '').toUpperCase();
  const cidadeUf = [cidade, ESTADOS[uf] || uf].filter(Boolean).join(' - ');
  const endereco = [ruaNum, bairro, cidadeUf].filter(Boolean).join(', ');
  if (!endereco) return null;
  return { endereco, telefone: formatarTelefone(r?.ddd_telefone_1) };
}

// Cache por CNPJ durante a sessão — evita bater na BrasilAPI de novo.
const cache = new Map<string, DadosLoja>();

// WhatsApp/@ que a pessoa digitou por CNPJ (a Receita não tem) — fica no navegador.
interface Contato { whatsapp: string; instagram: string; endereco?: string }
const chaveContato = (cnpj: string) => `encarte:contato-loja:${cnpj}`;
function lerContato(cnpj: string): Contato | null {
  try { const v = localStorage.getItem(chaveContato(cnpj)); return v ? JSON.parse(v) : null; } catch { return null; }
}
function gravarContato(cnpj: string, c: Contato) {
  try { localStorage.setItem(chaveContato(cnpj), JSON.stringify(c)); } catch { /* sem storage */ }
}

/** Monta o bloco: 1ª linha ícone+WhatsApp e ícone+@, 2ª linha o endereço. */
function montarBloco(c: Contato & { endereco: string }): string {
  const insta = c.instagram.trim() ? `@${c.instagram.trim().replace(/^@+/, '')}` : '';
  const linha1 = [
    c.whatsapp.trim() ? `${MARCADOR_WHATSAPP}${c.whatsapp.trim()}` : '',
    insta ? `${MARCADOR_INSTAGRAM}${insta}` : '',
  ].filter(Boolean).join('  ');
  return [linha1, c.endereco.trim()].filter(Boolean).join('\n');
}

/**
 * Botão "Endereço" da barra do encarte: escolhe o CNPJ da loja, o endereço
 * vem da Receita (BrasilAPI) e a pessoa completa WhatsApp e Instagram (os
 * ícones entram sozinhos). O bloco vai pro rodapé como caixa de texto normal
 * (dois cliques edita). Admin vê todas as lojas; loja vê a sua e as do grupo.
 */
export default function EnderecoPicker({
  compacto,
  onEndereco,
}: {
  compacto: boolean;
  onEndereco: (texto: string) => void;
}) {
  const { userRole, currentUser, allowedStores, userGroups } = useStore();
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [buscando, setBuscando] = useState<string | null>(null);
  // Etapa 2: loja escolhida, conferindo endereço/WhatsApp/Instagram
  const [editando, setEditando] = useState<{ cnpj: string; nome: string } | null>(null);
  const [endereco, setEndereco] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [instagram, setInstagram] = useState('');
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const lojas = useMemo(() => {
    const meu = soDigitos(currentUser?.cnpj || '');
    const minha = allowedStores.find((s) => soDigitos(s.cnpj) === meu);
    const lista = userRole === 'admin'
      ? allowedStores
      : allowedStores.filter((s) => soDigitos(s.cnpj) === meu || (minha?.groupId && s.groupId === minha.groupId));
    const grupo = (id?: string) => userGroups.find((g) => g.id === id)?.name || '';
    return lista
      .filter((s) => soDigitos(s.cnpj).length === 14)
      .map((s) => ({ cnpj: soDigitos(s.cnpj), bandeira: s.bandeira || '', grupo: grupo(s.groupId) }))
      .sort((a, b) => (a.grupo + a.bandeira).localeCompare(b.grupo + b.bandeira, 'pt-BR'));
  }, [userRole, currentUser, allowedStores, userGroups]);

  const f = filtro.trim().toLowerCase();
  const fd = soDigitos(filtro);
  const filtradas = f
    ? lojas.filter((l) => l.bandeira.toLowerCase().includes(f) || l.grupo.toLowerCase().includes(f) || (fd && l.cnpj.includes(fd)))
    : lojas;
  const cnpjDigitado = fd.length === 14 && !lojas.some((l) => l.cnpj === fd) ? fd : null;

  async function escolher(cnpj: string, nome: string) {
    let dados = cache.get(cnpj) || null;
    if (!dados) {
      setBuscando(cnpj);
      try {
        dados = await buscarLoja(cnpj);
      } catch {
        dados = null;
      } finally {
        setBuscando(null);
      }
      if (dados) cache.set(cnpj, dados);
    }
    const salvo = lerContato(cnpj);
    if (!dados && !salvo?.endereco) toast.error('Não achei o endereço desse CNPJ na Receita — digite à mão.');
    setEndereco(salvo?.endereco || dados?.endereco || '');
    setWhatsapp(salvo?.whatsapp ?? dados?.telefone ?? '');
    setInstagram(salvo?.instagram || '');
    setEditando({ cnpj, nome });
  }

  function colocar() {
    if (!editando) return;
    const c = { whatsapp, instagram, endereco };
    const bloco = montarBloco(c);
    if (!bloco.trim()) { toast.error('Preencha o endereço ou um contato.'); return; }
    gravarContato(editando.cnpj, c);
    onEndereco(bloco);
    setAberto(false);
    setEditando(null);
    setFiltro('');
  }

  const campo = 'w-full px-2.5 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none';
  const rotulo = 'block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1';

  return (
    <div className="relative" ref={caixa}>
      <button
        onClick={() => { setAberto((v) => !v); setEditando(null); }}
        title="Adicionar endereço da loja (pelo CNPJ)"
        className={
          'whitespace-nowrap flex items-center gap-1.5 py-2 rounded-lg transition-colors text-xs font-semibold ' +
          (compacto ? 'px-2 ' : 'px-3 ') +
          (aberto ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200')
        }
      >
        <MapPin className="w-3.5 h-3.5" />
        Endereço da loja
      </button>
      {aberto && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50">
          {editando ? (
            <div className="p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <button onClick={() => setEditando(null)} title="Voltar" className="p-1 -ml-1 text-zinc-400 hover:text-zinc-100">
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-zinc-200 truncate">{editando.nome}</span>
                  <span className="block text-[10px] text-zinc-500">{formatarCnpj(editando.cnpj)}</span>
                </span>
              </div>
              <div>
                <label className={rotulo}>Endereço</label>
                <textarea value={endereco} onChange={(e) => setEndereco(e.target.value)} rows={2} className={campo + ' resize-none'} />
              </div>
              <div>
                <label className={rotulo}>Número (WhatsApp)</label>
                <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(89)98804-2291" className={campo} />
              </div>
              <div>
                <label className={rotulo}>Instagram</label>
                <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@ultrapopular_itaueira" className={campo} />
              </div>
              <p className="text-[10px] text-zinc-500">Os ícones do WhatsApp e do Instagram entram sozinhos. Campo vazio fica de fora. Vai pro rodapé, e dá pra editar com dois cliques.</p>
              <button onClick={colocar} className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors">
                Colocar no encarte
              </button>
            </div>
          ) : (
            <>
              <p className="px-3 pt-2 pb-1 text-[9px] font-black uppercase tracking-widest text-zinc-600">
                Endereço da loja
              </p>
              <div className="px-3 pb-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    autoFocus
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    placeholder="Buscar loja ou digitar CNPJ"
                    className={campo + ' pl-8'}
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto border-t border-zinc-800">
                {cnpjDigitado && (
                  <ItemLoja
                    titulo={`Usar CNPJ ${formatarCnpj(cnpjDigitado)}`}
                    sub="Buscar o endereço na Receita"
                    buscando={buscando === cnpjDigitado}
                    onClick={() => escolher(cnpjDigitado, formatarCnpj(cnpjDigitado))}
                  />
                )}
                {filtradas.map((l) => (
                  <ItemLoja
                    key={l.cnpj}
                    titulo={l.bandeira || formatarCnpj(l.cnpj)}
                    sub={[formatarCnpj(l.cnpj), l.grupo].filter(Boolean).join(' · ')}
                    buscando={buscando === l.cnpj}
                    onClick={() => escolher(l.cnpj, l.bandeira || formatarCnpj(l.cnpj))}
                  />
                ))}
                {!cnpjDigitado && filtradas.length === 0 && (
                  <p className="px-3.5 py-3 text-[11px] text-zinc-500">
                    Nenhuma loja encontrada. Digite o CNPJ completo (14 números) pra buscar.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ItemLoja({ titulo, sub, buscando, onClick }: { titulo: string; sub: string; buscando: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={buscando}
      className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-zinc-800 transition-colors text-left border-b border-zinc-800/60 last:border-b-0 disabled:opacity-60"
    >
      {buscando
        ? <Loader2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 animate-spin" />
        : <MapPin className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-zinc-200 truncate">{titulo}</span>
        <span className="block text-[10px] text-zinc-500 truncate">{sub}</span>
      </span>
    </button>
  );
}
