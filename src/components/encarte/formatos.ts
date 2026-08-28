export type FormatoId = 'a4' | 'digital' | 'post' | 'quadrado' | 'stories';

export interface Formato {
  id: FormatoId;
  label: string;
  sublabel: string;
  /** dimensões nominais em pixels (referência de exportação) */
  width: number;
  height: number;
  /** largura / altura, derivado de width/height */
  ratio: number;
}

const criar = (
  id: FormatoId,
  label: string,
  sublabel: string,
  width: number,
  height: number,
): Formato => ({ id, label, sublabel, width, height, ratio: width / height });

export const FORMATOS: Formato[] = [
  criar('a4', 'A4 Vertical', 'Impressão', 2480, 3508),
  criar('digital', 'Digital', 'Post / tela', 1080, 1350),
  criar('post', 'Post Vertical', 'Instagram, Facebook', 1080, 1350),
  criar('quadrado', 'Post Quadrado', 'Instagram, WhatsApp', 1080, 1080),
  criar('stories', 'Stories', 'Instagram, Facebook', 1080, 1920),
];

export const FORMATO_PADRAO: Formato = FORMATOS[0];

export const getFormato = (id: FormatoId): Formato =>
  FORMATOS.find((f) => f.id === id) ?? FORMATO_PADRAO;
