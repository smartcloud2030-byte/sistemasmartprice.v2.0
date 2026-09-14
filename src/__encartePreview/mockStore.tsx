// Mock do store para rodar o EncarteBuilder isolado, sem backend/DB.
// Usado só pelo vite.preview.config.ts (alias). Não entra no build real.

import { useEffect, useState } from 'react';

export interface Product {
  id?: string | number;
  name: string;
  description: string;
  subtitle?: string;
  price: string;
  image: string | null;
  thumb_image?: string | null;
  category: string;
  barcode?: string | null;
  barcode2?: string | null;
}

const frasco = (cor: string, rotulo: string) =>
  `data:image/svg+xml;utf8,` +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160">
      <rect x="42" y="6" width="36" height="14" rx="3" fill="${cor}"/>
      <rect x="30" y="20" width="60" height="132" rx="12" fill="${cor}"/>
      <rect x="34" y="60" width="52" height="46" rx="6" fill="#ffffff" opacity="0.92"/>
      <text x="60" y="88" font-family="Arial" font-size="12" font-weight="700" fill="${cor}" text-anchor="middle">${rotulo}</text>
    </svg>`,
  );

const PRODUTOS: Product[] = [
  { id: 1, name: 'Multilaser Termômetro Digital Branco HC148', description: 'Medição rápida e precisa', price: '10,99', image: frasco('#3b82f6', 'TERMO'), category: 'saude' },
  { id: 2, name: 'Bigfral Clássica G C/7 Unidades', description: 'Fralda geriátrica', price: '18,99', image: frasco('#22c55e', 'FRALDA'), category: 'higiene' },
  { id: 3, name: 'Lifree Fralda Calça C/20 Unidades', description: 'Absorção noturna', price: '24,99', image: frasco('#16a34a', 'LIFREE'), category: 'higiene' },
  { id: 4, name: 'Plenty Roupa Íntima Care P/M e G/XG C/32 Unidades', description: 'Proteção discreta', price: '71,99', image: frasco('#0ea5e9', 'PLENTY'), category: 'higiene' },
  { id: 5, name: 'Sustagen Senior Sem Sabor 370g', description: 'Suplemento 22 nutrientes', price: '65,99', image: frasco('#f59e0b', 'SUSTA'), category: 'nutricao' },
  { id: 6, name: 'Nutren Senior Sem Sabor Promoção 370g', description: 'Nutrição diária adultos 50+', price: '84,99', image: frasco('#d97706', 'NUTREN'), category: 'nutricao' },
  { id: 7, name: 'Nutren Senior Café com Leite 370g', description: 'Nutrição diária adultos 50+', price: '89,99', image: frasco('#b45309', 'NUTREN'), category: 'nutricao' },
  { id: 8, name: 'Multilaser Umidificador Easy Air 1,8L', description: 'Ambientes até 30m²', price: '119,99', image: frasco('#64748b', 'UMID'), category: 'casa' },
  { id: 9, name: 'Inalador Nebulizador Omron Compressor NE-C803', description: 'Uso adulto e infantil', price: '126,99', image: frasco('#0284c7', 'OMRON'), category: 'saude' },
  { id: 10, name: 'Dipirona 1g C/10 Comprimidos', description: 'Analgésico e antitérmico', price: '4,99', image: frasco('#ef4444', 'DIPI'), category: 'medicamento' },
  { id: 11, name: 'Paracetamol 750mg C/20 Comprimidos', description: 'Analgésico e antitérmico', price: '7,49', image: frasco('#f97316', 'PARA'), category: 'medicamento' },
  { id: 12, name: 'Vitamina C 1g Efervescente C/10', description: 'Suplemento vitamínico', price: '12,90', image: frasco('#eab308', 'VITC'), category: 'nutricao' },
  { id: 13, name: 'Protetor Solar Facial FPS 60 Toque Seco 50g', description: 'Antioleosidade, resistente à água', price: '54,90', image: frasco('#f59e0b', 'FPS60'), category: 'dermocosmetico' },
  { id: 14, name: 'Álcool em Gel 70% 500ml', description: 'Antisséptico para as mãos', price: '9,99', image: frasco('#14b8a6', 'GEL70'), category: 'higiene' },
  { id: 15, name: 'Fralda Infantil Pompom Tripla Proteção XG C/40', description: 'Absorção 12h', price: '49,90', image: frasco('#38bdf8', 'POMPOM'), category: 'infantil' },
  { id: 16, name: 'Sabonete Líquido Íntimo 200ml', description: 'pH balanceado, uso diário', price: '15,90', image: frasco('#ec4899', 'INTIMO'), category: 'higiene' },
  { id: 17, name: 'Soro Fisiológico 0,9% 500ml', description: 'Limpeza nasal e ocular', price: '6,49', image: frasco('#60a5fa', 'SORO'), category: 'saude' },
  { id: 18, name: 'Creme Dental Total 12 90g', description: 'Proteção anticárie', price: '4,29', image: frasco('#22d3ee', 'DENTAL'), category: 'higiene' },
];

const NOOP = () => {};

const STATE = {
  setView: NOOP,
  products: PRODUTOS,
  fetchProducts: async () => {},
  selectProduct: NOOP,
  setElement: NOOP,
  setOptionalText: NOOP,
  productImage3: { visible: false },
  textElements1: { name: { text: '' }, description: { text: '' }, price: { text: '' } },
  textElements2: { name: { text: '' }, description: { text: '' }, price: { text: '' } },
  textElements3: { name: { text: '' }, description: { text: '' }, price: { text: '' } },
  layouts: [{ name: '' }],
  activeLayoutIndex: 0,
  optionalText1: {},
  optionalText2: {},
  optionalText3: {},
  isSingleProduct: false,
  showOptionalTextControl: false,
  showSingleProductControl: false,
  userRole: 'admin',
  currentUser: { cnpj: '00000000000000', bandeira: 'preview' },
  allowedStores: [] as any[],
  togglePaymentBlock: NOOP,
};

// Fatia reativa (despesas/saldo) pro preview do painel Financeiro — o
// resto do STATE acima é estático (suficiente pros outros previews).
let despesasGlobal: any[] = [];
let saldoGlobal = 0;
let lancamentosGlobal: any[] = [];
const listeners = new Set<() => void>();
const emitir = () => listeners.forEach((l) => l());

export function useStore() {
  const [, forcar] = useState(0);
  useEffect(() => {
    const l = () => forcar((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return {
    ...STATE,
    despesas: despesasGlobal,
    addDespesa: (d: any) => { despesasGlobal = [...despesasGlobal, d]; emitir(); },
    updateDespesa: (id: string, patch: any) => {
      despesasGlobal = despesasGlobal.map((d) => (d.id === id ? { ...d, ...patch } : d));
      emitir();
    },
    removeDespesa: (id: string) => { despesasGlobal = despesasGlobal.filter((d) => d.id !== id); emitir(); },
    saldoEmConta: saldoGlobal,
    setSaldoEmConta: (v: number) => { saldoGlobal = v; emitir(); },
    lancamentosSaldo: lancamentosGlobal,
    registrarLancamentoSaldo: (l: any) => {
      saldoGlobal += l.valor;
      lancamentosGlobal = [...lancamentosGlobal, { ...l, id: crypto.randomUUID(), data: new Date().toISOString() }];
      emitir();
    },
  } as any;
}

export const isThreeProduct = () => false;
