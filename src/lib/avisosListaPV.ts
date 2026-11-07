// Avisos de vencimento da Lista PV pros usuários liberados (CNPJ inteiro ou
// só alguns nomes). Três marcos por produto, cada um avisa uma vez:
//   vermelho → entrou no período mais próximo do vencimento (padrão até 30 dias)
//   semana   → falta 1 semana (7 dias ou menos)
//   umDia    → falta 1 dia (amanhã ou hoje)
// Vencido não avisa (já aparece em vermelho escuro na lista).
// Sem React nem xlsx aqui — só regra; o "já avisado" fica no navegador.
import { diasParaVencer, type ItemPV } from './listaPV';

export type MarcoPV = 'vermelho' | 'semana' | 'umDia';

export const ROTULO_MARCO: Record<MarcoPV, string> = {
  umDia: 'Falta 1 dia',
  semana: 'Falta 1 semana',
  vermelho: 'Entrou no período mais próximo',
};

/** Marco mais urgente que o produto já alcançou (null = longe ou já vencido). */
export function marcoPV(dias: number, limiteVermelho: number): MarcoPV | null {
  if (dias < 0) return null;
  if (dias <= 1) return 'umDia';
  if (dias <= 7) return 'semana';
  if (dias <= limiteVermelho) return 'vermelho';
  return null;
}

export interface AvisoPV {
  chave: string;
  item: ItemPV;
  dias: number;
  marco: MarcoPV;
}

/** Chave do "já avisado": muda se o vencimento do item mudar (reimportação/edição). */
export const chaveAviso = (item: ItemPV, marco: MarcoPV) => `${item.id}|${item.vencimento}|${marco}`;

/**
 * Produtos com marco ainda não avisado, do mais urgente pro menos.
 * Só o marco atual conta: quem entrou na lista já faltando 3 dias recebe
 * "falta 1 semana", não os dois.
 */
export function avisosPendentes(itens: ItemPV[], limiteVermelho: number, vistos: Set<string>, hoje = new Date()): AvisoPV[] {
  const out: AvisoPV[] = [];
  for (const item of itens) {
    const dias = diasParaVencer(item.vencimento, hoje);
    const marco = marcoPV(dias, limiteVermelho);
    if (!marco) continue;
    const chave = chaveAviso(item, marco);
    if (!vistos.has(chave)) out.push({ chave, item, dias, marco });
  }
  return out.sort((a, b) => a.dias - b.dias || a.item.produto.localeCompare(b.item.produto));
}

/** Tira do "já avisado" o que não existe mais na lista, pra não crescer pra sempre. */
export function limparVistos(vistos: Set<string>, itens: ItemPV[]): Set<string> {
  const ids = new Set(itens.map((i) => i.id));
  return new Set([...vistos].filter((c) => ids.has(c.split('|')[0])));
}

export const textoDias = (dias: number) => (dias === 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`);
