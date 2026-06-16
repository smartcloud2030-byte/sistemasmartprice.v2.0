import React, { useState, useRef, useEffect } from 'react';
import { useStore, Product, EncarteSlot, SelectedProduct, EncarteModel, EncarteTab } from '../store';
import { cn, isValidImageUrl, getProxyUrl } from '../lib/utils';
import { 
  Plus, 
  Trash2, 
  Printer, 
  ArrowLeft, 
  ShoppingBag,
  Package,
  X,
  Settings2,
  Layout as LayoutIcon,
  LayoutGrid,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  Image as ImageIcon2,
  MoveUp,
  MoveDown,
  MoveLeft,
  MoveRight,
  Info,
  Tag,
  Palette,
  Type as TypeIcon,
  AlertCircle,
  Eraser,
  ImagePlus,
  ChevronDown,
  Sliders
} from 'lucide-react';
import { motion } from 'motion/react';
import ProductSelector from './ProductSelector';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

const ENCARTE_MODELS: EncarteModel[] = [
  { id: 'classic', name: 'Clássico Esmeralda', primaryColor: '#059669', secondaryColor: '#10b981', accentColor: '#059669', textColor: '#065f46', bgClass: 'bg-emerald-600', borderClass: 'border-emerald-600' },
  { id: 'modern-blue', name: 'Moderno Azul', primaryColor: '#2563eb', secondaryColor: '#3b82f6', accentColor: '#1d4ed8', textColor: '#1e3a8a', bgClass: 'bg-blue-600', borderClass: 'border-blue-600' },
  { id: 'golden', name: 'Premium Dourado', primaryColor: '#b45309', secondaryColor: '#d97706', accentColor: '#92400e', textColor: '#78350f', bgClass: 'bg-amber-600', borderClass: 'border-amber-600' },
  { id: 'discount-red', name: 'Oferta Vermelha', primaryColor: '#dc2626', secondaryColor: '#ef4444', accentColor: '#b91c1c', textColor: '#7f1d1d', bgClass: 'bg-red-600', borderClass: 'border-red-600' },
  { id: 'night-purple', name: 'Noite Roxa', primaryColor: '#7c3aed', secondaryColor: '#8b5cf6', accentColor: '#6d28d9', textColor: '#4c1d95', bgClass: 'bg-violet-600', borderClass: 'border-violet-600' },
  { id: 'fresh-orange', name: 'Laranja Fresh', primaryColor: '#ea580c', secondaryColor: '#f97316', accentColor: '#c2410c', textColor: '#7c2d12', bgClass: 'bg-orange-600', borderClass: 'border-orange-600' },
  { id: 'minimal-gray', name: 'Minimalista Cinza', primaryColor: '#4b5563', secondaryColor: '#6b7280', accentColor: '#374151', textColor: '#111827', bgClass: 'bg-zinc-600', borderClass: 'border-zinc-600' },
  { id: 'eco-green', name: 'Eco Verde', primaryColor: '#16a34a', secondaryColor: '#22c55e', accentColor: '#15803d', textColor: '#14532d', bgClass: 'bg-green-600', borderClass: 'border-green-600' },
  { id: 'beauty-pink', name: 'Beleza Rosa', primaryColor: '#db2777', secondaryColor: '#ec4899', accentColor: '#be185d', textColor: '#831843', bgClass: 'bg-pink-600', borderClass: 'border-pink-600' },
  { id: 'cyber-neon', name: 'Cyber Neon', primaryColor: '#000000', secondaryColor: '#00ff00', accentColor: '#00ff00', textColor: '#00ff00', bgClass: 'bg-black', borderClass: 'border-green-500' },
  { id: 'royal-gold', name: 'Ouro Real', primaryColor: '#854d0e', secondaryColor: '#a16207', accentColor: '#713f12', textColor: '#422006', bgClass: 'bg-yellow-700', borderClass: 'border-yellow-700' },
  { id: 'ocean-deep', name: 'Oceano Profundo', primaryColor: '#1e3a8a', secondaryColor: '#1e40af', accentColor: '#172554', textColor: '#eff6ff', bgClass: 'bg-blue-900', borderClass: 'border-blue-900' },
  { id: 'sunset-glow', name: 'Brilho do Pôr do Sol', primaryColor: '#9a3412', secondaryColor: '#c2410c', accentColor: '#7c2d12', textColor: '#fff7ed', bgClass: 'bg-orange-800', borderClass: 'border-orange-800' },
  { id: 'forest-leaf', name: 'Folha da Floresta', primaryColor: '#166534', secondaryColor: '#15803d', accentColor: '#14532d', textColor: '#f0fdf4', bgClass: 'bg-green-800', borderClass: 'border-green-800' },
  { id: 'berry-sweet', name: 'Doce de Amora', primaryColor: '#9d174d', secondaryColor: '#be185d', accentColor: '#831843', textColor: '#fdf2f8', bgClass: 'bg-pink-800', borderClass: 'border-pink-800' },
  { id: 'slate-pro', name: 'Ardósia Pro', primaryColor: '#334155', secondaryColor: '#475569', accentColor: '#1e293b', textColor: '#f8fafc', bgClass: 'bg-slate-700', borderClass: 'border-slate-700' },
  { id: 'ruby-red', name: 'Vermelho Rubi', primaryColor: '#991b1b', secondaryColor: '#b91c1c', accentColor: '#7f1d1d', textColor: '#fef2f2', bgClass: 'bg-red-800', borderClass: 'border-red-800' },
  { id: 'indigo-night', name: 'Noite Índigo', primaryColor: '#3730a3', secondaryColor: '#4338ca', accentColor: '#312e81', textColor: '#eef2ff', bgClass: 'bg-indigo-800', borderClass: 'border-indigo-800' },
  { id: 'teal-wave', name: 'Onda de Cerceta', primaryColor: '#115e59', secondaryColor: '#0f766e', accentColor: '#134e4a', textColor: '#f0fdfa', bgClass: 'bg-teal-800', borderClass: 'border-teal-800' },
  { id: 'amber-warmth', name: 'Calor de Âmbar', primaryColor: '#92400e', secondaryColor: '#b45309', accentColor: '#78350f', textColor: '#fffbeb', bgClass: 'bg-amber-800', borderClass: 'border-amber-800' },
  { id: 'lime-zest', name: 'Zest de Lima', primaryColor: '#3f6212', secondaryColor: '#4d7c0f', accentColor: '#365314', textColor: '#f7fee7', bgClass: 'bg-lime-800', borderClass: 'border-lime-800' },
  { id: 'cyan-sky', name: 'Céu Ciano', primaryColor: '#155e75', secondaryColor: '#0e7490', accentColor: '#164e63', textColor: '#ecfeff', bgClass: 'bg-cyan-800', borderClass: 'border-cyan-800' },
  { id: 'rose-petal', name: 'Pétala de Rosa', primaryColor: '#9f1239', secondaryColor: '#be123c', accentColor: '#881337', textColor: '#fff1f2', bgClass: 'bg-rose-800', borderClass: 'border-rose-800' },
  { id: 'violet-dream', name: 'Sonho Violeta', primaryColor: '#5b21b6', secondaryColor: '#6d28d9', accentColor: '#4c1d95', textColor: '#f5f3ff', bgClass: 'bg-violet-800', borderClass: 'border-violet-800' },
  { id: 'emerald-city', name: 'Cidade Esmeralda', primaryColor: '#065f46', secondaryColor: '#047857', accentColor: '#064e3b', textColor: '#ecfdf5', bgClass: 'bg-emerald-800', borderClass: 'border-emerald-800' },
  { id: 'sky-high', name: 'Céu Alto', primaryColor: '#075985', secondaryColor: '#0369a1', accentColor: '#0c4a6e', textColor: '#f0f9ff', bgClass: 'bg-sky-800', borderClass: 'border-sky-800' },
  { id: 'stone-cold', name: 'Pedra Fria', primaryColor: '#292524', secondaryColor: '#44403c', accentColor: '#1c1917', textColor: '#fafaf9', bgClass: 'bg-stone-800', borderClass: 'border-stone-800' },
  { id: 'zinc-solid', name: 'Zinco Sólido', primaryColor: '#27272a', secondaryColor: '#3f3f46', accentColor: '#18181b', textColor: '#fafafa', bgClass: 'bg-zinc-800', borderClass: 'border-zinc-800' },
  { id: 'neutral-base', name: 'Base Neutra', primaryColor: '#262626', secondaryColor: '#404040', accentColor: '#171717', textColor: '#fafafa', bgClass: 'bg-neutral-800', borderClass: 'border-neutral-800' },
  { id: 'gray-metal', name: 'Metal Cinza', primaryColor: '#1f2937', secondaryColor: '#374151', accentColor: '#111827', textColor: '#f9fafb', bgClass: 'bg-gray-800', borderClass: 'border-gray-800' },
  { id: 'red-fire', name: 'Fogo Vermelho', primaryColor: '#7f1d1d', secondaryColor: '#991b1b', accentColor: '#450a0a', textColor: '#fef2f2', bgClass: 'bg-red-900', borderClass: 'border-red-900' },
  { id: 'orange-sunset', name: 'Pôr do Sol Laranja', primaryColor: '#7c2d12', secondaryColor: '#9a3412', accentColor: '#431407', textColor: '#fff7ed', bgClass: 'bg-orange-900', borderClass: 'border-orange-900' },
  { id: 'amber-gold', name: 'Âmbar Dourado', primaryColor: '#78350f', secondaryColor: '#92400e', accentColor: '#451a03', textColor: '#fffbeb', bgClass: 'bg-amber-900', borderClass: 'border-amber-900' },
  { id: 'yellow-bright', name: 'Amarelo Brilhante', primaryColor: '#713f12', secondaryColor: '#854d0e', accentColor: '#422006', textColor: '#fefce8', bgClass: 'bg-yellow-900', borderClass: 'border-yellow-900' },
  { id: 'lime-fresh', name: 'Lima Fresca', primaryColor: '#365314', secondaryColor: '#3f6212', accentColor: '#1a2e05', textColor: '#f7fee7', bgClass: 'bg-lime-900', borderClass: 'border-lime-900' },
  { id: 'green-forest', name: 'Floresta Verde', primaryColor: '#14532d', secondaryColor: '#166534', accentColor: '#064e3b', textColor: '#f0fdf4', bgClass: 'bg-green-900', borderClass: 'border-green-900' },
  { id: 'emerald-deep', name: 'Esmeralda Profunda', primaryColor: '#064e3b', secondaryColor: '#065f46', accentColor: '#022c22', textColor: '#ecfdf5', bgClass: 'bg-emerald-900', borderClass: 'border-emerald-900' },
  { id: 'teal-ocean', name: 'Oceano Cerceta', primaryColor: '#134e4a', secondaryColor: '#115e59', accentColor: '#042f2e', textColor: '#f0fdfa', bgClass: 'bg-teal-900', borderClass: 'border-teal-900' },
  { id: 'cyan-deep', name: 'Ciano Profundo', primaryColor: '#164e63', secondaryColor: '#155e75', accentColor: '#083344', textColor: '#ecfeff', bgClass: 'bg-cyan-900', borderClass: 'border-cyan-900' },
  { id: 'sky-deep', name: 'Céu Profundo', primaryColor: '#0c4a6e', secondaryColor: '#075985', accentColor: '#082f49', textColor: '#f0f9ff', bgClass: 'bg-sky-900', borderClass: 'border-sky-900' },
  { id: 'blue-deep', name: 'Azul Profundo', primaryColor: '#1e3a8a', secondaryColor: '#1e40af', accentColor: '#172554', textColor: '#eff6ff', bgClass: 'bg-blue-900', borderClass: 'border-blue-900' },
  { id: 'indigo-deep', name: 'Índigo Profundo', primaryColor: '#312e81', secondaryColor: '#3730a3', accentColor: '#1e1b4b', textColor: '#eef2ff', bgClass: 'bg-indigo-900', borderClass: 'border-indigo-900' },
  { id: 'violet-deep', name: 'Violeta Profundo', primaryColor: '#4c1d95', secondaryColor: '#5b21b6', accentColor: '#2e1065', textColor: '#f5f3ff', bgClass: 'bg-violet-900', borderClass: 'border-violet-900' },
  { id: 'purple-deep', name: 'Roxo Profundo', primaryColor: '#581c87', secondaryColor: '#6b21a8', accentColor: '#3b0764', textColor: '#faf5ff', bgClass: 'bg-purple-900', borderClass: 'border-purple-900' },
  { id: 'fuchsia-deep', name: 'Fúcsia Profunda', primaryColor: '#701a75', secondaryColor: '#86198f', accentColor: '#4a044e', textColor: '#fdf4ff', bgClass: 'bg-fuchsia-900', borderClass: 'border-fuchsia-900' },
  { id: 'pink-deep', name: 'Rosa Profundo', primaryColor: '#831843', secondaryColor: '#9d174d', accentColor: '#500724', textColor: '#fdf2f8', bgClass: 'bg-pink-900', borderClass: 'border-pink-900' },
  { id: 'rose-deep', name: 'Rosa Profunda', primaryColor: '#881337', secondaryColor: '#9f1239', accentColor: '#4c0519', textColor: '#fff1f2', bgClass: 'bg-rose-900', borderClass: 'border-rose-900' },
  { id: 'midnight', name: 'Meia Noite', primaryColor: '#020617', secondaryColor: '#0f172a', accentColor: '#000000', textColor: '#f8fafc', bgClass: 'bg-slate-950', borderClass: 'border-slate-900' },
  { id: 'carbon', name: 'Carbono', primaryColor: '#09090b', secondaryColor: '#18181b', accentColor: '#000000', textColor: '#fafafa', bgClass: 'bg-zinc-950', borderClass: 'border-zinc-900' },
];

const BUBBLE_SHAPES = [
  { id: 'rounded', name: 'Arredondado' },
  { id: 'square', name: 'Quadrado' },
  { id: 'circle', name: 'Círculo' },
  { id: 'pill', name: 'Pílula' },
  { id: 'burst', name: 'Explosão' },
  { id: 'badge', name: 'Crachá' },
  { id: 'diamond', name: 'Diamante' },
  { id: 'hexagon', name: 'Hexágono' },
  { id: 'star', name: 'Estrela' },
  { id: 'oval', name: 'Oval' },
  { id: 'chevron', name: 'Seta' },
];

const getBubbleClass = (shape?: string) => {
  switch (shape) {
    case 'square': return 'rounded-none px-3';
    case 'circle': return 'rounded-full aspect-square w-16 h-16';
    case 'pill': return 'rounded-full px-6';
    case 'burst': return '';
    case 'badge': return 'rounded-tr-3xl rounded-bl-3xl rounded-tl-lg rounded-br-lg px-4';
    case 'diamond': return 'rotate-45 w-12 h-12 flex items-center justify-center';
    case 'hexagon': return 'w-14 h-14 flex items-center justify-center';
    case 'star': return 'w-16 h-16 flex items-center justify-center';
    case 'oval': return 'rounded-[100%] px-5 py-2';
    case 'chevron': return 'rounded-l-2xl pr-8 pl-4 py-2';
    case 'rounded':
    default: return 'rounded-2xl px-3';
  }
};

const getBubbleStyle = (shape?: string) => {
  switch (shape) {
    case 'burst':
      return { clipPath: 'polygon(50% 0%, 61% 14%, 75% 14%, 81% 28%, 93% 33%, 93% 47%, 100% 61%, 89% 72%, 89% 86%, 75% 86%, 67% 100%, 50% 89%, 33% 100%, 25% 86%, 11% 86%, 11% 72%, 0% 61%, 7% 47%, 7% 33%, 19% 28%, 25% 14%, 39% 14%)' };
    case 'hexagon':
      return { clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' };
    case 'star':
      return { clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' };
    case 'chevron':
      return { clipPath: 'polygon(0% 0%, 85% 0%, 100% 50%, 85% 100%, 0% 100%)' };
    default:
      return {};
  }
};

export default function EncarteCreator() {
  const { 
    setView, 
    encartes, 
    setEncartes, 
    selectedEncarteModel, 
    setSelectedEncarteModel,
    activeEncarteTab, 
    setActiveEncarteTab,
    encarteThemes, 
    setEncarteThemes,
    encarteLogos, 
    setEncarteLogos,
    encarteLayouts, 
    setEncarteLayouts,
    activeEncarteTheme, 
    setActiveEncarteTheme,
    activeEncarteLogo, 
    setActiveEncarteLogo,
    activeEncarteLayout, 
    setActiveEncarteLayout,
    userRole
  } = useStore();
  
  const [activeEncarteIndex, setActiveEncarteIndex] = useState(0);
  const [currentSide, setCurrentSide] = useState<'frente' | 'verso'>('frente');
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [hRulers, setHRulers] = useState([150, 300, 450, 600]);
  const [vRulers, setVRulers] = useState([150, 300, 450]);
  const [showHRulers, setShowHRulers] = useState([false, false, false, false]);
  const [showVRulers, setShowVRulers] = useState([false, false, false]);
  const [zoom, setZoom] = useState(100);
  const [activeThemeCategory, setActiveThemeCategory] = useState<string | null>(null);
  const [isAddingAsset, setIsAddingAsset] = useState<EncarteTab | null>(null);
  const [assetUrl, setAssetUrl] = useState('');
  const [editingProductIndex, setEditingProductIndex] = useState<number | null>(null);
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);

  const selectedModel = selectedEncarteModel || ENCARTE_MODELS[0];
  const setSelectedModel = setSelectedEncarteModel;

  const currentEncarte = encartes[activeEncarteIndex] || {
    name: 'Modelo',
    frontBgUrl: '',
    backBgUrl: '',
    frontProducts: [],
    backProducts: [],
    productCount: 12,
    extraProducts: [],
    format: 'encarte'
  };

  const [bgAspect, setBgAspect] = useState(210 / 297); // Default A4 Portrait

  useEffect(() => {
    const url = currentSide === 'frente' ? currentEncarte.frontBgUrl : currentEncarte.backBgUrl;
    if (url) {
      const img = new Image();
      img.onload = () => {
        if (img.width > 0 && img.height > 0) {
          setBgAspect(img.width / img.height);
        }
      };
      img.src = getProxyUrl(url);
    }
  }, [currentEncarte.frontBgUrl, currentEncarte.backBgUrl, currentSide]);

  const getDimensions = () => {
    switch (currentEncarte.format) {
      case 'post':
        return { width: '210mm', height: '210mm', mmWidth: 210, mmHeight: 210, label: 'Post Quadrado' };
      case 'story':
        return { width: '210mm', height: '373.33mm', mmWidth: 210, mmHeight: 373.33, label: 'Story' };
      case 'encarte':
      default:
        // Use the background image aspect ratio as base
        const height = 210 / bgAspect;
        return { 
          width: '210mm', 
          height: `${height}mm`, 
          mmWidth: 210, 
          mmHeight: height, 
          label: 'Encarte' 
        };
    }
  };
  const dims = getDimensions();

  // Pre-load background images
  useEffect(() => {
    if (currentEncarte.frontBgUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = getProxyUrl(currentEncarte.frontBgUrl);
    }
    if (currentEncarte.backBgUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = getProxyUrl(currentEncarte.backBgUrl);
    }
  }, [currentEncarte.frontBgUrl, currentEncarte.backBgUrl]);

  const currentProducts = (currentSide === 'frente' ? currentEncarte.frontProducts : currentEncarte.backProducts)?.slice(0, currentEncarte.productCount) || [];

  const getAdaptiveStyles = (count: number) => {
    switch (count) {
      case 4: return { title: 'text-[18px]', subtitle: 'text-[12px]', price: 'text-5xl', cents: 'text-2xl', box: 'px-6 py-4', gap: 'gap-6', img: 'h-32' };
      case 6: return { title: 'text-[16px]', subtitle: 'text-[10px]', price: 'text-4xl', cents: 'text-xl', box: 'px-5 py-3', gap: 'gap-4', img: 'h-28' };
      case 8: return { title: 'text-[14px]', subtitle: 'text-[9px]', price: 'text-3xl', cents: 'text-lg', box: 'px-4 py-2', gap: 'gap-3', img: 'h-24' };
      case 10: return { title: 'text-[12px]', subtitle: 'text-[8px]', price: 'text-2xl', cents: 'text-base', box: 'px-3 py-1.5', gap: 'gap-2', img: 'h-20' };
      case 12: return { title: 'text-[10px]', subtitle: 'text-[7px]', price: 'text-xl', cents: 'text-sm', box: 'px-3 py-1', gap: 'gap-2', img: 'h-16' };
      default: return { title: 'text-[10px]', subtitle: 'text-[7px]', price: 'text-xl', cents: 'text-sm', box: 'px-3 py-1', gap: 'gap-2', img: 'h-16' };
    }
  };

  const formatPrice = (price: string) => {
    const cleanPrice = (price || '').replace('R$', '').replace(',', '.').trim();
    const parts = cleanPrice.split('.');
    return {
      integer: parts[0] || '0',
      cents: parts[1] ? `,${parts[1].padEnd(2, '0')}` : ',00'
    };
  };

  const getGridClass = (count: number) => {
    switch (count) {
      case 4: return "grid-cols-2 grid-rows-2";
      case 6: return "grid-cols-2 grid-rows-3";
      case 8: return "grid-cols-2 grid-rows-4";
      case 10: return "grid-cols-2 grid-rows-5";
      case 12: return "grid-cols-3 grid-rows-4";
      default: return "grid-cols-3 grid-rows-4";
    }
  };

  const adaptive = getAdaptiveStyles(currentEncarte.productCount);

  const updateActiveEncarte = (updates: Partial<EncarteSlot>) => {
    const newEncartes = [...encartes];
    newEncartes[activeEncarteIndex] = { ...newEncartes[activeEncarteIndex], ...updates };
    setEncartes(newEncartes);
    // Trigger save to database
    useStore.getState().saveUsersAndFlagsDebounced();
  };

  const handleAddProduct = (product: Product) => {
    let targetSlot = activeSlot;
    
    // Handle extra products (slots 100+)
    if (targetSlot !== null && targetSlot >= 100) {
      const extraIdx = targetSlot - 100;
      const newExtras = [...(currentEncarte.extraProducts || [null, null])];
      newExtras[extraIdx] = { 
        ...product, 
        id: Math.random().toString(36).substr(2, 9),
        subtitle: product.description || '',
        displayType: 'price',
        offsetX: 0,
        offsetY: 0,
        width: 400,
        height: 150,
        bgColor: '#ffffff',
        showBg: true
      };
      updateActiveEncarte({ extraProducts: newExtras });
      setIsSelectorOpen(false);
      setActiveSlot(null);
      return;
    }

    if (targetSlot === null) {
      // Find first empty slot in the current side
      const fullProducts = currentSide === 'frente' ? currentEncarte.frontProducts : currentEncarte.backProducts;
      const firstEmpty = fullProducts.findIndex((p, i) => p === null && i < currentEncarte.productCount);
      
      if (firstEmpty !== -1) {
        targetSlot = firstEmpty;
      } else {
        toast.error('Não há mais espaço disponível neste lado do encarte.');
        return;
      }
    }
    
    const fullProducts = currentSide === 'frente' ? [...currentEncarte.frontProducts] : [...currentEncarte.backProducts];
    fullProducts[targetSlot] = { 
      ...product, 
      id: Math.random().toString(36).substr(2, 9),
      subtitle: product.description || '',
      offsetX: 0,
      offsetY: 0
    };

    if (currentSide === 'frente') {
      updateActiveEncarte({ frontProducts: fullProducts });
    } else {
      updateActiveEncarte({ backProducts: fullProducts });
    }

    setIsSelectorOpen(false);
    setActiveSlot(null);
  };

  const handleRemoveProduct = (index: number) => {
    const fullProducts = currentSide === 'frente' ? [...currentEncarte.frontProducts] : [...currentEncarte.backProducts];
    fullProducts[index] = null;
    if (currentSide === 'frente') {
      updateActiveEncarte({ frontProducts: fullProducts });
    } else {
      updateActiveEncarte({ backProducts: fullProducts });
    }
  };

  const handleUpdateProduct = (index: number, field: keyof SelectedProduct, value: any) => {
    const fullProducts = currentSide === 'frente' ? [...currentEncarte.frontProducts] : [...currentEncarte.backProducts];
    const product = fullProducts[index];
    if (product) {
      fullProducts[index] = { ...product, [field]: value };
      if (currentSide === 'frente') {
        updateActiveEncarte({ frontProducts: fullProducts });
      } else {
        updateActiveEncarte({ backProducts: fullProducts });
      }
    }
  };

  const handleApplyColorToAll = (color: string, field: 'priceColor' | 'textColor') => {
    const newFrontProducts = currentEncarte.frontProducts.map(p => p ? { ...p, [field]: color } : null);
    const newBackProducts = currentEncarte.backProducts.map(p => p ? { ...p, [field]: color } : null);
    updateActiveEncarte({ 
      frontProducts: newFrontProducts,
      backProducts: newBackProducts
    });
    toast.success(`Cor aplicada a todos os produtos!`);
  };

  const handleMove = (index: number, direction: 'up' | 'down' | 'left' | 'right', target: 'card' | 'text' = 'card') => {
    const product = currentProducts[index];
    if (!product) return;

    const step = 5;
    const fieldX = target === 'card' ? 'offsetX' : 'textOffsetX';
    const fieldY = target === 'card' ? 'offsetY' : 'textOffsetY';
    
    let newX = (product[fieldX] as number) || 0;
    let newY = (product[fieldY] as number) || 0;

    if (direction === 'up') newY -= step;
    if (direction === 'down') newY += step;
    if (direction === 'left') newX -= step;
    if (direction === 'right') newX += step;

    handleUpdateProduct(index, fieldX, newX);
    handleUpdateProduct(index, fieldY, newY);
  };

  const handleExportPNG = async () => {
    setIsExporting(true);
    const toastId = toast.loading('Gerando imagens...');
    try {
      const frente = document.getElementById('print-frente');
      const verso = document.getElementById('print-verso');
      const options = { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 794, // 210mm at 96dpi
        windowHeight: 1123 // 297mm at 96dpi
      };

      if (frente) {
        const canvas = await html2canvas(frente, options);
        const link = document.createElement('a');
        link.download = `encarte-${(currentEncarte.name || 'modelo').replace(/\s+/g, '-')}-frente-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }

      if (verso) {
        const canvas = await html2canvas(verso, options);
        const link = document.createElement('a');
        link.download = `encarte-${(currentEncarte.name || 'modelo').replace(/\s+/g, '-')}-verso-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
      toast.success('Imagens exportadas com sucesso!', { id: toastId });
    } catch (error) {
      console.error('Erro ao exportar PNG:', error);
      toast.error('Erro ao exportar imagens. Verifique se as imagens de fundo são acessíveis.', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    const toastId = toast.loading('Gerando PDF...');
    try {
      const frente = document.getElementById('print-frente');
      const verso = document.getElementById('print-verso');
      
      if (!frente || !verso) {
        toast.error('Erro: Elementos de impressão não encontrados', { id: toastId });
        return;
      }

      const pdf = new jsPDF('p', 'mm', 'a4');
      const options = { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 794,
        windowHeight: 1123
      };

      const canvasFrente = await html2canvas(frente, options);
      pdf.addImage(canvasFrente.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);

      pdf.addPage();
      const canvasVerso = await html2canvas(verso, options);
      pdf.addImage(canvasVerso.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);

      pdf.save(`encarte-${(currentEncarte.name || 'modelo').replace(/\s+/g, '-')}-${Date.now()}.pdf`);
      toast.success('PDF gerado com sucesso!', { id: toastId });
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      toast.error('Erro ao gerar PDF. Verifique se as imagens de fundo são acessíveis.', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const openSelector = (index: number) => {
    setActiveSlot(index);
    setIsSelectorOpen(true);
  };

  const openEditor = (index: number) => {
    setEditingProductIndex(index);
    setIsEditingModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between px-6 sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setView('editor')}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-lg", selectedModel.bgClass)}>
              <ShoppingBag className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-black tracking-tighter uppercase">Encarte Online</h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
            <button
              onClick={() => setCurrentSide('frente')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                currentSide === 'frente' 
                  ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-white" 
                  : "text-zinc-500"
              )}
            >
              Frente
            </button>
            <button
              onClick={() => setCurrentSide('verso')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                currentSide === 'verso' 
                  ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-white" 
                  : "text-zinc-500"
              )}
            >
              Verso
            </button>
          </div>

          <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
            <button 
              onClick={() => setZoom(Math.max(25, zoom - 25))}
              className="p-1.5 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-zinc-500 transition-all"
            >
              <MoveDown className="w-3 h-3 rotate-90" />
            </button>
            <span className="text-[10px] font-black w-10 text-center">{zoom}%</span>
            <button 
              onClick={() => setZoom(Math.min(200, zoom + 25))}
              className="p-1.5 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-zinc-500 transition-all"
            >
              <MoveUp className="w-3 h-3 rotate-90" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={handleExportPNG}
              disabled={isExporting}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl transition-all text-[10px] font-black uppercase tracking-tighter shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50"
              title="Exportar PNG"
            >
              <ImageIcon2 className="w-4 h-4" />
              PNG
            </button>
            <button 
              onClick={handleExportPDF}
              disabled={isExporting}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-xl transition-all text-[10px] font-black uppercase tracking-tighter shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50"
              title="Exportar PDF"
            >
              <FileDown className="w-4 h-4" />
              PDF
            </button>
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl transition-all text-xs font-black uppercase tracking-tighter shadow-lg hover:scale-105 active:scale-95"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-20 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col items-center py-6 gap-6 no-print">
          <button 
            onClick={() => setActiveEncarteTab('themes')}
            className={cn(
              "p-3 rounded-2xl transition-all flex flex-col items-center gap-1",
              activeEncarteTab === 'themes' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            )}
          >
            <LayoutIcon className="w-6 h-6" />
            <span className="text-[8px] font-black uppercase tracking-widest">Temas</span>
          </button>
          <button 
            onClick={() => setActiveEncarteTab('layouts')}
            className={cn(
              "p-3 rounded-2xl transition-all flex flex-col items-center gap-1",
              activeEncarteTab === 'layouts' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            )}
          >
            <LayoutGrid className="w-6 h-6" />
            <span className="text-[8px] font-black uppercase tracking-widest">Layouts</span>
          </button>
          <button 
            onClick={() => setActiveEncarteTab('products')}
            className={cn(
              "p-3 rounded-2xl transition-all flex flex-col items-center gap-1",
              activeEncarteTab === 'products' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            )}
          >
            <Package className="w-6 h-6" />
            <span className="text-[8px] font-black uppercase tracking-widest">Produtos</span>
          </button>
          <button 
            onClick={() => setActiveEncarteTab('info')}
            className={cn(
              "p-3 rounded-2xl transition-all flex flex-col items-center gap-1",
              activeEncarteTab === 'info' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            )}
          >
            <Info className="w-6 h-6" />
            <span className="text-[8px] font-black uppercase tracking-widest">Info</span>
          </button>
          <button 
            onClick={() => setActiveEncarteTab('labels')}
            className={cn(
              "p-3 rounded-2xl transition-all flex flex-col items-center gap-1",
              activeEncarteTab === 'labels' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            )}
          >
            <Tag className="w-6 h-6" />
            <span className="text-[8px] font-black uppercase tracking-widest">Etiquetas</span>
          </button>
          <button 
            onClick={() => setActiveEncarteTab('colors')}
            className={cn(
              "p-3 rounded-2xl transition-all flex flex-col items-center gap-1",
              activeEncarteTab === 'colors' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            )}
          >
            <Palette className="w-6 h-6" />
            <span className="text-[8px] font-black uppercase tracking-widest">Cores</span>
          </button>
          <button 
            onClick={() => setActiveEncarteTab('fonts')}
            className={cn(
              "p-3 rounded-2xl transition-all flex flex-col items-center gap-1",
              activeEncarteTab === 'fonts' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            )}
          >
            <TypeIcon className="w-6 h-6" />
            <span className="text-[8px] font-black uppercase tracking-widest">Fontes</span>
          </button>
          <button 
            onClick={() => setActiveEncarteTab('logo')}
            className={cn(
              "p-3 rounded-2xl transition-all flex flex-col items-center gap-1",
              activeEncarteTab === 'logo' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            )}
          >
            <ImageIcon className="w-6 h-6" />
            <span className="text-[8px] font-black uppercase tracking-widest">Logo</span>
          </button>
        </div>

        {/* Panel Content */}
        <div className="w-96 flex flex-col bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto no-print">
          {activeEncarteTab === 'themes' && (
            <div className="p-6 space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest">Temas</h3>
                <div className="flex items-center gap-2">
                  {activeThemeCategory && (
                    <button 
                      onClick={() => setActiveThemeCategory(null)}
                      className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      Voltar
                    </button>
                  )}
                  <button 
                    onClick={() => setIsAddingAsset('themes')}
                    className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-500 hover:text-emerald-600 transition-colors"
                    title="Adicionar Tema via URL"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {!activeThemeCategory ? (
                <div className="space-y-8">
                  {encarteThemes.map((category) => (
                    <div key={category.id} className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-widest opacity-40">{category.name}</h4>
                        <button 
                          onClick={() => setActiveThemeCategory(category.id)}
                          className="text-[10px] font-black uppercase tracking-widest text-emerald-600"
                        >
                          Ver Tudo
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {category.themes.slice(0, 4).map((theme) => (
                          <button
                            key={theme.id}
                            onClick={() => {
                              setActiveEncarteTheme(theme);
                              updateActiveEncarte({ frontBgUrl: theme.imageUrl });
                            }}
                            className={cn(
                              "relative aspect-[3/4] rounded-xl overflow-hidden border-2 transition-all group",
                              activeEncarteTheme?.id === theme.id ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
                            )}
                          >
                            <img src={getProxyUrl(theme.imageUrl, { thumbnail: true })} className="w-full h-full object-cover" referrerPolicy="no-referrer" crossOrigin="anonymous" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="text-[10px] font-black uppercase text-white tracking-widest">Aplicar</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {encarteThemes.find(c => c.id === activeThemeCategory)?.themes.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => {
                        setActiveEncarteTheme(theme);
                        updateActiveEncarte({ frontBgUrl: theme.imageUrl });
                      }}
                      className={cn(
                        "relative aspect-[3/4] rounded-xl overflow-hidden border-2 transition-all group",
                        activeEncarteTheme?.id === theme.id ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
                      )}
                    >
                      <img src={getProxyUrl(theme.imageUrl, { thumbnail: true })} className="w-full h-full object-cover" referrerPolicy="no-referrer" crossOrigin="anonymous" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-[10px] font-black uppercase text-white tracking-widest">Aplicar</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeEncarteTab === 'layouts' && (
            <div className="p-6 space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest">Layouts</h3>
                <button 
                  onClick={() => setIsAddingAsset('layouts')}
                  className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-500 hover:text-emerald-600 transition-colors"
                  title="Adicionar Layout via URL"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {encarteLayouts.map((layout, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setActiveEncarteLayout(layout);
                      updateActiveEncarte({ frontBgUrl: layout });
                    }}
                    className={cn(
                      "aspect-[3/4] rounded-xl border-2 transition-all overflow-hidden",
                      activeEncarteLayout === layout ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700"
                    )}
                  >
                    <img src={getProxyUrl(layout, { thumbnail: true })} className="w-full h-full object-cover" referrerPolicy="no-referrer" crossOrigin="anonymous" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeEncarteTab === 'products' && (
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest">Produtos</h3>
                <button 
                  onClick={() => updateActiveEncarte({ frontProducts: Array(12).fill(null) })}
                  className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-600 transition-colors"
                >
                  Limpar Tudo
                </button>
              </div>

              <div className="space-y-4">
                <button 
                  onClick={() => {
                    setActiveSlot(null);
                    setIsSelectorOpen(true);
                  }}
                  className="w-full py-4 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-400 hover:text-emerald-500 hover:border-emerald-500/50 transition-all flex flex-col items-center gap-1"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Adicionar Produto</span>
                </button>

                <div className="space-y-3">
                  {currentProducts.map((product, index) => (
                    <div 
                      key={index} 
                      onClick={() => product ? openEditor(index) : openSelector(index)}
                      className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700 flex items-center gap-3 group hover:border-emerald-500/50 transition-all cursor-pointer"
                    >
                      <div className="w-10 h-10 bg-white dark:bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-100 dark:border-zinc-700 flex-shrink-0">
                        {product?.image ? (
                          <img src={getProxyUrl(product.image)} className="w-full h-full object-contain p-1" referrerPolicy="no-referrer" crossOrigin="anonymous" />
                        ) : (
                          <Package className="w-5 h-5 text-zinc-300" />
                        )}
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="text-[10px] font-black uppercase truncate text-black dark:text-white">{product?.name || `Posição ${index + 1}`}</p>
                        {product && <p className="text-[9px] font-bold text-emerald-600">{product.price}</p>}
                      </div>
                      {product && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveProduct(index);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeEncarteTab === 'info' && (
            <div className="p-6 space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest">Informações</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Data do Encarte</label>
                  <input 
                    type="text"
                    placeholder="Ex: Ofertas válidas até 25/03"
                    value={currentEncarte.date || ''}
                    onChange={(e) => updateActiveEncarte({ date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                  />
                </div>
                {/* Add more info fields as needed */}
              </div>
            </div>
          )}

          {activeEncarteTab === 'labels' && (
            <div className="p-6 space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest">Etiquetas</h3>
              <div className="grid grid-cols-2 gap-3">
                {BUBBLE_SHAPES.map((shape) => (
                  <button
                    key={shape.id}
                    onClick={() => updateActiveEncarte({ bubbleShape: shape.id as any })}
                    className={cn(
                      "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
                      currentEncarte.bubbleShape === shape.id ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" : "border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700"
                    )}
                  >
                    <div className={cn("w-10 h-10 bg-red-600 shadow-sm", getBubbleClass(shape.id))} style={getBubbleStyle(shape.id)} />
                    <span className="text-[9px] font-black uppercase tracking-widest">{shape.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeEncarteTab === 'colors' && (
            <div className="p-6 space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest">Cores</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Cor do Fundo</span>
                  <input type="color" className="w-8 h-8 rounded-lg cursor-pointer border-none bg-transparent" />
                </div>
                <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Cor dos Produtos</span>
                  <input type="color" className="w-8 h-8 rounded-lg cursor-pointer border-none bg-transparent" />
                </div>
                <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Cor dos Preços</span>
                  <input type="color" className="w-8 h-8 rounded-lg cursor-pointer border-none bg-transparent" />
                </div>
              </div>
            </div>
          )}

          {activeEncarteTab === 'fonts' && (
            <div className="p-6 space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest">Fontes</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Fonte dos Produtos</label>
                  <select className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl outline-none font-bold">
                    <option>Inter</option>
                    <option>Roboto</option>
                    <option>Oswald</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Fonte dos Preços</label>
                  <select className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl outline-none font-bold">
                    <option>Inter</option>
                    <option>Roboto</option>
                    <option>Oswald</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeEncarteTab === 'logo' && (
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest">Logo</h3>
                <button 
                  onClick={() => setIsAddingAsset('logo')}
                  className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-500 hover:text-emerald-600 transition-colors"
                  title="Adicionar Logo via URL"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {encarteLogos.map((logo, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveEncarteLogo(logo)}
                    className={cn(
                      "aspect-square rounded-2xl border-2 transition-all p-4 flex items-center justify-center bg-white dark:bg-zinc-800",
                      activeEncarteLogo === logo ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700"
                    )}
                  >
                    <img src={getProxyUrl(logo)} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" crossOrigin="anonymous" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Preview Area */}
        <div className={cn(
          "p-8 overflow-hidden flex flex-col gap-6 transition-all duration-300",
          (activeEncarteTab === 'layouts') ? "flex-grow" : "w-0 p-0 opacity-0 pointer-events-none"
        )}>
          {activeEncarteTab === 'products' ? (
            <>
              <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  {currentProducts.map((product, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-[10px] font-black text-black dark:text-white opacity-40 uppercase tracking-widest">Posição {index + 1}</span>
                        {product && (
                          <button 
                            onClick={() => handleRemoveProduct(index)}
                            className="text-red-500 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      
                      {product ? (
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-100 dark:border-zinc-700 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white dark:bg-zinc-900 rounded-xl flex items-center justify-center border border-zinc-100 dark:border-zinc-700 flex-shrink-0">
                              {product.image ? (
                                <img 
                                  src={getProxyUrl(product.image)} 
                                  className="w-full h-full object-contain p-1" 
                                  referrerPolicy="no-referrer" 
                                  crossOrigin="anonymous"
                                />
                              ) : (
                                <Package className="w-6 h-6 text-black dark:text-white opacity-40" />
                              )}
                            </div>
                            <div className="flex-grow min-w-0">
                              <input 
                                type="text"
                                value={product.name}
                                onChange={(e) => handleUpdateProduct(index, 'name', e.target.value)}
                                className="w-full bg-transparent text-xs font-black uppercase tracking-tighter outline-none border-b border-transparent focus:border-emerald-500 text-black dark:text-white"
                              />
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-black text-black dark:text-white opacity-40 uppercase">Preço:</span>
                                <input 
                                  type="text"
                                  value={product.price}
                                  onChange={(e) => handleUpdateProduct(index, 'price', e.target.value)}
                                  className="flex-grow bg-white dark:bg-zinc-900 px-2 py-1 rounded-lg text-xs font-black text-emerald-600 outline-none border border-zinc-200 dark:border-zinc-700 focus:border-emerald-500"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button 
                          onClick={() => openSelector(index)}
                          className="w-full py-3 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-black dark:text-white opacity-20 hover:opacity-100 hover:border-emerald-500/50 transition-all flex items-center justify-center gap-2"
                        >
                          <Plus className="w-3 h-3" />
                          <span className="text-[8px] font-black uppercase tracking-widest">Vazio</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : activeEncarteTab === 'layouts' ? (
            <div className="space-y-6">
              {/* Model Selection */}
              <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <LayoutIcon className="w-4 h-4 text-zinc-400" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Escolher Estilo do Encarte</h3>
                </div>
                <div className="max-h-48 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                  <div className="grid grid-cols-2 gap-2">
                    {ENCARTE_MODELS.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => setSelectedModel(model)}
                        className={cn(
                          "p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 text-center",
                          selectedModel.id === model.id
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                            : "border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700"
                        )}
                      >
                        <div className={cn("w-6 h-6 rounded shadow-sm", model.bgClass)} />
                        <span className="text-[9px] font-black uppercase leading-tight">{model.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Model Settings */}
              <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Settings2 className="w-4 h-4 text-zinc-400" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Ajustes do Modelo {activeEncarteIndex + 1}</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Nome do Modelo</label>
                    <input 
                      type="text"
                      value={currentEncarte.name}
                      onChange={(e) => updateActiveEncarte({ name: e.target.value })}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold text-zinc-900 dark:text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Data do Encarte</label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="Ex: Ofertas válidas até 25/03"
                        value={currentEncarte.date || ''}
                        onChange={(e) => updateActiveEncarte({ date: e.target.value })}
                        className="flex-grow px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold text-zinc-900 dark:text-white"
                      />
                      <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg">
                        <button onClick={() => updateActiveEncarte({ dateOffsetX: (currentEncarte.dateOffsetX || 0) - 5 })} className="p-1 hover:bg-white dark:hover:bg-zinc-800 rounded shadow-sm transition-all text-black dark:text-white"><MoveLeft className="w-3 h-3" /></button>
                        <div className="flex flex-col gap-1">
                          <button onClick={() => updateActiveEncarte({ dateOffsetY: (currentEncarte.dateOffsetY || 0) - 5 })} className="p-1 hover:bg-white dark:hover:bg-zinc-800 rounded shadow-sm transition-all text-black dark:text-white"><MoveUp className="w-3 h-3" /></button>
                          <button onClick={() => updateActiveEncarte({ dateOffsetY: (currentEncarte.dateOffsetY || 0) + 5 })} className="p-1 hover:bg-white dark:hover:bg-zinc-800 rounded shadow-sm transition-all text-black dark:text-white"><MoveDown className="w-3 h-3" /></button>
                        </div>
                        <button onClick={() => updateActiveEncarte({ dateOffsetX: (currentEncarte.dateOffsetX || 0) + 5 })} className="p-1 hover:bg-white dark:hover:bg-zinc-800 rounded shadow-sm transition-all text-black dark:text-white"><MoveRight className="w-3 h-3" /></button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Formato da Bolha de Preço</label>
                    <div className="grid grid-cols-3 gap-2">
                      {BUBBLE_SHAPES.map((shape) => (
                        <button
                          key={shape.id}
                          onClick={() => updateActiveEncarte({ bubbleShape: shape.id as any })}
                          className={cn(
                            "p-2 rounded-xl border-2 transition-all flex flex-col items-center gap-1",
                            currentEncarte.bubbleShape === shape.id || (!currentEncarte.bubbleShape && shape.id === 'rounded')
                              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                              : "border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700"
                          )}
                        >
                          <div 
                            className={cn("w-8 h-8 bg-red-600 shadow-sm", getBubbleClass(shape.id))} 
                            style={getBubbleStyle(shape.id)}
                          />
                          <span className="text-[8px] font-black uppercase text-zinc-500">{shape.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="space-y-6">
                      {/* Horizontal Rulers */}
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Réguas Horizontais (4)</label>
                        <div className="grid grid-cols-4 gap-2">
                          {showHRulers.map((show, idx) => (
                            <button 
                              key={`h-btn-${idx}`}
                              onClick={() => {
                                const newShow = [...showHRulers];
                                newShow[idx] = !newShow[idx];
                                setShowHRulers(newShow);
                              }}
                              className={cn(
                                "py-2 rounded-xl text-[10px] font-black transition-all border-2",
                                show 
                                  ? "bg-magenta-500 border-magenta-500 text-white shadow-lg shadow-magenta-500/20" 
                                  : "bg-zinc-100 dark:bg-zinc-800 border-transparent text-zinc-400"
                              )}
                              style={{ backgroundColor: show ? '#ff00ff' : undefined, borderColor: show ? '#ff00ff' : undefined }}
                            >
                              H{idx + 1}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Vertical Rulers */}
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Réguas Verticais (3)</label>
                        <div className="grid grid-cols-3 gap-2">
                          {showVRulers.map((show, idx) => (
                            <button 
                              key={`v-btn-${idx}`}
                              onClick={() => {
                                const newShow = [...showVRulers];
                                newShow[idx] = !newShow[idx];
                                setShowVRulers(newShow);
                              }}
                              className={cn(
                                "py-2 rounded-xl text-[10px] font-black transition-all border-2",
                                show 
                                  ? "bg-cyan-500 border-cyan-500 text-white shadow-lg shadow-cyan-500/20" 
                                  : "bg-zinc-100 dark:bg-zinc-800 border-transparent text-zinc-400"
                              )}
                              style={{ backgroundColor: show ? '#00ffff' : undefined, borderColor: show ? '#00ffff' : undefined }}
                            >
                              V{idx + 1}
                            </button>
                          ))}
                        </div>
                      </div>

                      <p className="text-[9px] text-zinc-400 font-medium leading-tight">
                        Dica: Arraste as linhas coloridas no encarte para ajustar manualmente.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Background Images */}
              <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <ImageIcon className="w-4 h-4 text-zinc-400" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Imagens de Fundo</h3>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Fundo Frente ({dims.label})</label>
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="URL da imagem..."
                        value={currentEncarte.frontBgUrl}
                        onChange={(e) => updateActiveEncarte({ frontBgUrl: e.target.value })}
                        className={cn(
                          "w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold text-zinc-900 dark:text-white",
                          currentEncarte.frontBgUrl && !isValidImageUrl(currentEncarte.frontBgUrl) && "ring-2 ring-red-500"
                        )}
                      />
                      {currentEncarte.frontBgUrl && !isValidImageUrl(currentEncarte.frontBgUrl) && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 flex items-center gap-1 pointer-events-none">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-[10px] font-bold">URL Inválida</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Fundo Verso ({dims.label})</label>
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="URL da imagem..."
                        value={currentEncarte.backBgUrl}
                        onChange={(e) => updateActiveEncarte({ backBgUrl: e.target.value })}
                        className={cn(
                          "w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold text-zinc-900 dark:text-white",
                          currentEncarte.backBgUrl && !isValidImageUrl(currentEncarte.backBgUrl) && "ring-2 ring-red-500"
                        )}
                      />
                      {currentEncarte.backBgUrl && !isValidImageUrl(currentEncarte.backBgUrl) && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 flex items-center gap-1 pointer-events-none">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-[10px] font-bold">URL Inválida</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Extra Products Section */}
              <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Plus className="w-4 h-4 text-zinc-400" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Produtos Extras (Destaque)</h3>
                </div>
                <div className="space-y-6">
                  {[0, 1].map((idx) => {
                    const extra = currentEncarte.extraProducts?.[idx];
                    return (
                      <div key={idx} className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-100 dark:border-zinc-700 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Extra {idx + 1}</span>
                          {extra && (
                            <button 
                              onClick={() => {
                                const newExtras = [...(currentEncarte.extraProducts || [null, null])];
                                newExtras[idx] = null;
                                updateActiveEncarte({ extraProducts: newExtras });
                              }}
                              className="text-red-500 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        
                        {!extra ? (
                          <button 
                            onClick={() => {
                              setActiveSlot(100 + idx);
                              setIsSelectorOpen(true);
                            }}
                            className="w-full py-4 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-400 hover:text-emerald-500 hover:border-emerald-500/50 transition-all flex flex-col items-center gap-1"
                          >
                            <Plus className="w-4 h-4" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Adicionar Extra</span>
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-white dark:bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-100 dark:border-zinc-700 flex-shrink-0">
                                {extra.image ? (
                                  <img src={getProxyUrl(extra.image)} className="w-full h-full object-contain p-1" referrerPolicy="no-referrer" crossOrigin="anonymous" />
                                ) : (
                                  <Package className="w-5 h-5 text-zinc-400" />
                                )}
                              </div>
                              <div className="flex-grow min-w-0">
                                <p className="text-[10px] font-black uppercase truncate">{extra.name}</p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <button 
                                onClick={() => {
                                  const newExtras = [...(currentEncarte.extraProducts || [null, null])];
                                  newExtras[idx] = { ...extra, displayType: 'price' };
                                  updateActiveEncarte({ extraProducts: newExtras });
                                }}
                                className={cn(
                                  "py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                                  extra.displayType === 'price' ? "bg-emerald-600 text-white" : "bg-zinc-100 dark:bg-zinc-700 text-zinc-500"
                                )}
                              >
                                Preço
                              </button>
                              <button 
                                onClick={() => {
                                  const newExtras = [...(currentEncarte.extraProducts || [null, null])];
                                  newExtras[idx] = { ...extra, displayType: 'discount' };
                                  updateActiveEncarte({ extraProducts: newExtras });
                                }}
                                className={cn(
                                  "py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                                  extra.displayType === 'discount' ? "bg-emerald-600 text-white" : "bg-zinc-100 dark:bg-zinc-700 text-zinc-500"
                                )}
                              >
                                Desconto %
                              </button>
                            </div>

                            {extra.displayType === 'discount' && (
                              <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-zinc-500">Valor do Desconto (%)</label>
                                <input 
                                  type="text"
                                  placeholder="Ex: 15% ou Até 30%"
                                  value={extra.discountValue || ''}
                                  onChange={(e) => {
                                    const newExtras = [...(currentEncarte.extraProducts || [null, null])];
                                    newExtras[idx] = { ...extra, discountValue: e.target.value };
                                    updateActiveEncarte({ extraProducts: newExtras });
                                  }}
                                  className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              </div>
                            )}

                            <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-700">
                              <div className="flex items-center justify-between">
                                <label className="text-[9px] font-black uppercase text-zinc-500">Mostrar Fundo</label>
                                <input 
                                  type="checkbox"
                                  checked={extra.showBg !== false}
                                  onChange={(e) => {
                                    const newExtras = [...(currentEncarte.extraProducts || [null, null])];
                                    newExtras[idx] = { ...extra, showBg: e.target.checked };
                                    updateActiveEncarte({ extraProducts: newExtras });
                                  }}
                                  className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                                />
                              </div>

                              <div className="flex items-center justify-between">
                                <label className="text-[9px] font-black uppercase text-zinc-500">Cor do Fundo</label>
                                <input 
                                  type="color"
                                  value={extra.bgColor || '#ffffff'}
                                  onChange={(e) => {
                                    const newExtras = [...(currentEncarte.extraProducts || [null, null])];
                                    newExtras[idx] = { ...extra, bgColor: e.target.value };
                                    updateActiveEncarte({ extraProducts: newExtras });
                                  }}
                                  className="w-8 h-8 rounded-lg cursor-pointer border-none bg-transparent"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black uppercase text-zinc-500">Largura</label>
                                  <input 
                                    type="number"
                                    value={extra.width || 350}
                                    onChange={(e) => {
                                      const newExtras = [...(currentEncarte.extraProducts || [null, null])];
                                      newExtras[idx] = { ...extra, width: parseInt(e.target.value) };
                                      updateActiveEncarte({ extraProducts: newExtras });
                                    }}
                                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold outline-none"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black uppercase text-zinc-500">Altura</label>
                                  <input 
                                    type="number"
                                    value={extra.height || 120}
                                    onChange={(e) => {
                                      const newExtras = [...(currentEncarte.extraProducts || [null, null])];
                                      newExtras[idx] = { ...extra, height: parseInt(e.target.value) };
                                      updateActiveEncarte({ extraProducts: newExtras });
                                    }}
                                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold outline-none"
                                  />
                                </div>
                              </div>

                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-zinc-500 uppercase">Posicionamento:</span>
                                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg justify-center">
                                  <button 
                                    onClick={() => {
                                      const newExtras = [...(currentEncarte.extraProducts || [null, null])];
                                      newExtras[idx] = { ...extra, offsetX: (extra.offsetX || 0) - 5 };
                                      updateActiveEncarte({ extraProducts: newExtras });
                                    }} 
                                    className="p-1 hover:bg-white dark:hover:bg-zinc-800 rounded shadow-sm transition-all text-black dark:text-white"
                                  >
                                    <MoveLeft className="w-3 h-3" />
                                  </button>
                                  <div className="flex flex-col gap-1">
                                    <button 
                                      onClick={() => {
                                        const newExtras = [...(currentEncarte.extraProducts || [null, null])];
                                        newExtras[idx] = { ...extra, offsetY: (extra.offsetY || 0) - 5 };
                                        updateActiveEncarte({ extraProducts: newExtras });
                                      }} 
                                      className="p-1 hover:bg-white dark:hover:bg-zinc-800 rounded shadow-sm transition-all text-black dark:text-white"
                                    >
                                      <MoveUp className="w-3 h-3" />
                                    </button>
                                    <button 
                                      onClick={() => {
                                        const newExtras = [...(currentEncarte.extraProducts || [null, null])];
                                        newExtras[idx] = { ...extra, offsetY: (extra.offsetY || 0) + 5 };
                                        updateActiveEncarte({ extraProducts: newExtras });
                                      }} 
                                      className="p-1 hover:bg-white dark:hover:bg-zinc-800 rounded shadow-sm transition-all text-black dark:text-white"
                                    >
                                      <MoveDown className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <button 
                                    onClick={() => {
                                      const newExtras = [...(currentEncarte.extraProducts || [null, null])];
                                      newExtras[idx] = { ...extra, offsetX: (extra.offsetX || 0) + 5 };
                                      updateActiveEncarte({ extraProducts: newExtras });
                                    }} 
                                    className="p-1 hover:bg-white dark:hover:bg-zinc-800 rounded shadow-sm transition-all text-black dark:text-white"
                                  >
                                    <MoveRight className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Preview Area */}
        <div className="flex-grow bg-transparent rounded-[2.5rem] p-12 overflow-auto flex flex-col items-center no-print">
          {/* Top Bar for Format and Quantity */}
          <div className="w-full max-w-[210mm] flex items-center justify-between mb-8 no-print">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <button 
                  onClick={() => updateActiveEncarte({ format: 'post' })}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    (currentEncarte.format === 'post' || !currentEncarte.format) ? "bg-emerald-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  Post Quadrado
                </button>
                <button 
                  onClick={() => updateActiveEncarte({ format: 'story' })}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    currentEncarte.format === 'story' ? "bg-emerald-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  Story
                </button>
                <button 
                  onClick={() => updateActiveEncarte({ format: 'encarte' })}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    currentEncarte.format === 'encarte' ? "bg-emerald-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  Encarte
                </button>
              </div>

              <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                {[1, 2, 3, 4, 6, 8, 12].map(n => (
                  <button 
                    key={n}
                    onClick={() => updateActiveEncarte({ productCount: n })}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all",
                      currentEncarte.productCount === n ? "bg-emerald-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                <button 
                  onClick={() => setZoom(Math.max(25, zoom - 25))}
                  className="p-1.5 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-zinc-500 transition-all"
                >
                  <MoveDown className="w-3 h-3 rotate-90" />
                </button>
                <span className="text-[10px] font-black w-10 text-center">{zoom}%</span>
                <button 
                  onClick={() => setZoom(Math.min(200, zoom + 25))}
                  className="p-1.5 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-zinc-500 transition-all"
                >
                  <MoveUp className="w-3 h-3 rotate-90" />
                </button>
              </div>
            </div>
          </div>

          {/* A4 Page - Current Side */}
          <div 
            className="bg-white shadow-2xl p-[10mm] flex flex-col print:shadow-none print:p-0 relative overflow-hidden flex-shrink-0 origin-top" 
            id="encarte-page"
            style={{ 
              width: dims.width,
              height: dims.height,
              transform: `scale(${zoom / 100})`,
              marginBottom: `${(zoom / 100 - 1) * dims.mmHeight}mm`
            }}
          >
            {/* Background Image Layer */}
            {(currentSide === 'frente' ? currentEncarte.frontBgUrl : currentEncarte.backBgUrl) && (
              <div className="absolute inset-0 z-0 bg-white">
                <img 
                  src={getProxyUrl(currentSide === 'frente' ? currentEncarte.frontBgUrl : currentEncarte.backBgUrl)} 
                  alt="Background" 
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  loading="eager"
                  fetchPriority="high"
                />
              </div>
            )}

            <div className="p-4 flex-grow flex flex-col relative z-10">
              {/* Date Header */}
              {currentEncarte.date && (
                <motion.div 
                  drag
                  dragMomentum={false}
                  onDragEnd={(_, info) => {
                    updateActiveEncarte({
                      dateOffsetX: (currentEncarte.dateOffsetX || 0) + info.offset.x,
                      dateOffsetY: (currentEncarte.dateOffsetY || 0) + info.offset.y
                    });
                  }}
                  className="absolute top-2 right-4 z-20 cursor-move"
                  style={{
                    x: currentEncarte.dateOffsetX || 0,
                    y: currentEncarte.dateOffsetY || 0
                  }}
                >
                  <span className="text-[10px] font-black uppercase tracking-widest text-red-600 bg-white/80 px-2 py-1 rounded-lg backdrop-blur-sm border border-red-100 shadow-sm">
                    {currentEncarte.date}
                  </span>
                </motion.div>
              )}

              {/* Products Grid */}
              <div className={cn("grid gap-6 flex-grow content-start pt-56 px-4 relative", getGridClass(currentEncarte.productCount))}>
                {/* Extra Products Row */}
                {currentEncarte.extraProducts?.some(p => p !== null) && (
                  <div className="col-span-full grid grid-cols-2 gap-6 mb-6">
                    {currentEncarte.extraProducts.map((extra, idx) => extra && (
                      <motion.div 
                        key={`extra-${idx}`} 
                        drag
                        dragMomentum={false}
                        onDragEnd={(_, info) => {
                          const newExtras = [...(currentEncarte.extraProducts || [null, null])];
                          newExtras[idx] = { 
                            ...extra, 
                            offsetX: (extra.offsetX || 0) + info.offset.x,
                            offsetY: (extra.offsetY || 0) + info.offset.y
                          };
                          updateActiveEncarte({ extraProducts: newExtras });
                        }}
                        className={cn(
                          "p-4 rounded-3xl border-2 border-red-600 shadow-xl flex items-center gap-4 relative cursor-move",
                          extra.showBg !== false ? "backdrop-blur-sm" : "bg-transparent border-transparent shadow-none"
                        )}
                        style={{
                          x: extra.offsetX || 0,
                          y: extra.offsetY || 0,
                          width: extra.width ? `${extra.width}px` : '350px',
                          height: extra.height ? `${extra.height}px` : '120px',
                          backgroundColor: extra.showBg !== false ? (extra.bgColor || 'rgba(255, 255, 255, 0.95)') : 'transparent'
                        }}
                      >
                        <div className="flex-grow">
                          <h4 className="text-lg font-black uppercase text-red-600 leading-tight">{extra.name}</h4>
                          <p className="text-xs font-bold text-red-500 uppercase">{extra.subtitle}</p>
                          <div className="mt-2">
                            {extra.displayType === 'discount' ? (
                              <div className="bg-red-600 text-white px-4 py-1.5 rounded-lg inline-block">
                                <span className="text-2xl font-black">{extra.discountValue || '0%'}</span>
                                <span className="text-[10px] font-black uppercase ml-1">OFF</span>
                              </div>
                            ) : (
                              <div className="text-red-600 font-black flex items-center gap-1">
                                <div className="flex flex-col items-end leading-none">
                                  <span className="text-[8px] font-black uppercase">POR</span>
                                  <span className="text-[10px] font-black">R$</span>
                                </div>
                                <span className="text-5xl leading-none tracking-tighter">{formatPrice(extra.price).integer}</span>
                                <div className="flex flex-col items-start justify-between h-full py-0.5">
                                  <span className="text-2xl leading-none tracking-tighter">{formatPrice(extra.price).cents}</span>
                                  <span className="text-[10px] font-black uppercase leading-none">UNI</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="w-28 h-28 flex-shrink-0">
                          {extra.image && (
                            <img src={getProxyUrl(extra.image)} className="w-full h-full object-contain" referrerPolicy="no-referrer" crossOrigin="anonymous" />
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Horizontal Rulers */}
                {showHRulers.map((show, idx) => show && (
                  <div 
                    key={`h-ruler-${idx}`}
                    className="absolute left-0 right-0 h-1 z-50 cursor-ns-resize flex items-center justify-center pointer-events-auto"
                    style={{ top: `${hRulers[idx]}px`, backgroundColor: '#ff00ff' }}
                    onMouseDown={(e) => {
                      const startY = e.clientY;
                      const startRulerY = hRulers[idx];
                      const onMouseMove = (moveEvent: MouseEvent) => {
                        const deltaY = moveEvent.clientY - startY;
                        const newRulers = [...hRulers];
                        newRulers[idx] = Math.max(0, Math.min(1000, startRulerY + deltaY));
                        setHRulers(newRulers);
                      };
                      const onMouseUp = () => {
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);
                      };
                      window.addEventListener('mousemove', onMouseMove);
                      window.addEventListener('mouseup', onMouseUp);
                    }}
                  />
                ))}

                {/* Vertical Rulers */}
                {showVRulers.map((show, idx) => show && (
                  <div 
                    key={`v-ruler-${idx}`}
                    className="absolute top-0 bottom-0 w-1 z-50 cursor-ew-resize flex items-center justify-center pointer-events-auto"
                    style={{ left: `${vRulers[idx]}px`, backgroundColor: '#00ffff' }}
                    onMouseDown={(e) => {
                      const startX = e.clientX;
                      const startRulerX = vRulers[idx];
                      const onMouseMove = (moveEvent: MouseEvent) => {
                        const deltaX = moveEvent.clientX - startX;
                        const newRulers = [...vRulers];
                        newRulers[idx] = Math.max(0, Math.min(800, startRulerX + deltaX));
                        setVRulers(newRulers);
                      };
                      const onMouseUp = () => {
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);
                      };
                      window.addEventListener('mousemove', onMouseMove);
                      window.addEventListener('mouseup', onMouseUp);
                    }}
                  />
                ))}

                {currentProducts.map((product, index) => (
                  <div key={index} className="relative min-h-[180px] border border-dashed border-transparent rounded-2xl flex items-center justify-center group bg-transparent">
                    {product ? (
                      <motion.div 
                        key={index} 
                        drag
                        dragMomentum={false}
                        onDragEnd={(_, info) => {
                          if (product) {
                            const snap = 10; // Snap to 10px grid for auto-alignment
                            let newX = (product.offsetX || 0) + info.offset.x;
                            let newY = (product.offsetY || 0) + info.offset.y;

                            // Auto-alignment: snap to grid
                            newX = Math.round(newX / snap) * snap;
                            newY = Math.round(newY / snap) * snap;

                            // Snap to zero if close
                            if (Math.abs(newX) < snap) newX = 0;
                            if (Math.abs(newY) < snap) newY = 0;

                            handleUpdateProduct(index, 'offsetX', newX);
                            handleUpdateProduct(index, 'offsetY', newY);
                          }
                        }}
                        onClick={(e) => {
                          // Only open editor if not dragging
                          openEditor(index);
                        }}
                        className="p-3 rounded-2xl flex flex-col relative border border-transparent cursor-pointer z-20 w-full h-full"
                        style={{ 
                          x: product?.offsetX || 0,
                          y: product?.offsetY || 0,
                          backgroundColor: product.backgroundColor || 'transparent'
                        }}
                      >
                        <div className="absolute -top-2 -right-2 flex gap-1 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveProduct(index);
                            }}
                            className="p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex flex-col h-full pointer-events-none bg-transparent justify-end">
                          <div className="text-left h-[2.5rem] flex flex-col justify-end bg-transparent">
                            <h4 
                              className={cn("font-black tracking-tight leading-tight uppercase line-clamp-2", adaptive.title)}
                              style={{ color: product.textColor || '#dc2626' }}
                            >
                              {product.name}
                            </h4>
                            <p 
                              className={cn("font-bold uppercase leading-none truncate", adaptive.subtitle)}
                              style={{ color: product.textColor || '#dc2626' }}
                            >
                              {product.subtitle}
                            </p>
                          </div>
                          
                          <div className={cn("flex items-center bg-transparent", adaptive.gap)}>
                            {/* Price Box */}
                            <div 
                              className={cn("text-white relative flex items-center justify-center shadow-lg", adaptive.box, getBubbleClass(currentEncarte.bubbleShape))}
                              style={{ 
                                backgroundColor: product.labelColor || product.priceColor || '#dc2626',
                                ...getBubbleStyle(currentEncarte.bubbleShape),
                                transform: `scale(${(product.labelSize || 100) / 100}) ${currentEncarte.bubbleShape === 'diamond' ? 'rotate(45deg)' : ''}`
                              }}
                            >
                              <div className={cn("flex items-center justify-center w-full h-full relative", currentEncarte.bubbleShape === 'diamond' && '-rotate-45')}>
                                {product.showPercentage ? (
                                  <div className="flex flex-col items-center justify-center w-full h-full">
                                    <span className="text-[10px] font-black uppercase leading-none opacity-80 mb-1">DESCONTO</span>
                                    <div className="flex items-center justify-center bg-white text-red-600 px-2 py-1 rounded-lg shadow-sm">
                                      <span className="text-3xl font-black leading-none">{product.discountValue || '0%'}</span>
                                      <span className="text-sm font-black ml-1">OFF</span>
                                    </div>
                                  </div>
                                ) : product.tipo === 'De X por Y' ? (
                                  <div className="flex flex-col items-start gap-0 w-full pl-1">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-black uppercase whitespace-nowrap">{product.tituloOriginal || 'DE'} R$</span>
                                      <span className={cn("font-black tracking-tighter leading-none whitespace-nowrap text-lg", product.strikeThrough && "line-through")}>
                                        {product.precoOriginal || '0,00'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 -mt-1">
                                      <span className="text-[12px] font-black uppercase whitespace-nowrap">{product.tituloDesconto || 'POR'} R$</span>
                                      <div className="flex items-baseline">
                                        <span className={cn("font-black tracking-tighter leading-none text-4xl whitespace-nowrap")}>
                                          {formatPrice(product.precoDesconto || '0,00').integer}
                                        </span>
                                        <span className="text-xl font-black tracking-tighter leading-none">
                                          {formatPrice(product.precoDesconto || '0,00').cents}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="absolute bottom-1 right-2">
                                      <span className="text-[9px] font-black uppercase leading-none opacity-90 italic">
                                        {product.medidaValue ? `${product.medidaValue} ` : ''}{product.medidaUnit || 'cada'}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <div className="flex flex-col items-end leading-none">
                                      <span className="text-[8px] font-black uppercase">POR</span>
                                      <span className="text-[10px] font-black">R$</span>
                                    </div>
                                    <span className={cn("font-black tracking-tighter leading-none", adaptive.price)}>
                                      {formatPrice(product.price).integer}
                                    </span>
                                    <div className="flex flex-col items-start justify-between h-full py-1">
                                      <span className={cn("font-black tracking-tighter leading-none", adaptive.cents)}>
                                        {formatPrice(product.price).cents}
                                      </span>
                                      <span className="text-[7px] font-black uppercase leading-none">
                                        {product.medidaUnit || 'UNI'}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* Product Image */}
                            <div className={cn("flex-grow flex items-center justify-center bg-transparent", adaptive.img)}>
                              {product.image ? (
                                <img 
                                  src={getProxyUrl(product.image)} 
                                  className="max-w-full max-h-full object-contain drop-shadow-md bg-transparent" 
                                  style={{ transform: `scale(${(product.productSize || 100) / 100})` }}
                                  referrerPolicy="no-referrer" 
                                  crossOrigin="anonymous"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <Package className="w-12 h-12 text-zinc-200 dark:text-zinc-700" />
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <button 
                        onClick={() => openSelector(index)}
                        className="w-full h-full bg-transparent flex items-center justify-center transition-all"
                      >
                        {/* Plus icon removed as requested */}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Hidden Print Pages - Positioned to allow html2canvas capture but hidden from view */}
      <div className="fixed top-0 left-0 opacity-0 pointer-events-none z-[-10] print:static print:opacity-100 print:z-0 print:pointer-events-auto">
        {/* Page 1 - Frente */}
        <div 
          className="bg-white p-[10mm] flex flex-col relative overflow-hidden print:m-0 print:p-0" 
          id="print-frente"
          style={{ width: dims.width, height: dims.height }}
        >
           {currentEncarte.frontBgUrl && (
            <div className="absolute inset-0 z-0 bg-white">
              <img 
                src={getProxyUrl(currentEncarte.frontBgUrl)} 
                className="w-full h-full object-contain" 
                referrerPolicy="no-referrer" 
                crossOrigin="anonymous"
              />
            </div>
          )}
          <div className={cn("p-4 flex-grow flex flex-col relative z-10")}>
            {currentEncarte.date && (
              <div 
                className="absolute top-2 right-4 z-20"
                style={{
                  transform: `translate(${currentEncarte.dateOffsetX || 0}px, ${currentEncarte.dateOffsetY || 0}px)`
                }}
              >
                <span className="text-[10px] font-black uppercase tracking-widest text-red-600 bg-white/80 px-2 py-1 rounded-lg backdrop-blur-sm border border-red-100 shadow-sm">
                  {currentEncarte.date}
                </span>
              </div>
            )}
            <div className={cn("grid gap-4 flex-grow content-start pt-48", getGridClass(currentEncarte.productCount))}>
              {/* Extra Products Row */}
              {currentEncarte.extraProducts?.some(p => p !== null) && (
                <div className="col-span-full grid grid-cols-2 gap-4 mb-4">
                  {currentEncarte.extraProducts.map((extra, idx) => extra && (
                    <div key={`extra-print-${idx}`} className="bg-white/95 p-4 rounded-3xl border-4 border-red-600 shadow-sm flex items-center gap-4 relative">
                      <div className="flex-grow">
                        <h4 className="text-sm font-black uppercase text-red-600 leading-tight">{extra.name}</h4>
                        <p className="text-[10px] font-bold text-red-500 uppercase">{extra.subtitle}</p>
                        <div className="mt-1">
                          {extra.displayType === 'discount' ? (
                            <div className="bg-red-600 text-white px-2 py-0.5 rounded-md inline-block">
                              <span className="text-lg font-black">{extra.discountValue || '0%'}</span>
                              <span className="text-[8px] font-black uppercase ml-0.5">OFF</span>
                            </div>
                          ) : (
                            <div className="text-red-600 font-black flex items-center gap-1">
                              <span className="text-[10px]">R$</span>
                              <span className="text-3xl leading-none">{formatPrice(extra.price).integer}</span>
                              <span className="text-lg leading-none">{formatPrice(extra.price).cents}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="w-20 h-20 flex-shrink-0">
                        {extra.image && (
                          <img src={getProxyUrl(extra.image)} className="w-full h-full object-contain" referrerPolicy="no-referrer" crossOrigin="anonymous" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {currentEncarte.frontProducts.slice(0, currentEncarte.productCount).map((product, index) => (
                <div 
                  key={index} 
                  className="p-2 rounded-xl flex flex-col relative min-h-0"
                  style={{ 
                    transform: product ? `translate(${product.offsetX || 0}px, ${product.offsetY || 0}px)` : 'none',
                    backgroundColor: product?.backgroundColor || 'transparent'
                  }}
                >
                  {product && (
                    <div className="flex flex-col h-full bg-transparent justify-end">
                      <div 
                        className="text-left h-[2.5rem] flex flex-col justify-end bg-transparent"
                        style={{ 
                          transform: `translate(${product.textOffsetX || 0}px, ${product.textOffsetY || 0}px)`
                        }}
                      >
                        <h4 
                          className={cn("font-black tracking-tight leading-tight uppercase line-clamp-2", adaptive.title)}
                          style={{ color: product.textColor || '#dc2626' }}
                        >
                          {product.name}
                        </h4>
                        <p 
                          className={cn("font-bold uppercase leading-none truncate", adaptive.subtitle)}
                          style={{ color: product.textColor || '#dc2626' }}
                        >
                          {product.subtitle}
                        </p>
                      </div>
                      <div className={cn("flex items-center bg-transparent", adaptive.gap)}>
                        <div 
                          className={cn("text-white relative flex items-center justify-center shadow-lg", adaptive.box, getBubbleClass(currentEncarte.bubbleShape))}
                          style={{ 
                            backgroundColor: product.labelColor || product.priceColor || '#dc2626',
                            ...getBubbleStyle(currentEncarte.bubbleShape),
                            transform: `scale(${(product.labelSize || 100) / 100}) ${currentEncarte.bubbleShape === 'diamond' ? 'rotate(45deg)' : ''}`
                          }}
                        >
                          <div className={cn("flex items-center justify-center w-full h-full relative", currentEncarte.bubbleShape === 'diamond' && '-rotate-45')}>
                            {product.showPercentage ? (
                              <div className="flex flex-col items-center justify-center w-full h-full">
                                <span className="text-[10px] font-black uppercase leading-none opacity-80 mb-1">DESCONTO</span>
                                <div className="flex items-center justify-center bg-white text-red-600 px-2 py-1 rounded-lg shadow-sm">
                                  <span className="text-3xl font-black leading-none">{product.discountValue || '0%'}</span>
                                  <span className="text-sm font-black ml-1">OFF</span>
                                </div>
                              </div>
                            ) : product.tipo === 'De X por Y' ? (
                              <div className="flex flex-col items-start gap-0 w-full pl-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-black uppercase whitespace-nowrap">{product.tituloOriginal || 'DE'} R$</span>
                                  <span className={cn("font-black tracking-tighter leading-none whitespace-nowrap text-lg", product.strikeThrough && "line-through")}>
                                    {product.precoOriginal || '0,00'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 -mt-1">
                                  <span className="text-[12px] font-black uppercase whitespace-nowrap">{product.tituloDesconto || 'POR'} R$</span>
                                  <div className="flex items-baseline">
                                    <span className={cn("font-black tracking-tighter leading-none text-4xl whitespace-nowrap")}>
                                      {formatPrice(product.precoDesconto || '0,00').integer}
                                    </span>
                                    <span className="text-xl font-black tracking-tighter leading-none">
                                      {formatPrice(product.precoDesconto || '0,00').cents}
                                    </span>
                                  </div>
                                </div>
                                <div className="absolute bottom-1 right-2">
                                  <span className="text-[9px] font-black uppercase leading-none opacity-90 italic">
                                    {product.medidaValue ? `${product.medidaValue} ` : ''}{product.medidaUnit || 'cada'}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-baseline gap-0.5">
                                <div className="flex flex-col items-start leading-none">
                                  <span className="text-[8px] font-black uppercase">POR</span>
                                  <span className="text-[10px] font-black">R$</span>
                                </div>
                                <span className={cn("font-black tracking-tighter leading-none", adaptive.price)}>{formatPrice(product.price).integer}</span>
                                <span className={cn("font-black tracking-tighter leading-none", adaptive.cents)}>{formatPrice(product.price).cents}</span>
                                <span className="absolute bottom-0.5 right-1 text-[7px] font-black uppercase opacity-80">{product.medidaValue ? `${product.medidaValue} ` : ''}{product.medidaUnit || 'UNI'}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className={cn("flex-grow flex items-center justify-center bg-transparent", adaptive.img)}>
                          {product.image && (
                            <img 
                              src={getProxyUrl(product.image)} 
                              className="max-w-full max-h-full object-contain bg-transparent" 
                              style={{ transform: `scale(${(product.productSize || 100) / 100})` }}
                              referrerPolicy="no-referrer" 
                              crossOrigin="anonymous"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Page 2 - Verso */}
        <div 
          className="bg-white p-[10mm] flex flex-col relative overflow-hidden print:m-0 print:p-0 page-break-before" 
          id="print-verso"
          style={{ width: dims.width, height: dims.height }}
        >
           {currentEncarte.backBgUrl && (
            <div className="absolute inset-0 z-0 bg-white">
              <img 
                src={getProxyUrl(currentEncarte.backBgUrl)} 
                className="w-full h-full object-contain" 
                referrerPolicy="no-referrer" 
                crossOrigin="anonymous"
              />
            </div>
          )}
          <div className={cn("p-4 flex-grow flex flex-col relative z-10")}>
            {currentEncarte.date && (
              <div 
                className="absolute top-2 right-4 z-20"
                style={{
                  transform: `translate(${currentEncarte.dateOffsetX || 0}px, ${currentEncarte.dateOffsetY || 0}px)`
                }}
              >
                <span className="text-[10px] font-black uppercase tracking-widest text-red-600 bg-white/80 px-2 py-1 rounded-lg backdrop-blur-sm border border-red-100 shadow-sm">
                  {currentEncarte.date}
                </span>
              </div>
            )}
            <div className={cn("grid gap-4 flex-grow content-start pt-48", getGridClass(currentEncarte.productCount))}>
              {/* Extra Products Row */}
              {currentEncarte.extraProducts?.some(p => p !== null) && (
                <div className="col-span-full grid grid-cols-2 gap-4 mb-4">
                  {currentEncarte.extraProducts.map((extra, idx) => extra && (
                    <div key={`extra-print-verso-${idx}`} className="bg-white/95 p-4 rounded-3xl border-4 border-red-600 shadow-sm flex items-center gap-4 relative">
                      <div className="flex-grow">
                        <h4 className="text-sm font-black uppercase text-red-600 leading-tight">{extra.name}</h4>
                        <p className="text-[10px] font-bold text-red-500 uppercase">{extra.subtitle}</p>
                        <div className="mt-1">
                          {extra.displayType === 'discount' ? (
                            <div className="bg-red-600 text-white px-2 py-0.5 rounded-md inline-block">
                              <span className="text-lg font-black">{extra.discountValue || '0%'}</span>
                              <span className="text-[8px] font-black uppercase ml-0.5">OFF</span>
                            </div>
                          ) : (
                            <div className="text-red-600 font-black flex items-center gap-1">
                              <span className="text-[10px]">R$</span>
                              <span className="text-3xl leading-none">{formatPrice(extra.price).integer}</span>
                              <span className="text-lg leading-none">{formatPrice(extra.price).cents}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="w-20 h-20 flex-shrink-0">
                        {extra.image && (
                          <img src={getProxyUrl(extra.image)} className="w-full h-full object-contain" referrerPolicy="no-referrer" crossOrigin="anonymous" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {currentEncarte.backProducts.slice(0, currentEncarte.productCount).map((product, index) => (
                <div 
                  key={index} 
                  className="p-2 rounded-xl flex flex-col relative min-h-0"
                  style={{ 
                    transform: product ? `translate(${product.offsetX || 0}px, ${product.offsetY || 0}px)` : 'none',
                    backgroundColor: product?.backgroundColor || 'transparent'
                  }}
                >
                  {product && (
                    <div className="flex flex-col h-full bg-transparent justify-end">
                      <div 
                        className="text-left h-[2.5rem] flex flex-col justify-end bg-transparent"
                        style={{ 
                          transform: `translate(${product.textOffsetX || 0}px, ${product.textOffsetY || 0}px)`
                        }}
                      >
                        <h4 
                          className={cn("font-black tracking-tight leading-tight uppercase line-clamp-2", adaptive.title)}
                          style={{ color: product.textColor || '#dc2626' }}
                        >
                          {product.name}
                        </h4>
                        <p 
                          className={cn("font-bold uppercase leading-none truncate", adaptive.subtitle)}
                          style={{ color: product.textColor || '#dc2626' }}
                        >
                          {product.subtitle}
                        </p>
                      </div>
                      <div className={cn("flex items-center bg-transparent", adaptive.gap)}>
                        <div 
                          className={cn("text-white relative flex items-center justify-center shadow-lg", adaptive.box, getBubbleClass(currentEncarte.bubbleShape))}
                          style={{ 
                            backgroundColor: product.labelColor || product.priceColor || '#dc2626',
                            ...getBubbleStyle(currentEncarte.bubbleShape),
                            transform: `scale(${(product.labelSize || 100) / 100}) ${currentEncarte.bubbleShape === 'diamond' ? 'rotate(45deg)' : ''}`
                          }}
                        >
                          <div className={cn("flex items-center justify-center w-full h-full relative", currentEncarte.bubbleShape === 'diamond' && '-rotate-45')}>
                            {product.showPercentage ? (
                              <div className="flex flex-col items-center justify-center w-full h-full">
                                <span className="text-[10px] font-black uppercase leading-none opacity-80 mb-1">DESCONTO</span>
                                <div className="flex items-center justify-center bg-white text-red-600 px-2 py-1 rounded-lg shadow-sm">
                                  <span className="text-3xl font-black leading-none">{product.discountValue || '0%'}</span>
                                  <span className="text-sm font-black ml-1">OFF</span>
                                </div>
                              </div>
                            ) : product.tipo === 'De X por Y' ? (
                              <div className="flex flex-col items-start gap-0 w-full pl-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-black uppercase whitespace-nowrap">{product.tituloOriginal || 'DE'} R$</span>
                                  <span className={cn("font-black tracking-tighter leading-none whitespace-nowrap text-lg", product.strikeThrough && "line-through")}>
                                    {product.precoOriginal || '0,00'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 -mt-1">
                                  <span className="text-[12px] font-black uppercase whitespace-nowrap">{product.tituloDesconto || 'POR'} R$</span>
                                  <div className="flex items-baseline">
                                    <span className={cn("font-black tracking-tighter leading-none text-4xl whitespace-nowrap")}>
                                      {formatPrice(product.precoDesconto || '0,00').integer}
                                    </span>
                                    <span className="text-xl font-black tracking-tighter leading-none">
                                      {formatPrice(product.precoDesconto || '0,00').cents}
                                    </span>
                                  </div>
                                </div>
                                <div className="absolute bottom-1 right-2">
                                  <span className="text-[9px] font-black uppercase leading-none opacity-90 italic">
                                    {product.medidaValue ? `${product.medidaValue} ` : ''}{product.medidaUnit || 'cada'}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-baseline gap-0.5">
                                <div className="flex flex-col items-start leading-none">
                                  <span className="text-[8px] font-black uppercase">POR</span>
                                  <span className="text-[10px] font-black">R$</span>
                                </div>
                                <span className={cn("font-black tracking-tighter leading-none", adaptive.price)}>{formatPrice(product.price).integer}</span>
                                <span className={cn("font-black tracking-tighter leading-none", adaptive.cents)}>{formatPrice(product.price).cents}</span>
                                <span className="absolute bottom-0.5 right-1 text-[7px] font-black uppercase opacity-80">{product.medidaValue ? `${product.medidaValue} ` : ''}{product.medidaUnit || 'UNI'}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className={cn("flex-grow flex items-center justify-center bg-transparent", adaptive.img)}>
                          {product.image && (
                            <img 
                              src={getProxyUrl(product.image)} 
                              className="max-w-full max-h-full object-contain bg-transparent" 
                              style={{ transform: `scale(${(product.productSize || 100) / 100})` }}
                              referrerPolicy="no-referrer" 
                              crossOrigin="anonymous"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Asset URL Modal */}
      {isAddingAsset && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="text-xl font-black tracking-tighter uppercase">Adicionar URL Pública</h3>
              <button 
                onClick={() => {
                  setIsAddingAsset(null);
                  setAssetUrl('');
                }}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">URL da Imagem</label>
                <input 
                  type="text"
                  placeholder="https://exemplo.com/imagem.png"
                  value={assetUrl}
                  onChange={(e) => setAssetUrl(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                />
              </div>
              
              <button 
                onClick={() => {
                  if (!assetUrl) return;
                  
                  if (!isValidImageUrl(assetUrl)) {
                    toast.error('URL de imagem inválida. Certifique-se de que a URL está correta.');
                    return;
                  }

                  if (isAddingAsset === 'logo') setEncarteLogos([...encarteLogos, assetUrl]);
                  if (isAddingAsset === 'layouts') setEncarteLayouts([...encarteLayouts, assetUrl]);
                  if (isAddingAsset === 'themes') {
                    const newThemes = [...encarteThemes];
                    if (newThemes.length === 0) {
                      newThemes.push({ id: 'custom', name: 'Personalizados', themes: [] });
                    }
                    newThemes[0].themes.push({ id: `custom-${Date.now()}`, name: 'Novo Tema', imageUrl: assetUrl, category: 'Personalizados' });
                    setEncarteThemes(newThemes);
                  }
                  setIsAddingAsset(null);
                  setAssetUrl('');
                  toast.success('Asset adicionado com sucesso!');
                }}
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Editor Modal */}
      {isEditingModalOpen && editingProductIndex !== null && currentProducts[editingProductIndex] && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[120] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="text-xl font-black tracking-tighter uppercase">Editar Produto</h3>
              <button 
                onClick={() => setIsEditingModalOpen(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* Image and Action Buttons */}
              <div className="flex gap-6">
                <div className="w-40 h-40 bg-zinc-100 dark:bg-zinc-800 rounded-3xl border border-zinc-200 dark:border-zinc-700 flex flex-col items-center justify-center p-4 relative group">
                  {currentProducts[editingProductIndex]?.image ? (
                    <img 
                      src={getProxyUrl(currentProducts[editingProductIndex]!.image!)} 
                      className="w-full h-full object-contain" 
                      referrerPolicy="no-referrer" 
                      crossOrigin="anonymous" 
                    />
                  ) : (
                    <Package className="w-12 h-12 text-zinc-300" />
                  )}
                  <button 
                    onClick={() => {
                      setIsEditingModalOpen(false);
                      openSelector(editingProductIndex);
                    }}
                    className="mt-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700"
                  >
                    Ver mais imagens
                  </button>
                </div>
                
                <div className="flex-grow space-y-2">
                  <button className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all">
                    <div className="flex items-center gap-2">
                      <Eraser className="w-4 h-4" />
                      <span>Remover fundo</span>
                    </div>
                    <span className="text-amber-500">👑</span>
                  </button>
                  <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold">
                    <div className="flex items-center gap-2">
                      <Palette className="w-4 h-4" />
                      <span>Cor do fundo</span>
                    </div>
                    <input 
                      type="color" 
                      value={currentProducts[editingProductIndex]?.backgroundColor || '#ffffff'}
                      onChange={(e) => handleUpdateProduct(editingProductIndex, 'backgroundColor', e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border-none bg-transparent" 
                    />
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      <span>Cor da etiqueta</span>
                    </div>
                    <input 
                      type="color" 
                      value={currentProducts[editingProductIndex]?.labelColor || '#dc2626'}
                      onChange={(e) => handleUpdateProduct(editingProductIndex, 'labelColor', e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border-none bg-transparent" 
                    />
                  </div>
                  <button 
                    onClick={() => {
                      handleRemoveProduct(editingProductIndex);
                      setIsEditingModalOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Remover produto</span>
                  </button>
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Nome</label>
                  <input 
                    type="text"
                    value={currentProducts[editingProductIndex]?.name || ''}
                    onChange={(e) => handleUpdateProduct(editingProductIndex, 'name', e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Medida</label>
                    <div className="flex gap-2">
                      <div className="relative flex-grow">
                        <select 
                          value={currentProducts[editingProductIndex]?.medidaValue || ''}
                          onChange={(e) => handleUpdateProduct(editingProductIndex, 'medidaValue', e.target.value)}
                          className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold appearance-none"
                        >
                          <option value=""></option>
                          <option value="1">1</option>
                          <option value="5">5</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                      </div>
                      <input 
                        type="text"
                        value={currentProducts[editingProductIndex]?.medidaUnit || ''}
                        onChange={(e) => handleUpdateProduct(editingProductIndex, 'medidaUnit', e.target.value)}
                        className="w-20 px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                        placeholder="kg"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Tipo</label>
                    <div className="relative">
                      <select 
                        value={currentProducts[editingProductIndex]?.tipo || 'Normal'}
                        onChange={(e) => handleUpdateProduct(editingProductIndex, 'tipo', e.target.value)}
                        className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold appearance-none"
                      >
                        <option value="Normal">Normal</option>
                        <option value="De X por Y">De X por Y</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {currentProducts[editingProductIndex]?.tipo === 'De X por Y' ? (
                  <>
                    <p className="text-[10px] text-zinc-500 font-medium italic">
                      Irá exibir o preço de oferta e o preço original do produto.
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Título original</label>
                        <input 
                          type="text"
                          value={currentProducts[editingProductIndex]?.tituloOriginal || 'DE'}
                          onChange={(e) => handleUpdateProduct(editingProductIndex, 'tituloOriginal', e.target.value)}
                          className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Preço original</label>
                        <input 
                          type="text"
                          value={currentProducts[editingProductIndex]?.precoOriginal || ''}
                          onChange={(e) => handleUpdateProduct(editingProductIndex, 'precoOriginal', e.target.value)}
                          className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Título Desconto</label>
                        <input 
                          type="text"
                          value={currentProducts[editingProductIndex]?.tituloDesconto || 'POR'}
                          onChange={(e) => handleUpdateProduct(editingProductIndex, 'tituloDesconto', e.target.value)}
                          className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Preço Desconto</label>
                        <input 
                          type="text"
                          value={currentProducts[editingProductIndex]?.precoDesconto || ''}
                          onChange={(e) => handleUpdateProduct(editingProductIndex, 'precoDesconto', e.target.value)}
                          className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Preço</label>
                    <input 
                      type="text"
                      value={currentProducts[editingProductIndex]?.price || ''}
                      onChange={(e) => handleUpdateProduct(editingProductIndex, 'price', e.target.value)}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                    />
                  </div>
                )}

                <div className="flex items-center gap-8">
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          className="sr-only"
                          checked={currentProducts[editingProductIndex]?.showPercentage || false}
                          onChange={(e) => handleUpdateProduct(editingProductIndex, 'showPercentage', e.target.checked)}
                        />
                        <div className={cn(
                          "w-10 h-5 rounded-full transition-colors",
                          currentProducts[editingProductIndex]?.showPercentage ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-700"
                        )} />
                        <div className={cn(
                          "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform",
                          currentProducts[editingProductIndex]?.showPercentage ? "translate-x-5" : "translate-x-0"
                        )} />
                      </div>
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">% Desconto</span>
                    </label>
                    {currentProducts[editingProductIndex]?.showPercentage && (
                      <input 
                        type="text"
                        placeholder="Ex: 20%"
                        value={currentProducts[editingProductIndex]?.discountValue || ''}
                        onChange={(e) => handleUpdateProduct(editingProductIndex, 'discountValue', e.target.value)}
                        className="w-24 px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                      />
                    )}
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        className="sr-only"
                        checked={currentProducts[editingProductIndex]?.strikeThrough || false}
                        onChange={(e) => handleUpdateProduct(editingProductIndex, 'strikeThrough', e.target.checked)}
                      />
                      <div className={cn(
                        "w-10 h-5 rounded-full transition-colors",
                        currentProducts[editingProductIndex]?.strikeThrough ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-700"
                      )} />
                      <div className={cn(
                        "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform",
                        currentProducts[editingProductIndex]?.strikeThrough ? "translate-x-5" : "translate-x-0"
                      )} />
                    </div>
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Riscar Preço</span>
                  </label>
                </div>

                <div className="space-y-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black uppercase tracking-widest">Tamanhos</h4>
                    <span className="text-amber-500">👑</span>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Produto</label>
                      </div>
                      <input 
                        type="range"
                        min="50"
                        max="150"
                        value={currentProducts[editingProductIndex]?.productSize || 100}
                        onChange={(e) => handleUpdateProduct(editingProductIndex, 'productSize', parseInt(e.target.value))}
                        className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Etiqueta</label>
                      </div>
                      <input 
                        type="range"
                        min="50"
                        max="150"
                        value={currentProducts[editingProductIndex]?.labelSize || 100}
                        onChange={(e) => handleUpdateProduct(editingProductIndex, 'labelSize', parseInt(e.target.value))}
                        className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Selector Modal */}
      {isSelectorOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl max-h-[80vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                  <Package className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="text-xl font-black tracking-tighter uppercase">Selecionar Produto</h3>
              </div>
              <button 
                onClick={() => setIsSelectorOpen(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-grow overflow-y-auto p-6">
              <ProductSelector onSelect={handleAddProduct} />
            </div>
          </div>
        </div>
      )}

      {/* Print Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #print-frente, #print-frente *, #print-verso, #print-verso * {
            visibility: visible;
          }
          #print-frente {
            position: relative;
            width: ${dims.width};
            height: ${dims.height};
            page-break-after: always;
          }
          #print-verso {
            position: relative;
            width: ${dims.width};
            height: ${dims.height};
          }
          @page {
            size: ${dims.width} ${dims.height};
            margin: 0;
          }
          .page-break-before {
            page-break-before: always;
          }
        }
      `}} />
    </div>
  );
}
