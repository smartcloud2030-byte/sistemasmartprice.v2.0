import { carregarArmazenamento } from './lib/armazenamentoLocal';

// Lê o estado salvo (IndexedDB) antes de criar o store: o zustand hidrata na
// criação e o App conta com a sessão já carregada no primeiro render.
carregarArmazenamento(['smartprice-storage']).finally(() => import('./iniciar'));
