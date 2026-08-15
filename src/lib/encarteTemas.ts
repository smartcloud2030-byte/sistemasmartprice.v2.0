import type { EncarteFontFamily } from '../store';

export const MOLDE_WIDTH_PX = 2480;
export const MOLDE_HEIGHT_PX = 3508;

export interface EncarteTema {
  id: string;
  nome: string;
  background: { cores: string[]; anguloDeg: number };
  // Sombra no titulo/subtitulo — só os temas com fundo mais claro
  // (Primavera, Dia das Mães) precisam, pra manter contraste do texto
  // branco.
  tituloComSombra: boolean;
  painelClaroColor: string;
  tituloColor: string;
  subtituloColor: string;
  priceBoxColor: string;
  productNameColor: string;
  fontFamily: EncarteFontFamily;
  icone: string;
  iconePosicao: { xPct: number; yPct: number; sizePct: number; opacity: number };
}

const ICONE_PADRAO = { xPct: 62, yPct: 2, sizePct: 30, opacity: 0.25 };

export const ENCARTE_TEMAS: EncarteTema[] = [
  {
    id: 'fecha-mes',
    nome: 'Fecha o Mês',
    background: { cores: ['#7f1d1d', '#dc2626'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#ffffff',
    tituloColor: '#ffffff',
    subtituloColor: '#fef08a',
    priceBoxColor: '#f59e0b',
    productNameColor: '#7f1d1d',
    fontFamily: 'Anton',
    icone: 'TrendingDown',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'verao',
    nome: 'Verão',
    background: { cores: ['#0ea5e9', '#fbbf24'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#ffffff',
    tituloColor: '#ffffff',
    subtituloColor: '#ffffff',
    priceBoxColor: '#f97316',
    productNameColor: '#0369a1',
    fontFamily: 'Poppins',
    icone: 'Sun',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'outono',
    nome: 'Outono',
    background: { cores: ['#b45309', '#78350f'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#fef9ec',
    tituloColor: '#fef3c7',
    subtituloColor: '#fed7aa',
    priceBoxColor: '#c2410c',
    productNameColor: '#78350f',
    fontFamily: 'Playfair Display',
    icone: 'Leaf',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'inverno',
    nome: 'Inverno',
    background: { cores: ['#1e3a8a', '#60a5fa'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#ffffff',
    tituloColor: '#ffffff',
    subtituloColor: '#dbeafe',
    priceBoxColor: '#0369a1',
    productNameColor: '#1e3a8a',
    fontFamily: 'Montserrat',
    icone: 'Snowflake',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'primavera',
    nome: 'Primavera',
    background: { cores: ['#f472b6', '#4ade80'], anguloDeg: 135 },
    tituloComSombra: true,
    painelClaroColor: '#ffffff',
    tituloColor: '#ffffff',
    subtituloColor: '#ffffff',
    priceBoxColor: '#16a34a',
    productNameColor: '#be185d',
    fontFamily: 'Poppins',
    icone: 'Flower2',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'festa-junina',
    nome: 'Festa Junina',
    background: { cores: ['#b91c1c', '#92400e'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#fef9ec',
    tituloColor: '#fef3c7',
    subtituloColor: '#ffffff',
    priceBoxColor: '#991b1b',
    productNameColor: '#92400e',
    fontFamily: 'Oswald',
    icone: 'Flame',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'dia-das-maes',
    nome: 'Dia das Mães',
    background: { cores: ['#fb7185', '#f472b6'], anguloDeg: 135 },
    tituloComSombra: true,
    painelClaroColor: '#ffffff',
    tituloColor: '#ffffff',
    subtituloColor: '#ffffff',
    priceBoxColor: '#db2777',
    productNameColor: '#9d174d',
    fontFamily: 'Playfair Display',
    icone: 'Heart',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'dia-dos-namorados',
    nome: 'Dia dos Namorados',
    background: { cores: ['#dc2626', '#db2777'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#ffffff',
    tituloColor: '#ffffff',
    subtituloColor: '#fecdd3',
    priceBoxColor: '#991b1b',
    productNameColor: '#9f1239',
    fontFamily: 'Playfair Display',
    icone: 'Heart',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'black-friday',
    nome: 'Black Friday',
    background: { cores: ['#111827', '#000000'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#ffffff',
    tituloColor: '#facc15',
    subtituloColor: '#ffffff',
    priceBoxColor: '#dc2626',
    productNameColor: '#111827',
    fontFamily: 'Anton',
    icone: 'Tag',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'natal',
    nome: 'Natal',
    background: { cores: ['#166534', '#7f1d1d'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#ffffff',
    tituloColor: '#ffffff',
    subtituloColor: '#fde68a',
    priceBoxColor: '#b91c1c',
    productNameColor: '#166534',
    fontFamily: 'Playfair Display',
    icone: 'Gift',
    iconePosicao: ICONE_PADRAO,
  },
];

export function getTemaById(id: string): EncarteTema | undefined {
  return ENCARTE_TEMAS.find((t) => t.id === id);
}
