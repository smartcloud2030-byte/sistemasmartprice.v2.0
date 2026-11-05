// Regras de divulgação de produto em ENCARTE (peça de propaganda). Plaquinha
// de gôndola não entra aqui — preço na gôndola é informação, não propaganda.
//
//  - Medicamento com receita (tarja vermelha/preta): RDC 96/2008 da Anvisa
//    proíbe propaganda ao público → não entra no encarte.
//  - Fórmula infantil (0-12 meses), mamadeira, bico e chupeta: Lei 11.265/2006
//    proíbe promoção comercial → não entra no encarte.
//  - Leites, compostos lácteos, fórmulas de 1ª infância (fase 3), cereais e
//    papinhas: promoção permitida COM a frase do Ministério da Saúde.
//  - Medicamento sem receita (MIP): permitido COM a advertência da RDC 96/2008.

/** Tarja vinda da lista CMED: V vermelha, P preta, L sem tarja, '' sem informação, null = não é remédio da CMED. */
export type Tarja = 'V' | 'P' | 'L' | '' | null;

export type ChaveFrase = 'leite' | 'medicamento';

export type Restricao =
  | { nivel: 'bloqueado'; lei: string; motivo: string }
  | { nivel: 'frase'; chave: ChaveFrase; lei: string; composto?: boolean };

// Textos no padrão que as redes já usam nos encartes (caixa alta, letra miúda no pé).
export const FRASES = {
  leite: 'O MINISTÉRIO DA SAÚDE ADVERTE: O ALEITAMENTO MATERNO EVITA INFECÇÕES E ALERGIAS E É RECOMENDADO ATÉ OS DOIS ANOS DE IDADE OU MAIS.',
  composto: 'ESTE COMPOSTO NÃO DEVE SER USADO PARA ALIMENTAR CRIANÇAS MENORES DE UM ANO.',
  medicamento: 'ESTES SÃO MEDICAMENTOS. SEU USO PODE TRAZER RISCOS. PROCURE O MÉDICO E O FARMACÊUTICO. LEIA A BULA. SE PERSISTIREM OS SINTOMAS, O MÉDICO DEVERÁ SER CONSULTADO.',
};

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Produtos que só têm "leite" no nome mas não são leite (cosmético, culinária).
const NAO_E_LEITE = /creme de leite|doce de leite|leite condensad|leite de (rosas|colonia|aveia|coco)|leite (hidratante|corporal|demaquilante|de limpeza|solar|protetor|desodorante)|hidratante|loca[cç]ao|sabonete|shampoo|condicionador|protetor/;
const MARCAS_FORMULA = '(nan|aptamil|enfamil|nestogeno|similac|milupa|nutrilon|neslac)';
// Fases 1 e 2 / "pré" = lactente (0-12 meses) → promoção proibida.
const MARCA_FORMULA = new RegExp(`\\b${MARCAS_FORMULA}\\b`);
const FASE_1_A_3_ANOS = /\b(3|4)\b|primeira infancia|kids|junior/;
const FASE_LACTENTE = /\b(1|2|pre|ar|sem lactose|comfor|supreme|pepti|ha)\b/;
const FORMULA_LACTENTE_GENERICA = /formula infantil (para lactentes|de seguimento)/;
const ACESSORIO_BEBE = /\b(mamadeira|chupeta|bico de mamadeira|bico ortodontico|bico de silicone)\b/;
const LEITE = new RegExp(`\\bleite\\b|composto lacteo|formula infantil|farinha lactea|cereal infantil|\\bmucilon\\b|\\bneston\\b|\\bmilnutri\\b|\\bninho\\b|papinha|\\b${MARCAS_FORMULA}\\b`);

export function avaliarProduto(p: { nome?: string; descricao?: string }, tarja: Tarja): Restricao | null {
  if (tarja === 'V' || tarja === 'P') {
    return {
      nivel: 'bloqueado',
      lei: 'RDC 96/2008 (Anvisa)',
      motivo: `Medicamento com receita (tarja ${tarja === 'P' ? 'preta' : 'vermelha'}) não pode ter propaganda pro público.`,
    };
  }
  if (tarja === 'L' || tarja === '') return { nivel: 'frase', chave: 'medicamento', lei: 'RDC 96/2008 (Anvisa)' };

  const texto = semAcento(`${p.nome || ''} ${p.descricao || ''}`);
  if (ACESSORIO_BEBE.test(texto)) {
    return { nivel: 'bloqueado', lei: 'Lei 11.265/2006', motivo: 'Mamadeira, bico e chupeta não podem ter promoção comercial.' };
  }
  const lactente =
    FORMULA_LACTENTE_GENERICA.test(texto) ||
    /\bpre[ -]?(nan|aptamil|enfamil|nestogeno|similac)\b/.test(texto) ||
    (MARCA_FORMULA.test(texto) && !FASE_1_A_3_ANOS.test(texto) && FASE_LACTENTE.test(texto));
  if (lactente) {
    return { nivel: 'bloqueado', lei: 'Lei 11.265/2006', motivo: 'Fórmula infantil pra bebê de até 1 ano (fase 1, 2 ou pré) não pode ter promoção comercial.' };
  }
  if (LEITE.test(texto) && !NAO_E_LEITE.test(texto)) {
    const composto = /composto lacteo|\bfases\b|\d\s?\+|milnutri|primeira infancia/.test(texto) || (MARCA_FORMULA.test(texto) && FASE_1_A_3_ANOS.test(texto));
    return { nivel: 'frase', chave: 'leite', lei: 'Lei 11.265/2006', composto };
  }
  return null;
}

/** Texto miúdo do pé do encarte: `texto` normal (produto a produto + frase do leite) e `destaque` em negrito (medicamentos). */
export function montarAvisosLegais(
  itens: { nome: string; restricao: Restricao | null; registro?: string }[],
): { texto: string; destaque: string } | null {
  const partes: string[] = [];
  const meds: string[] = [];
  let temLeite = false;
  for (const { nome, restricao, registro } of itens) {
    if (restricao?.nivel !== 'frase') continue;
    const n = nome.trim().replace(/\.$/, '');
    if (restricao.chave === 'medicamento') meds.push(registro ? `${n}. Reg. M.S ${registro}.` : `${n}.`);
    else {
      temLeite = true;
      if (restricao.composto) partes.push(`${n}. ${FRASES.composto}`);
    }
  }
  if (meds.length) partes.unshift(meds.join(' | '));
  if (temLeite) partes.push(FRASES.leite);
  if (!partes.length) return null;
  return { texto: partes.join(' '), destaque: meds.length ? FRASES.medicamento : '' };
}
