// ─────────────────────────────────────────
// whatsappComandos.ts — parsing/roteamento puro dos comandos de texto da
// conversa de despesas de viagem no WhatsApp (fase 5). Sem I/O: recebe texto
// (e, quando precisa combinar, a lista de viagens abertas) e devolve dados
// estruturados. Usado por src/whatsappBot.ts, testado com node:assert/tsx.
// ─────────────────────────────────────────
import {
  CATEGORIAS_VALIDAS,
  type CategoriaDespesa,
  rotuloCategoria,
  centavosParaBRL,
  reaisParaCentavos,
} from './despesasViagemReport';

export interface ViagemAberta {
  id: string;
  titulo: string;
  destino: string | null;
  total_centavos: number;
}

export interface NovaViagemParseada {
  destino: string;
  motivo: string | null;
}

export function parseNovaViagem(texto: string): NovaViagemParseada | null {
  const m = /^nova\s+viagem\s+(.+)$/i.exec(texto.trim());
  if (!m) return null;
  const resto = m[1].trim();
  if (!resto) return null;
  const [destinoBruto, ...motivoPartes] = resto.split('/');
  const destino = destinoBruto.trim();
  if (!destino) return null;
  const motivo = motivoPartes.join('/').trim() || null;
  return { destino, motivo };
}

export function tituloViagem({ destino, motivo }: NovaViagemParseada): string {
  return motivo ? `${destino} (${motivo})` : destino;
}

export function ehComandoListagem(texto: string): boolean {
  return /^(minhas\s+viagens|status)$/i.test(texto.trim());
}

export function ehComandoFecharForcado(texto: string): boolean {
  return /^fechar\s+mesmo$/i.test(texto.trim());
}

export function ehComandoFechar(texto: string): boolean {
  return /^(fechar\s+viagem|relat[oó]rio)$/i.test(texto.trim());
}

export function ehConfirmacao(texto: string): boolean {
  return /^(ok|confirmar)$/i.test(texto.trim());
}

export interface CorrecaoValor {
  campo: 'valor';
  valorCentavos: number;
}
export interface CorrecaoCategoria {
  campo: 'categoria';
  categoria: CategoriaDespesa;
}
export interface CorrecaoData {
  campo: 'data';
  dataDespesa: string; // ISO YYYY-MM-DD
}
export type Correcao = CorrecaoValor | CorrecaoCategoria | CorrecaoData;

const ROTULO_PARA_CATEGORIA: Record<string, CategoriaDespesa> = Object.fromEntries(
  (CATEGORIAS_VALIDAS as readonly string[]).map((c) => [
    rotuloCategoria(c).toLowerCase(),
    c as CategoriaDespesa,
  ]),
);

function normalizarCategoria(texto: string): CategoriaDespesa | null {
  const t = texto.trim().toLowerCase();
  if ((CATEGORIAS_VALIDAS as readonly string[]).includes(t)) return t as CategoriaDespesa;
  return ROTULO_PARA_CATEGORIA[t] ?? null;
}

// Aceita dd/mm ou dd/mm/aaaa; sem ano, usa o ano de referência (hoje, por padrão).
function parseDataBR(texto: string, anoReferencia: number): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(texto.trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  let ano = anoReferencia;
  if (m[3]) {
    ano = Number(m[3]);
    if (m[3].length === 2) ano += 2000;
  }
  const dt = new Date(Date.UTC(ano, mes - 1, dia));
  if (dt.getUTCFullYear() !== ano || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function parseCorrecao(texto: string, agora: Date = new Date()): Correcao | null {
  const t = texto.trim();

  let m = /^valor\s+(.+)$/i.exec(t);
  if (m) {
    const centavos = reaisParaCentavos(m[1]);
    return centavos === null ? null : { campo: 'valor', valorCentavos: centavos };
  }

  m = /^categoria\s+(.+)$/i.exec(t);
  if (m) {
    const categoria = normalizarCategoria(m[1]);
    return categoria === null ? null : { campo: 'categoria', categoria };
  }

  m = /^data\s+(.+)$/i.exec(t);
  if (m) {
    const dataDespesa = parseDataBR(m[1], agora.getUTCFullYear());
    return dataDespesa === null ? null : { campo: 'data', dataDespesa };
  }

  return null;
}

// Casa o texto contra título/destino das viagens abertas (case-insensitive,
// substring). Só resolve se houver exatamente um match.
export function matchViagem(texto: string, viagensAbertas: ViagemAberta[]): ViagemAberta | null {
  const alvo = texto.trim().toLowerCase();
  if (!alvo) return null;
  const achados = viagensAbertas.filter(
    (v) => v.titulo.toLowerCase().includes(alvo) || (v.destino ?? '').toLowerCase().includes(alvo),
  );
  return achados.length === 1 ? achados[0] : null;
}

export interface DespesaParaCard {
  categoria: string;
  valorCentavos: number | null;
  estabelecimento: string | null;
  dataDespesa: string | null; // ISO
  confianca: string | null;
}

function formatarDataCard(iso: string | null): string {
  if (!iso) return 's/ data';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function formatarCard(d: DespesaParaCard): string {
  const valor = d.valorCentavos == null ? 'valor não lido' : centavosParaBRL(d.valorCentavos);
  const linha =
    `${rotuloCategoria(d.categoria)} · ${valor} · ` +
    `${d.estabelecimento || 's/ estabelecimento'} · ${formatarDataCard(d.dataDespesa)}`;
  const aviso =
    d.confianca === 'baixa' || d.valorCentavos == null
      ? '\n⚠️ confira os dados — corrige com "valor 245,90", "categoria pedágio" ou "data 08/09".'
      : '\nResponde *ok* pra lançar, ou corrige: "valor 245,90", "categoria pedágio", "data 08/09".';
  return `${linha}${aviso}`;
}

export function listaViagensAbertas(viagens: ViagemAberta[]): string {
  if (viagens.length === 0) return 'Nenhuma viagem aberta. Manda "nova viagem <destino> / <motivo>" pra abrir uma.';
  return viagens.map((v) => `• ${v.titulo} — ${centavosParaBRL(Number(v.total_centavos))}`).join('\n');
}
