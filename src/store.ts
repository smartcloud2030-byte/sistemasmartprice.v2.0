import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── API helper ────────────────────────────────────────────────────────────────
const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';
const API_BASE = '/api';

async function apiGet(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-api-token': API_SECRET }
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-token': API_SECRET },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}
// ───────────────────────────────────────────────────────────────────────────────

export interface TextSettings {
  text: string;
  fontSize: number;
  color: string;
  isBold: boolean;
  isItalic?: boolean;
  fontFamily?: string;
  x: number;
  y: number;
  width: number;
  align: 'left' | 'center' | 'right';
  visible: boolean;
}

export interface ImageSettings {
  url: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export interface Product {
  id?: string | number;
  name: string;
  description: string;
  price: string;
  image: string | null;
  category: string;
}

export interface Layout {
  name: string;
  bandeira?: string;
  localidade?: string;
  sortOrder?: number;
  background: {
    url: string | null;
    mode: 'cover' | 'contain';
    locked: boolean;
  };
  productImage1: ImageSettings;
  productImage2: ImageSettings;
  productImage3: ImageSettings;
  textElements1: {
    name: TextSettings;
    description: TextSettings;
    subtitle: TextSettings;
    price: TextSettings;
  };
  textElements2: {
    name: TextSettings;
    description: TextSettings;
    subtitle: TextSettings;
    price: TextSettings;
  };
  textElements3: {
    name: TextSettings;
    description: TextSettings;
    subtitle: TextSettings;
    price: TextSettings;
  };
  hasThirdProduct?: boolean;
  orientation?: 'portrait' | 'landscape';
  isSingleProduct?: boolean;
  showSingleProductControl?: boolean;
  showOptionalTextControl?: boolean;
  optionalText1?: OptionalTextSettings;
  optionalText2?: OptionalTextSettings;
  optionalText3?: OptionalTextSettings;
}

export interface OptionalTextSettings {
  text: string;
  active: boolean;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily?: string;
  isItalic?: boolean;
  isBold?: boolean;
}

export interface UserGroup {
  id: string;
  name: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  targetType: 'all' | 'group' | 'cnpj';
  targetValue?: string;
  createdAt: string;
}

export type View = 'editor' | 'queue' | 'encarte';

export interface SelectedProduct extends Product {
  id: string;
  subtitle?: string;
  offsetX?: number;
  offsetY?: number;
  textOffsetX?: number;
  textOffsetY?: number;
  displayType?: 'price' | 'discount';
  discountValue?: string;
  priceColor?: string;
  textColor?: string;
  width?: number;
  height?: number;
  bgColor?: string;
  showBg?: boolean;
  medidaValue?: string;
  medidaUnit?: string;
  tipo?: string;
  tituloOriginal?: string;
  precoOriginal?: string;
  tituloDesconto?: string;
  precoDesconto?: string;
  showPercentage?: boolean;
  strikeThrough?: boolean;
  productSize?: number;
  labelSize?: number;
  backgroundColor?: string;
  labelColor?: string;
}

export interface EncarteSlot {
  name: string;
  date?: string;
  dateOffsetX?: number;
  dateOffsetY?: number;
  frontBgUrl: string;
  backBgUrl: string;
  frontProducts: (SelectedProduct | null)[];
  backProducts: (SelectedProduct | null)[];
  productCount: number;
  format?: 'post' | 'story' | 'encarte';
  bubbleShape?: 'rounded' | 'square' | 'circle' | 'pill' | 'burst' | 'badge' | 'diamond' | 'hexagon' | 'star' | 'oval';
  extraProducts?: (SelectedProduct | null)[];
}

export interface EncarteModel {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  bgClass: string;
  borderClass: string;
  fontFamily?: string;
  imageUrl?: string;
}

export interface Theme {
  id: string;
  name: string;
  imageUrl: string;
  category: string;
}

export interface ThemeCategory {
  id: string;
  name: string;
  themes: Theme[];
}

export type EncarteTab = 'themes' | 'layouts' | 'products' | 'info' | 'labels' | 'colors' | 'fonts' | 'logo';

interface AppState {
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  background: {
    url: string | null;
    mode: 'cover' | 'contain';
    locked: boolean;
  };

  productImage1: ImageSettings;
  productImage2: ImageSettings;
  productImage3: ImageSettings;

  textElements1: {
    name: TextSettings;
    description: TextSettings;
    subtitle: TextSettings;
    price: TextSettings;
  };
  textElements2: {
    name: TextSettings;
    description: TextSettings;
    subtitle: TextSettings;
    price: TextSettings;
  };
  textElements3: {
    name: TextSettings;
    description: TextSettings;
    subtitle: TextSettings;
    price: TextSettings;
  };

  optionalText1: OptionalTextSettings;
  optionalText2: OptionalTextSettings;
  optionalText3: OptionalTextSettings;

  activeLayoutIndex: number;
  layouts: Layout[];
  orientation: 'portrait' | 'landscape';
  setActiveLayout: (index: number) => void;
  setLayoutOrientation: (index: number, orientation: 'portrait' | 'landscape') => void;
  setLayoutName: (index: number, name: string) => void;
  setLayoutBandeira: (index: number, bandeira: string) => void;
  setLayoutLocalidade: (index: number, localidade: string) => void;
  reorderLayouts: (fromIndex: number, toIndex: number) => void;
  setLayoutHasThirdProduct: (index: number, hasThirdProduct: boolean) => void;

  setElement: (slot: 1 | 2 | 3, key: keyof AppState['textElements1'], settings: Partial<TextSettings>) => void;
  setProductImage: (slot: 1 | 2 | 3, settings: Partial<ImageSettings>) => void;
  setBackground: (settings: Partial<AppState['background']>) => void;

  products: Product[];
  isProductModalOpen: boolean;
  setProductModalOpen: (open: boolean) => void;
  isUserModalOpen: boolean;
  setUserModalOpen: (open: boolean) => void;
  fetchProducts: () => Promise<void>;
  selectProduct: (slot: 1 | 2 | 3, product: Product) => void;

  saveLayout: () => Promise<void>;
  saveLayoutDebounced: () => void;
  loadLayout: () => Promise<void>;
  saveAll: () => Promise<void>;

  zoom: number;
  setZoom: (zoom: number) => void;

  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  setOptionalText: (slot: 1 | 2 | 3, updates: Partial<AppState['optionalText1']>) => void;
  isPrinting: boolean;
  setPrinting: (isPrinting: boolean) => void;
  isSingleProduct: boolean;
  setSingleProduct: (isSingleProduct: boolean) => void;
  showSingleProductControl: boolean;
  setShowSingleProductControl: (show: boolean) => void;
  showOptionalTextControl: boolean;
  setShowOptionalTextControl: (show: boolean) => void;
  toggleHasThirdProduct: () => void;

  printQueue: { imageData: string; isLandscape: boolean }[];
  addToQueue: (imageData: string, isLandscape: boolean) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  currentView: View;
  setView: (view: View) => void;
  realtimeInitialized: boolean;
  settingsRealtimeInitialized: boolean;
  lastUpdateTimestamp: string | null;

  flags: string[];
  addFlag: (flag: string) => void;
  removeFlag: (flag: string) => void;
  updateFlag: (oldFlag: string, newFlag: string) => void;

  userGroups: UserGroup[];
  addUserGroup: (name: string) => void;
  removeUserGroup: (id: string) => void;
  updateUserGroup: (id: string, name: string) => void;
  setUserGroup: (cnpj: string, groupId: string | undefined) => void;

  allowedStores: {
    cnpj: string;
    bandeira: string;
    allowedLayouts?: number[];
    hasEncarteAccess?: boolean;
    groupId?: string;
    isSuspended?: boolean;
    isOnline?: boolean;
    lastAccess?: string;
    lastUsername?: string;
  }[];
  addAllowedStore: (store: {
    cnpj: string;
    bandeira: string;
    allowedLayouts?: number[];
    hasEncarteAccess?: boolean;
    groupId?: string;
    isSuspended?: boolean;
    isOnline?: boolean;
    lastAccess?: string;
    lastUsername?: string;
  }) => void;
  removeAllowedStore: (cnpj: string) => void;
  toggleSuspension: (cnpj: string) => void;
  updateOnlineStatus: () => Promise<void>;
  saveUsersAndFlags: () => Promise<void>;
  saveUsersAndFlagsDebounced: () => void;
  loadUsersAndFlags: () => Promise<void>;
  isAuthenticated: boolean;
  lastLoginTimestamp: number | null;
  userRole: 'user' | 'admin' | null;
  currentUser: { username: string; cnpj: string; bandeira: string } | null;
  isSupportChatOpen: boolean;
  isChatEnabled: boolean;
  setSupportChatOpen: (open: boolean) => void;
  setIsChatEnabled: (isEnabled: boolean) => void;
  isChatConnected: boolean;
  setIsChatConnected: (connected: boolean) => void;
  unreadSupportCount: number;
  setUnreadSupportCount: (count: number | ((prev: number) => number)) => void;
  selectedUserCnpj: string | null;
  setSelectedUserCnpj: (cnpj: string | null) => void;
  unreadPerUser: Record<string, number>;
  setUnreadPerUser: (cnpj: string, count: number | ((prev: number) => number)) => void;
  messages: any[];
  setMessages: (messages: any[] | ((prev: any[]) => any[])) => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  conversations: any[];
  setConversations: (conversations: any[]) => void;
  isChatLoading: boolean;
  setIsChatLoading: (loading: boolean) => void;

  announcements: Announcement[];
  setAnnouncements: (announcements: Announcement[]) => void;
  addAnnouncement: (announcement: Announcement) => void;
  deleteAnnouncement: (id: string) => void;
  isAnnouncementModalOpen: boolean;
  setAnnouncementModalOpen: (open: boolean) => void;
  seenAnnouncements: string[];
  setSeenAnnouncements: (ids: string[]) => void;

  encartes: EncarteSlot[];
  setEncartes: (encartes: EncarteSlot[]) => void;
  selectedEncarteModel: EncarteModel | null;
  setSelectedEncarteModel: (model: EncarteModel) => void;
  activeEncarteTab: EncarteTab;
  setActiveEncarteTab: (tab: EncarteTab) => void;
  encarteThemes: ThemeCategory[];
  setEncarteThemes: (themes: ThemeCategory[]) => void;
  encarteLogos: string[];
  setEncarteLogos: (logos: string[]) => void;
  encarteLayouts: string[];
  setEncarteLayouts: (layouts: string[]) => void;
  activeEncarteTheme: Theme | null;
  setActiveEncarteTheme: (theme: Theme | null) => void;
  activeEncarteLogo: string | null;
  setActiveEncarteLogo: (logo: string | null) => void;
  activeEncarteLayout: string | null;
  setActiveEncarteLayout: (layout: string | null) => void;

  login: (role: 'user' | 'admin', user: { username: string; cnpj: string; bandeira: string }) => void;
  logout: () => void;
  setSlotVisibility: (slot: 1 | 2 | 3, visible: boolean) => void;
  toggleEncarteAccess: (cnpj: string) => void;
  bulkUpdateStoreLayouts: (groupId: string, bandeira: string, allowedLayouts: number[]) => void;
}

let saveTimeout: NodeJS.Timeout | null = null;

const DEFAULT_TEXT = {
  fontSize: 40,
  color: '#000000',
  fontFamily: 'Inter',
  isBold: true,
  isItalic: false,
  x: 50,
  y: 50,
  width: 700,
  align: 'center' as const,
  visible: true,
};

export const THREE_PRODUCT_LAYOUTS = [
  'MARONBA',
  'QUARTA FRALDA PL',
  'SABADÃO PL',
  'QUI KIDS PL',
  'DERMO PL',
  'OFERTA 3',
  'COMBO 3',
  'MODELO 14',
  'MODELO 15',
  'MODELO 16',
  'MODELO 17',
  'MODELO 18',
  'MODELO 19',
  'MODELO 20',
  'MODELO 40',
  'PÁSCOA PL GF',
  'PADRÃO ULTRA'
];

export const isThreeProduct = (name: string, index?: number) => {
  const upperName = name.toUpperCase();
  const isModelInRange = index !== undefined && index >= 51 && index <= 149;
  const modelNumberMatch = upperName.match(/^MODELO (\d+)$/);
  const isModelNameInRange = modelNumberMatch ? (parseInt(modelNumberMatch[1]) >= 52 && parseInt(modelNumberMatch[1]) <= 150) : false;
  return THREE_PRODUCT_LAYOUTS.includes(upperName) ||
         upperName.includes(' 3') ||
         (index !== undefined && THREE_PRODUCT_LAYOUTS.includes(`MODELO ${index + 1}`)) ||
         isModelInRange ||
         isModelNameInRange;
};

export const createDefaultLayout = (name: string, index?: number): Layout => {
  const showThird = isThreeProduct(name, index);
  return {
    name,
    sortOrder: index ?? 0,
    hasThirdProduct: showThird,
    orientation: 'portrait',
    showSingleProductControl: false,
    showOptionalTextControl: false,
    background: { url: null, mode: 'cover', locked: false },
    productImage1: { url: null, x: 50, y: showThird ? 120 : 150, width: showThird ? 200 : 250, height: showThird ? 200 : 250, rotation: 0, opacity: 1, visible: true, locked: false },
    productImage2: { url: null, x: 50, y: showThird ? 780 : 650, width: showThird ? 200 : 250, height: showThird ? 200 : 250, rotation: 0, opacity: 1, visible: true, locked: false },
    productImage3: { url: null, x: 50, y: 450, width: 200, height: 200, rotation: 0, opacity: 1, visible: false, locked: false },
    textElements1: {
      name: { ...DEFAULT_TEXT, text: 'PRODUTO SUPERIOR', y: showThird ? 50 : 100, fontSize: showThird ? 40 : 50 },
      description: { ...DEFAULT_TEXT, text: 'Descrição do produto.', y: showThird ? 100 : 180, fontSize: 20, isBold: false },
      subtitle: { ...DEFAULT_TEXT, text: 'OFERTA', y: showThird ? 80 : 140, fontSize: 15 },
      price: { ...DEFAULT_TEXT, text: 'R$ 0,00', y: showThird ? 300 : 400, fontSize: showThird ? 80 : 100, color: '#e11d48' },
    },
    textElements2: {
      name: { ...DEFAULT_TEXT, text: 'PRODUTO INFERIOR', y: showThird ? 710 : 600, fontSize: showThird ? 40 : 50 },
      description: { ...DEFAULT_TEXT, text: 'Descrição do produto.', y: showThird ? 760 : 680, fontSize: 20, isBold: false },
      subtitle: { ...DEFAULT_TEXT, text: 'OFERTA', y: showThird ? 740 : 640, fontSize: 15 },
      price: { ...DEFAULT_TEXT, text: 'R$ 0,00', y: showThird ? 960 : 900, fontSize: showThird ? 80 : 100, color: '#e11d48' },
    },
    textElements3: {
      name: { ...DEFAULT_TEXT, text: 'PRODUTO CENTRAL', y: 380, fontSize: 40, visible: false },
      description: { ...DEFAULT_TEXT, text: 'Descrição do produto.', y: 430, fontSize: 20, isBold: false, visible: false },
      subtitle: { ...DEFAULT_TEXT, text: 'OFERTA', y: 410, fontSize: 15, visible: false },
      price: { ...DEFAULT_TEXT, text: 'R$ 0,00', y: 630, fontSize: 80, color: '#e11d48', visible: false },
    },
    optionalText1: { text: '', active: false, x: 50, y: 50, fontSize: 30, color: '#000000', isBold: true, isItalic: false, fontFamily: 'Inter' },
    optionalText2: { text: '', active: false, x: 50, y: 350, fontSize: 30, color: '#000000', isBold: true, isItalic: false, fontFamily: 'Inter' },
    optionalText3: { text: '', active: false, x: 50, y: 650, fontSize: 30, color: '#000000', isBold: true, isItalic: false, fontFamily: 'Inter' },
  };
};

const buildDefaultLayouts = () => {
  const named = [
    'QUARTA FRALDA PL', 'SABADÃO PL', 'QUI KIDS PL', 'DERMO PL', 'MARONBA',
  ];
  const result = named.map((n, i) => createDefaultLayout(n, i));
  for (let i = 5; i < 150; i++) {
    result.push(createDefaultLayout(`Modelo ${i + 1}`, i));
  }
  return result;
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),

      activeLayoutIndex: 0,
      orientation: 'portrait',
      optionalText1: { text: '', active: false, x: 50, y: 50, fontSize: 30, color: '#000000', isBold: true, isItalic: false, fontFamily: 'Inter' },
      optionalText2: { text: '', active: false, x: 50, y: 350, fontSize: 30, color: '#000000', isBold: true, isItalic: false, fontFamily: 'Inter' },
      optionalText3: { text: '', active: false, x: 50, y: 650, fontSize: 30, color: '#000000', isBold: true, isItalic: false, fontFamily: 'Inter' },
      layouts: buildDefaultLayouts(),

      background: { url: null, mode: 'cover', locked: false },
      productImage1: { url: null, x: 50, y: 150, width: 250, height: 250, rotation: 0, opacity: 1, visible: true, locked: false },
      productImage2: { url: null, x: 50, y: 650, width: 250, height: 250, rotation: 0, opacity: 1, visible: true, locked: false },
      productImage3: { url: null, x: 50, y: 400, width: 250, height: 250, rotation: 0, opacity: 1, visible: false, locked: false },

      textElements1: {
        name: { ...DEFAULT_TEXT, text: 'PRODUTO 1', y: 100, fontSize: 50 },
        description: { ...DEFAULT_TEXT, text: 'Descrição do produto 1.', y: 180, fontSize: 25, isBold: false },
        subtitle: { ...DEFAULT_TEXT, text: 'OFERTA ESPECIAL', y: 140, fontSize: 20 },
        price: { ...DEFAULT_TEXT, text: 'R$ 0,00', y: 400, fontSize: 100, color: '#e11d48' },
      },
      textElements2: {
        name: { ...DEFAULT_TEXT, text: 'PRODUTO 2', y: 600, fontSize: 50 },
        description: { ...DEFAULT_TEXT, text: 'Descrição do produto 2.', y: 680, fontSize: 25, isBold: false },
        subtitle: { ...DEFAULT_TEXT, text: 'OFERTA ESPECIAL', y: 640, fontSize: 20 },
        price: { ...DEFAULT_TEXT, text: 'R$ 0,00', y: 900, fontSize: 100, color: '#e11d48' },
      },
      textElements3: {
        name: { ...DEFAULT_TEXT, text: 'PRODUTO 3', y: 350, fontSize: 50, visible: false },
        description: { ...DEFAULT_TEXT, text: 'Descrição do produto 3.', y: 430, fontSize: 25, isBold: false, visible: false },
        subtitle: { ...DEFAULT_TEXT, text: 'OFERTA ESPECIAL', y: 390, fontSize: 20, visible: false },
        price: { ...DEFAULT_TEXT, text: 'R$ 0,00', y: 550, fontSize: 100, color: '#e11d48', visible: false },
      },

      setActiveLayout: (index) => {
        const state = get();
        if (index < 0 || !state.layouts[index]) return;
        const currentLayout: Layout = {
          ...state.layouts[state.activeLayoutIndex],
          name: state.layouts[state.activeLayoutIndex]?.name || `Modelo ${state.activeLayoutIndex + 1}`,
          orientation: state.orientation,
          background: state.background,
          productImage1: state.productImage1,
          productImage2: state.productImage2,
          productImage3: state.productImage3,
          textElements1: state.textElements1,
          textElements2: state.textElements2,
          textElements3: state.textElements3,
          optionalText1: state.optionalText1,
          optionalText2: state.optionalText2,
          optionalText3: state.optionalText3,
          isSingleProduct: state.isSingleProduct,
          showSingleProductControl: state.showSingleProductControl,
          showOptionalTextControl: state.showOptionalTextControl
        };
        const newLayouts = [...state.layouts];
        newLayouts[state.activeLayoutIndex] = currentLayout;
        const nextLayout = newLayouts[index];
        const defaultNext = createDefaultLayout(nextLayout.name, index);
        set({
          activeLayoutIndex: index,
          layouts: newLayouts,
          orientation: nextLayout.orientation || 'portrait',
          isSingleProduct: nextLayout.isSingleProduct !== undefined ? nextLayout.isSingleProduct : false,
          showSingleProductControl: nextLayout.showSingleProductControl !== undefined ? nextLayout.showSingleProductControl : false,
          showOptionalTextControl: nextLayout.showOptionalTextControl !== undefined ? nextLayout.showOptionalTextControl : true,
          background: nextLayout.background ? { ...defaultNext.background, ...nextLayout.background } : defaultNext.background,
          productImage1: nextLayout.productImage1 ? { ...defaultNext.productImage1, ...nextLayout.productImage1 } : defaultNext.productImage1,
          productImage2: nextLayout.productImage2 ? { ...defaultNext.productImage2, ...nextLayout.productImage2 } : defaultNext.productImage2,
          productImage3: nextLayout.productImage3 ? { ...defaultNext.productImage3, ...nextLayout.productImage3 } : defaultNext.productImage3,
          textElements1: nextLayout.textElements1 ? { ...defaultNext.textElements1, ...nextLayout.textElements1 } : defaultNext.textElements1,
          textElements2: nextLayout.textElements2 ? { ...defaultNext.textElements2, ...nextLayout.textElements2 } : defaultNext.textElements2,
          textElements3: nextLayout.textElements3 ? {
            name: { ...defaultNext.textElements3.name, ...nextLayout.textElements3.name },
            description: { ...defaultNext.textElements3.description, ...nextLayout.textElements3.description },
            subtitle: { ...defaultNext.textElements3.subtitle, ...nextLayout.textElements3.subtitle },
            price: { ...defaultNext.textElements3.price, ...nextLayout.textElements3.price },
          } : defaultNext.textElements3,
          optionalText1: nextLayout.optionalText1 ? { ...defaultNext.optionalText1, ...nextLayout.optionalText1 } : defaultNext.optionalText1,
          optionalText2: nextLayout.optionalText2 ? { ...defaultNext.optionalText2, ...nextLayout.optionalText2 } : defaultNext.optionalText2,
          optionalText3: nextLayout.optionalText3 ? { ...defaultNext.optionalText3, ...nextLayout.optionalText3 } : defaultNext.optionalText3,
        });
        if (get().userRole === 'admin') get().saveLayoutDebounced();
      },

      setLayoutOrientation: (index, orientation) => {
        set((state) => {
          const newLayouts = [...state.layouts];
          newLayouts[index] = { ...newLayouts[index], orientation };
          return { layouts: newLayouts, orientation: index === state.activeLayoutIndex ? orientation : state.orientation };
        });
        get().saveLayoutDebounced();
      },

      setLayoutName: (index, name) => {
        set((state) => {
          const newLayouts = [...state.layouts];
          newLayouts[index] = { ...newLayouts[index], name };
          return { layouts: newLayouts };
        });
        get().saveLayoutDebounced();
      },

      setLayoutBandeira: (index, bandeira) => {
        set((state) => {
          const newLayouts = [...state.layouts];
          newLayouts[index] = { ...newLayouts[index], bandeira };
          return { layouts: newLayouts };
        });
        get().saveLayoutDebounced();
      },

      setLayoutLocalidade: (index, localidade) => {
        set((state) => {
          const newLayouts = [...state.layouts];
          newLayouts[index] = { ...newLayouts[index], localidade };
          return { layouts: newLayouts };
        });
        get().saveLayoutDebounced();
      },

      reorderLayouts: (fromIndex, toIndex) => {
        set((state) => {
          const newLayouts = [...state.layouts];
          const [movedItem] = newLayouts.splice(fromIndex, 1);
          newLayouts.splice(toIndex, 0, movedItem);
          const updatedLayouts = newLayouts.map((l, i) => ({ ...l, sortOrder: i }));
          let newActiveIndex = state.activeLayoutIndex;
          if (state.activeLayoutIndex === fromIndex) newActiveIndex = toIndex;
          else if (fromIndex < state.activeLayoutIndex && toIndex >= state.activeLayoutIndex) newActiveIndex--;
          else if (fromIndex > state.activeLayoutIndex && toIndex <= state.activeLayoutIndex) newActiveIndex++;
          return { layouts: updatedLayouts, activeLayoutIndex: newActiveIndex };
        });
        get().saveLayoutDebounced();
      },

      setLayoutHasThirdProduct: (index, hasThirdProduct) => {
        set((state) => {
          const newLayouts = [...state.layouts];
          newLayouts[index] = { ...newLayouts[index], hasThirdProduct };
          return { layouts: newLayouts };
        });
        get().saveLayoutDebounced();
      },

      setElement: (slot, key, settings) => {
        const elementKey = slot === 1 ? 'textElements1' : slot === 2 ? 'textElements2' : 'textElements3';
        set((state) => {
          const newState = { [elementKey]: { ...state[elementKey], [key]: { ...state[elementKey][key], ...settings } } } as any;
          const newLayouts = [...state.layouts];
          if (newLayouts[state.activeLayoutIndex]) newLayouts[state.activeLayoutIndex] = { ...newLayouts[state.activeLayoutIndex], ...newState };
          return { ...newState, layouts: newLayouts };
        });
        get().saveLayoutDebounced();
      },

      setOptionalText: (slot, updates) => {
        const key = slot === 1 ? 'optionalText1' : slot === 2 ? 'optionalText2' : 'optionalText3';
        set((state) => {
          const newOptionalText = { ...state[key], ...updates };
          const newLayouts = [...state.layouts];
          if (newLayouts[state.activeLayoutIndex]) newLayouts[state.activeLayoutIndex] = { ...newLayouts[state.activeLayoutIndex], [key]: newOptionalText };
          return { [key]: newOptionalText, layouts: newLayouts };
        });
        if (get().userRole === 'admin') get().saveLayoutDebounced();
      },

      setProductImage: (slot, settings) => {
        const imageKey = slot === 1 ? 'productImage1' : slot === 2 ? 'productImage2' : 'productImage3';
        set((state) => {
          const newState = { [imageKey]: { ...state[imageKey], ...settings } } as any;
          const newLayouts = [...state.layouts];
          if (newLayouts[state.activeLayoutIndex]) newLayouts[state.activeLayoutIndex] = { ...newLayouts[state.activeLayoutIndex], ...newState };
          return { ...newState, layouts: newLayouts };
        });
        get().saveLayoutDebounced();
      },

      setBackground: (settings) => {
        set((state) => {
          const newState = { background: { ...state.background, ...settings } };
          const newLayouts = [...state.layouts];
          if (newLayouts[state.activeLayoutIndex]) newLayouts[state.activeLayoutIndex] = { ...newLayouts[state.activeLayoutIndex], ...newState };
          return { ...newState, layouts: newLayouts };
        });
        get().saveLayoutDebounced();
      },

      setSlotVisibility: (slot, visible) => {
        const imageKey = slot === 1 ? 'productImage1' : slot === 2 ? 'productImage2' : 'productImage3';
        const textKey = slot === 1 ? 'textElements1' : slot === 2 ? 'textElements2' : 'textElements3';
        set((state) => {
          const newState: any = {
            [imageKey]: { ...state[imageKey], visible },
            [textKey]: {
              name: { ...state[textKey].name, visible },
              description: { ...state[textKey].description, visible },
              subtitle: { ...state[textKey].subtitle, visible },
              price: { ...state[textKey].price, visible },
            }
          };
          const newLayouts = [...state.layouts];
          newLayouts[state.activeLayoutIndex] = { ...newLayouts[state.activeLayoutIndex], [imageKey]: newState[imageKey], [textKey]: newState[textKey] };
          return { ...newState, layouts: newLayouts };
        });
        get().saveLayoutDebounced();
      },

      products: [],
      isProductModalOpen: false,
      setProductModalOpen: (open) => set({ isProductModalOpen: open }),
      isUserModalOpen: false,
      setUserModalOpen: (open) => set({ isUserModalOpen: open }),
      isAnnouncementModalOpen: false,
      setAnnouncementModalOpen: (open) => set({ isAnnouncementModalOpen: open }),
      announcements: [],
      setAnnouncements: (announcements) => set({ announcements }),
      addAnnouncement: (announcement) => set((state) => {
        const newAnnouncements = [...state.announcements, announcement];
        setTimeout(() => get().saveUsersAndFlags(), 0);
        return { announcements: newAnnouncements };
      }),
      deleteAnnouncement: (id) => set((state) => {
        const newAnnouncements = state.announcements.filter(a => a.id !== id);
        setTimeout(() => get().saveUsersAndFlags(), 0);
        return { announcements: newAnnouncements };
      }),
      seenAnnouncements: [],
      setSeenAnnouncements: (ids) => set({ seenAnnouncements: ids }),

      // ── fetchProducts → /api/products ──────────────────────────────────────
      fetchProducts: async () => {
        try {
          let allProducts: Product[] = [];
          let offset = 0;
          const limit = 1000;
          while (true) {
            const data: Product[] = await apiGet(`/products?limit=${limit}&offset=${offset}&order=name`);
            if (!data || data.length === 0) break;
            allProducts = [...allProducts, ...data];
            if (data.length < limit) break;
            offset += limit;
          }
          set({ products: allProducts });
        } catch (error) {
          console.error('Error fetching products:', error);
        }
      },

      selectProduct: (slot, product) => {
        const elementKey = slot === 1 ? 'textElements1' : slot === 2 ? 'textElements2' : 'textElements3';
        const imageKey = slot === 1 ? 'productImage1' : slot === 2 ? 'productImage2' : 'productImage3';
        set((state) => {
          const newState = {
            [elementKey]: { ...state[elementKey], name: { ...state[elementKey].name, text: product.name }, description: { ...state[elementKey].description, text: product.description }, price: { ...state[elementKey].price, text: product.price } },
            [imageKey]: { ...state[imageKey], url: product.image }
          } as any;
          const newLayouts = [...state.layouts];
          if (newLayouts[state.activeLayoutIndex]) newLayouts[state.activeLayoutIndex] = { ...newLayouts[state.activeLayoutIndex], ...newState };
          return { ...newState, layouts: newLayouts };
        });
        get().saveLayout();
      },

      saveLayoutDebounced: () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => get().saveLayout(), 1000);
      },

      // ── saveLayout → /api/settings/current_layout ──────────────────────────
      saveLayout: async () => {
        const state = get();
        if (state.userRole !== 'admin') return;
        const timestamp = new Date().toISOString();
        const layout = {
          background: state.background,
          productImage1: state.productImage1,
          productImage2: state.productImage2,
          productImage3: state.productImage3,
          textElements1: state.textElements1,
          textElements2: state.textElements2,
          textElements3: state.textElements3,
          activeLayoutIndex: state.activeLayoutIndex,
          layouts: state.layouts,
          optionalText1: state.optionalText1,
          optionalText2: state.optionalText2,
          optionalText3: state.optionalText3,
          isSingleProduct: state.isSingleProduct,
          showSingleProductControl: state.showSingleProductControl,
          showOptionalTextControl: state.showOptionalTextControl,
          orientation: state.orientation,
          updated_at: timestamp
        };
        set({ lastUpdateTimestamp: timestamp });
        try {
          await apiPost('/settings/current_layout', { value: layout });
        } catch (error) {
          console.error('Error saving layout:', error);
        }
      },

      saveAll: async () => {
        const state = get();
        if (state.userRole !== 'admin') return;
        try {
          await Promise.all([state.saveLayout(), state.saveUsersAndFlags()]);
        } catch (error) {
          console.error('Error in saveAll:', error);
          throw error;
        }
      },

      // ── loadLayout → /api/settings/current_layout ──────────────────────────
      loadLayout: async () => {
        try {
          await get().loadUsersAndFlags();
          const data = await apiGet('/settings/current_layout');
          const layout = data?.value;
          if (!layout) return;

          const currentState = get();
          if (currentState.lastUpdateTimestamp && layout.updated_at && layout.updated_at <= currentState.lastUpdateTimestamp) return;

          let rawLayouts = layout.layouts || currentState.layouts;
          if (rawLayouts.length < 150) {
            const model75 = rawLayouts[74] || createDefaultLayout('Modelo 75', 74);
            const missing = Array.from({ length: 150 - rawLayouts.length }, (_, i) => {
              const idx = rawLayouts.length + i;
              return { ...model75, name: `Modelo ${idx + 1}`, sortOrder: idx, productImage3: { ...model75.productImage3, visible: false }, textElements3: { name: { ...model75.textElements3.name, visible: false }, description: { ...model75.textElements3.description, visible: false }, subtitle: { ...model75.textElements3.subtitle, visible: false }, price: { ...model75.textElements3.price, visible: false } } };
            });
            rawLayouts = [...rawLayouts, ...missing];
            if (currentState.userRole === 'admin') setTimeout(() => get().saveLayout(), 1000);
          }

          const loadedLayouts = rawLayouts.map((l: any, idx: number) => {
            const name = l.name || `Modelo ${idx + 1}`;
            const defaultL = createDefaultLayout(name, idx);
            return { ...defaultL, ...l, textElements1: l.textElements1 ? { ...defaultL.textElements1, ...l.textElements1 } : defaultL.textElements1, textElements2: l.textElements2 ? { ...defaultL.textElements2, ...l.textElements2 } : defaultL.textElements2, textElements3: l.textElements3 ? { ...defaultL.textElements3, ...l.textElements3 } : defaultL.textElements3 };
          }).sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

          const activeLayoutIndexFromDB = layout.activeLayoutIndex !== undefined ? layout.activeLayoutIndex : currentState.activeLayoutIndex;
          const activeLayoutIndex = currentState.userRole === 'admin' ? activeLayoutIndexFromDB : currentState.activeLayoutIndex;
          const activeLayout = loadedLayouts[activeLayoutIndex] || loadedLayouts[0];
          const isUser = currentState.userRole !== 'admin';

          set({
            activeLayoutIndex,
            layouts: loadedLayouts,
            background: isUser ? (currentState.background || activeLayout?.background) : (layout.background || activeLayout?.background),
            productImage1: isUser ? (currentState.productImage1 || activeLayout?.productImage1) : (layout.productImage1 || activeLayout?.productImage1),
            productImage2: isUser ? (currentState.productImage2 || activeLayout?.productImage2) : (layout.productImage2 || activeLayout?.productImage2),
            productImage3: isUser ? (currentState.productImage3 || activeLayout?.productImage3) : (layout.productImage3 || activeLayout?.productImage3),
            textElements1: isUser ? (currentState.textElements1 || activeLayout?.textElements1) : (layout.textElements1 || activeLayout?.textElements1),
            textElements2: isUser ? (currentState.textElements2 || activeLayout?.textElements2) : (layout.textElements2 || activeLayout?.textElements2),
            textElements3: isUser ? (currentState.textElements3 || activeLayout?.textElements3) : (layout.textElements3 || activeLayout?.textElements3),
            optionalText1: isUser ? (currentState.optionalText1 || activeLayout?.optionalText1) : (layout.optionalText1 || activeLayout?.optionalText1),
            optionalText2: isUser ? (currentState.optionalText2 || activeLayout?.optionalText2) : (layout.optionalText2 || activeLayout?.optionalText2),
            optionalText3: isUser ? (currentState.optionalText3 || activeLayout?.optionalText3) : (layout.optionalText3 || activeLayout?.optionalText3),
            orientation: isUser ? (currentState.orientation || activeLayout?.orientation) : (layout.orientation || activeLayout?.orientation),
            isSingleProduct: isUser ? (currentState.isSingleProduct ?? activeLayout?.isSingleProduct ?? false) : (activeLayout?.isSingleProduct ?? layout.isSingleProduct ?? false),
            showSingleProductControl: activeLayout?.showSingleProductControl !== undefined ? activeLayout.showSingleProductControl : (layout.showSingleProductControl !== undefined ? layout.showSingleProductControl : currentState.showSingleProductControl),
            showOptionalTextControl: activeLayout?.showOptionalTextControl !== undefined ? activeLayout.showOptionalTextControl : (layout.showOptionalTextControl !== undefined ? layout.showOptionalTextControl : currentState.showOptionalTextControl),
            lastUpdateTimestamp: layout.updated_at || null
          } as any);
        } catch (error) {
          console.error('Error loading layout:', error);
        }
      },

      zoom: 1,
      setZoom: (zoom) => set({ zoom }),
      selectedId: null,
      setSelectedId: (id) => set({ selectedId: id }),
      isPrinting: false,
      setPrinting: (isPrinting) => set({ isPrinting }),
      isSingleProduct: false,
      setSingleProduct: (isSingleProduct) => {
        set((state) => {
          const newLayouts = [...state.layouts];
          if (newLayouts[state.activeLayoutIndex]) newLayouts[state.activeLayoutIndex] = { ...newLayouts[state.activeLayoutIndex], isSingleProduct };
          return { isSingleProduct, layouts: newLayouts };
        });
        if (get().userRole === 'admin') get().saveLayoutDebounced();
      },
      showSingleProductControl: false,
      setShowSingleProductControl: (show) => {
        set((state) => {
          const newLayouts = [...state.layouts];
          if (newLayouts[state.activeLayoutIndex]) newLayouts[state.activeLayoutIndex] = { ...newLayouts[state.activeLayoutIndex], showSingleProductControl: show };
          return { showSingleProductControl: show, layouts: newLayouts };
        });
        if (get().userRole === 'admin') get().saveLayoutDebounced();
      },
      showOptionalTextControl: true,
      setShowOptionalTextControl: (show) => {
        set((state) => {
          const newLayouts = [...state.layouts];
          if (newLayouts[state.activeLayoutIndex]) newLayouts[state.activeLayoutIndex] = { ...newLayouts[state.activeLayoutIndex], showOptionalTextControl: show };
          return { showOptionalTextControl: show, layouts: newLayouts };
        });
        if (get().userRole === 'admin') get().saveLayoutDebounced();
      },
      toggleHasThirdProduct: () => {
        set((state) => {
          const newLayouts = [...state.layouts];
          const currentLayout = newLayouts[state.activeLayoutIndex];
          if (currentLayout) {
            const newValue = !currentLayout.hasThirdProduct;
            newLayouts[state.activeLayoutIndex] = { ...currentLayout, hasThirdProduct: newValue, productImage3: { ...currentLayout.productImage3, visible: newValue }, textElements3: { name: { ...currentLayout.textElements3.name, visible: newValue }, description: { ...currentLayout.textElements3.description, visible: newValue }, subtitle: { ...currentLayout.textElements3.subtitle, visible: newValue }, price: { ...currentLayout.textElements3.price, visible: newValue } } };
            return { layouts: newLayouts };
          }
          return state;
        });
        if (get().userRole === 'admin') get().saveLayoutDebounced();
      },

      printQueue: [],
      addToQueue: (imageData, isLandscape) => set((state) => ({ printQueue: [...state.printQueue, { imageData, isLandscape }] })),
      removeFromQueue: (index) => set((state) => ({ printQueue: state.printQueue.filter((_, i) => i !== index) })),
      clearQueue: () => set({ printQueue: [] }),
      currentView: 'editor',
      setView: (view) => set({ currentView: view }),
      realtimeInitialized: false,
      settingsRealtimeInitialized: false,
      lastUpdateTimestamp: null,

      flags: ['Ultra Popular', 'Maxi Popular', 'Entrefarma', 'Farmanorte', 'Outra'],
      addFlag: (flag) => set((state) => { const newState = { flags: state.flags.includes(flag) ? state.flags : [...state.flags, flag] }; setTimeout(() => get().saveUsersAndFlags(), 0); return newState; }),
      removeFlag: (flag) => set((state) => { const newState = { flags: state.flags.filter(f => f !== flag) }; setTimeout(() => get().saveUsersAndFlags(), 0); return newState; }),
      updateFlag: (oldFlag, newFlag) => set((state) => { const newState = { flags: state.flags.map(f => f === oldFlag ? newFlag : f) }; setTimeout(() => get().saveUsersAndFlags(), 0); return newState; }),

      userGroups: [],
      addUserGroup: (name) => set((state) => { const newState = { userGroups: [...state.userGroups, { id: crypto.randomUUID(), name }] }; setTimeout(() => get().saveUsersAndFlags(), 0); return newState; }),
      removeUserGroup: (id) => set((state) => { const newState = { userGroups: state.userGroups.filter(g => g.id !== id), allowedStores: state.allowedStores.map(s => s.groupId === id ? { ...s, groupId: undefined } : s) }; setTimeout(() => get().saveUsersAndFlags(), 0); return newState; }),
      updateUserGroup: (id, name) => set((state) => { const newState = { userGroups: state.userGroups.map(g => g.id === id ? { ...g, name } : g) }; setTimeout(() => get().saveUsersAndFlags(), 0); return newState; }),
      setUserGroup: (cnpj, groupId) => set((state) => { const nc = cnpj?.replace(/[^\d]/g, '') || ''; const newAllowedStores = state.allowedStores.map(s => s.cnpj?.replace(/[^\d]/g, '') === nc ? { ...s, groupId } : s); setTimeout(() => get().saveUsersAndFlags(), 0); return { allowedStores: newAllowedStores }; }),

      allowedStores: [],
      addAllowedStore: (store) => set((state) => {
        const nc = store.cnpj?.replace(/[^\d]/g, '') || '';
        const existingIndex = state.allowedStores.findIndex(s => s.cnpj?.replace(/[^\d]/g, '') === nc);
        const updatedStore = { ...store, cnpj: store.cnpj.trim(), allowedLayouts: store.allowedLayouts !== undefined ? store.allowedLayouts : (existingIndex !== -1 ? state.allowedStores[existingIndex].allowedLayouts : undefined), hasEncarteAccess: store.hasEncarteAccess !== undefined ? store.hasEncarteAccess : (existingIndex !== -1 ? state.allowedStores[existingIndex].hasEncarteAccess : false) };
        let newAllowedStores;
        if (existingIndex !== -1) { newAllowedStores = [...state.allowedStores]; newAllowedStores[existingIndex] = updatedStore; } else { newAllowedStores = [...state.allowedStores, updatedStore]; }
        setTimeout(() => get().saveUsersAndFlags(), 0);
        return { allowedStores: newAllowedStores };
      }),
      removeAllowedStore: (cnpj) => set((state) => { const nc = cnpj?.replace(/[^\d]/g, '') || ''; const newState = { allowedStores: state.allowedStores.filter(s => s.cnpj?.replace(/[^\d]/g, '') !== nc) }; setTimeout(() => get().saveUsersAndFlags(), 0); return newState; }),
      toggleEncarteAccess: (cnpj) => set((state) => { const nc = cnpj?.replace(/[^\d]/g, '') || ''; const newAllowedStores = state.allowedStores.map(s => s.cnpj?.replace(/[^\d]/g, '') === nc ? { ...s, hasEncarteAccess: !s.hasEncarteAccess } : s); setTimeout(() => get().saveUsersAndFlags(), 0); return { allowedStores: newAllowedStores }; }),
      toggleSuspension: (cnpj) => set((state) => { const nc = cnpj?.replace(/[^\d]/g, '') || ''; const newAllowedStores = state.allowedStores.map(s => s.cnpj?.replace(/[^\d]/g, '') === nc ? { ...s, isSuspended: !s.isSuspended } : s); setTimeout(() => get().saveUsersAndFlags(), 0); return { allowedStores: newAllowedStores }; }),
      bulkUpdateStoreLayouts: (groupId, bandeira, allowedLayouts) => set((state) => { const newAllowedStores = state.allowedStores.map(s => s.groupId === groupId && s.bandeira === bandeira ? { ...s, allowedLayouts } : s); setTimeout(() => get().saveUsersAndFlags(), 0); return { allowedStores: newAllowedStores }; }),

      // ── updateOnlineStatus → /api/activity/:cnpj ───────────────────────────
      updateOnlineStatus: async () => {
        const state = get();
        if (!state.isAuthenticated || state.userRole !== 'user' || !state.currentUser?.cnpj) return;
        try {
          const nc = state.currentUser.cnpj.replace(/[^\d]/g, '');
          set((s) => ({ allowedStores: s.allowedStores.map(store => store.cnpj?.replace(/[^\d]/g, '') === nc ? { ...store, isOnline: true, lastAccess: new Date().toISOString(), lastUsername: s.currentUser?.username } : store) }));
          await apiPost(`/activity/${nc}`, { isOnline: true, lastAccess: new Date().toISOString(), lastUsername: state.currentUser.username });
        } catch (error) {
          console.error('Error updating online status:', error);
        }
      },

      saveUsersAndFlagsDebounced: () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => get().saveUsersAndFlags(), 1000);
      },

      // ── saveUsersAndFlags → /api/settings/users_and_flags ──────────────────
      saveUsersAndFlags: async () => {
        const state = get();
        if (state.userRole !== 'admin') return;
        try {
          const cleanAllowedStores = state.allowedStores.map(({ isOnline, lastAccess, lastUsername, ...clean }) => clean);
          await apiPost('/settings/users_and_flags', {
            value: {
              allowedStores: cleanAllowedStores,
              flags: state.flags,
              userGroups: state.userGroups,
              encartes: state.encartes,
              selectedEncarteModel: state.selectedEncarteModel,
              encarteThemes: state.encarteThemes,
              encarteLogos: state.encarteLogos,
              encarteLayouts: state.encarteLayouts,
              announcements: state.announcements,
              seenAnnouncements: state.seenAnnouncements,
              theme: state.theme,
              activeEncarteTab: state.activeEncarteTab,
              isChatEnabled: state.isChatEnabled
            }
          });
        } catch (error) {
          console.error('Error saving users and flags:', error);
          throw error;
        }
      },

      // ── loadUsersAndFlags → /api/settings/users_and_flags + activity ───────
      loadUsersAndFlags: async () => {
        try {
          const [settingsData, activityData] = await Promise.all([
            apiGet('/settings/users_and_flags').catch(() => ({ value: {} })),
            apiGet('/settings/activity_status').catch(() => ({ value: {} }))
          ]);

          const settings = settingsData?.value || {};
          const activity = activityData?.value || {};
          const currentState = get();

          let mergedStores = settings.allowedStores || [];
          if (mergedStores.length > 0) {
            mergedStores = mergedStores.map((store: any) => {
              const nc = store.cnpj?.replace(/[^\d]/g, '') || '';
              const act = activity[nc];
              return act ? { ...store, isOnline: act.isOnline, lastAccess: act.lastAccess, lastUsername: act.lastUsername } : store;
            });
          }

          set({
            allowedStores: mergedStores,
            flags: settings.flags || currentState.flags,
            userGroups: settings.userGroups || [],
            encartes: settings.encartes || currentState.encartes,
            selectedEncarteModel: settings.selectedEncarteModel || currentState.selectedEncarteModel,
            encarteThemes: settings.encarteThemes || [],
            encarteLogos: settings.encarteLogos || [],
            encarteLayouts: settings.encarteLayouts || [],
            announcements: settings.announcements || [],
            seenAnnouncements: settings.seenAnnouncements || currentState.seenAnnouncements,
            theme: settings.theme || currentState.theme,
            activeEncarteTab: settings.activeEncarteTab || currentState.activeEncarteTab,
            isChatEnabled: settings.isChatEnabled !== undefined ? settings.isChatEnabled : true
          });
        } catch (error) {
          console.error('Error loading users and flags:', error);
        }
      },

      isAuthenticated: false,
      lastLoginTimestamp: null,
      userRole: null,
      currentUser: null,
      isSupportChatOpen: false,
      isChatEnabled: true,
      setSupportChatOpen: (open) => set({ isSupportChatOpen: open }),
      setIsChatEnabled: (isEnabled) => { set({ isChatEnabled: isEnabled }); get().saveUsersAndFlagsDebounced(); },
      isChatConnected: false,
      setIsChatConnected: (connected) => set({ isChatConnected: connected }),
      unreadSupportCount: 0,
      setUnreadSupportCount: (count) => set((state) => ({ unreadSupportCount: typeof count === 'function' ? count(state.unreadSupportCount) : count })),
      selectedUserCnpj: null,
      setSelectedUserCnpj: (cnpj) => set({ selectedUserCnpj: cnpj }),
      unreadPerUser: {},
      setUnreadPerUser: (cnpj, count) => set((state) => { const current = state.unreadPerUser[cnpj] || 0; const newCount = typeof count === 'function' ? count(current) : count; return { unreadPerUser: { ...state.unreadPerUser, [cnpj]: newCount } }; }),
      messages: [],
      setMessages: (messages) => set((state) => ({ messages: typeof messages === 'function' ? messages(state.messages) : messages })),
      activeConversationId: null,
      setActiveConversationId: (id) => set({ activeConversationId: id }),
      conversations: [],
      setConversations: (conversations) => set({ conversations }),
      isChatLoading: false,
      setIsChatLoading: (loading) => set({ isChatLoading: loading }),

      encartes: Array(10).fill(null).map((_, i) => ({ name: `Modelo ${i + 1}`, frontBgUrl: '', backBgUrl: '', frontProducts: Array(12).fill(null), backProducts: Array(12).fill(null), productCount: 12, extraProducts: [null, null] })),
      setEncartes: (encartes) => { set({ encartes }); get().saveUsersAndFlagsDebounced(); },
      selectedEncarteModel: null,
      setSelectedEncarteModel: (model) => { set({ selectedEncarteModel: model }); get().saveUsersAndFlagsDebounced(); },
      activeEncarteTab: 'themes',
      setActiveEncarteTab: (tab) => set({ activeEncarteTab: tab }),
      encarteThemes: [],
      setEncarteThemes: (themes) => { set({ encarteThemes: themes }); get().saveUsersAndFlagsDebounced(); },
      encarteLogos: [],
      setEncarteLogos: (logos) => { set({ encarteLogos: logos }); get().saveUsersAndFlagsDebounced(); },
      encarteLayouts: [],
      setEncarteLayouts: (layouts) => { set({ encarteLayouts: layouts }); get().saveUsersAndFlagsDebounced(); },
      activeEncarteTheme: null,
      setActiveEncarteTheme: (theme) => set({ activeEncarteTheme: theme }),
      activeEncarteLogo: null,
      setActiveEncarteLogo: (logo) => set({ activeEncarteLogo: logo }),
      activeEncarteLayout: null,
      setActiveEncarteLayout: (layout) => set({ activeEncarteLayout: layout }),

      // ── login ───────────────────────────────────────────────────────────────
      login: async (role, user) => {
        await get().loadUsersAndFlags();
        set({ isAuthenticated: true, userRole: role, currentUser: user, lastLoginTimestamp: Date.now() });
        if (role === 'user' && user.cnpj) {
          const nc = user.cnpj.replace(/[^\d]/g, '');
          set((state) => ({ allowedStores: state.allowedStores.map(s => s.cnpj.replace(/[^\d]/g, '') === nc ? { ...s, isOnline: true, lastAccess: new Date().toISOString(), lastUsername: user.username } : s) }));
          try {
            await apiPost(`/activity/${nc}`, { isOnline: true, lastAccess: new Date().toISOString(), lastUsername: user.username });
          } catch (err) {
            console.error('Error setting activity on login:', err);
          }
        }
        await get().loadLayout();
        await get().fetchProducts();
      },

      // ── logout ──────────────────────────────────────────────────────────────
      logout: async () => {
        const state = get();
        if (state.userRole === 'user' && state.currentUser?.cnpj) {
          try {
            const nc = state.currentUser.cnpj.replace(/[^\d]/g, '');
            await apiPost(`/activity/${nc}`, { isOnline: false });
          } catch (error) {
            console.error('Error during logout activity update:', error);
          }
        }
        set({ isAuthenticated: false, userRole: null, currentUser: null, lastLoginTimestamp: null });
      },
    }),
    {
      name: 'smartprice-storage',
      partialize: (state) => ({
        theme: state.theme,
        background: state.background,
        productImage1: state.productImage1,
        productImage2: state.productImage2,
        productImage3: state.productImage3,
        textElements1: state.textElements1,
        textElements2: state.textElements2,
        textElements3: state.textElements3,
        activeLayoutIndex: state.activeLayoutIndex,
        layouts: state.layouts,
        zoom: state.zoom,
        allowedStores: state.allowedStores,
        flags: state.flags,
        userGroups: state.userGroups,
        isAuthenticated: state.isAuthenticated,
        lastLoginTimestamp: state.lastLoginTimestamp,
        userRole: state.userRole,
        currentUser: state.currentUser,
        currentView: state.currentView,
        encartes: state.encartes,
        selectedEncarteModel: state.selectedEncarteModel,
        encarteThemes: state.encarteThemes,
        encarteLogos: state.encarteLogos,
        encarteLayouts: state.encarteLayouts,
        announcements: state.announcements,
        seenAnnouncements: state.seenAnnouncements,
        isSingleProduct: state.isSingleProduct,
        showSingleProductControl: state.showSingleProductControl,
        showOptionalTextControl: state.showOptionalTextControl,
        unreadSupportCount: state.unreadSupportCount,
        unreadPerUser: state.unreadPerUser,
        isChatEnabled: state.isChatEnabled,
      }),
    }
  )
);
