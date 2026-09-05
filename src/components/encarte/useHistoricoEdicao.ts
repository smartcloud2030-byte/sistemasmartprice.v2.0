import { useCallback, useRef, useState } from 'react';

interface EstadoHistorico<T> {
  passado: T[];
  presente: T;
  futuro: T[];
}

export interface OpcoesSet {
  /**
   * Quando várias mudanças seguidas compartilham a mesma chave e caem dentro
   * da janela de tempo (um arraste, um slider, o seletor de cor), elas viram
   * UM passo só de desfazer: a primeira registra o ponto anterior, as
   * seguintes só movem o presente.
   */
  coalesce?: string;
  /** Só atualiza o presente, sem registrar nada no histórico. */
  semHistorico?: boolean;
}

const LIMITE = 80;
const JANELA_COALESCE_MS = 700;

/**
 * Histórico de edição genérico (undo/redo) sobre um único objeto de estado.
 * O `set` funciona como um `setState` normal (valor ou função), e por padrão
 * cada chamada vira um passo de desfazer — use `coalesce` pra agrupar uma
 * rajada de mudanças (arraste, slider) num passo só.
 */
export function useHistoricoEdicao<T>(inicial: T | (() => T)) {
  const [estado, setEstado] = useState<EstadoHistorico<T>>(() => ({
    passado: [],
    presente: typeof inicial === 'function' ? (inicial as () => T)() : inicial,
    futuro: [],
  }));

  const coalesceRef = useRef<{ chave: string; ts: number } | null>(null);

  const set = useCallback((prox: T | ((atual: T) => T), opcoes?: OpcoesSet) => {
    setEstado((s) => {
      const valor = typeof prox === 'function' ? (prox as (a: T) => T)(s.presente) : prox;
      if (Object.is(valor, s.presente)) return s;

      if (opcoes?.semHistorico) return { ...s, presente: valor };

      const agora = Date.now();
      const chave = opcoes?.coalesce;
      const juntar =
        !!chave &&
        coalesceRef.current?.chave === chave &&
        agora - (coalesceRef.current?.ts ?? 0) < JANELA_COALESCE_MS;

      coalesceRef.current = chave ? { chave, ts: agora } : null;

      if (juntar) {
        // mesma rajada: não empilha passo novo, só move o presente
        return { passado: s.passado, presente: valor, futuro: [] };
      }
      return {
        passado: [...s.passado, s.presente].slice(-LIMITE),
        presente: valor,
        futuro: [],
      };
    });
  }, []);

  /** Troca o estado inteiro e zera o histórico (carregar rascunho, abrir do histórico). */
  const resetar = useCallback((valor: T) => {
    coalesceRef.current = null;
    setEstado({ passado: [], presente: valor, futuro: [] });
  }, []);

  const desfazer = useCallback(() => {
    coalesceRef.current = null;
    setEstado((s) => {
      if (!s.passado.length) return s;
      const anterior = s.passado[s.passado.length - 1];
      return {
        passado: s.passado.slice(0, -1),
        presente: anterior,
        futuro: [s.presente, ...s.futuro].slice(0, LIMITE),
      };
    });
  }, []);

  const refazer = useCallback(() => {
    coalesceRef.current = null;
    setEstado((s) => {
      if (!s.futuro.length) return s;
      const proximo = s.futuro[0];
      return {
        passado: [...s.passado, s.presente].slice(-LIMITE),
        presente: proximo,
        futuro: s.futuro.slice(1),
      };
    });
  }, []);

  return {
    presente: estado.presente,
    set,
    resetar,
    desfazer,
    refazer,
    podeDesfazer: estado.passado.length > 0,
    podeRefazer: estado.futuro.length > 0,
  };
}
