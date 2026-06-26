// ─────────────────────────────────────────
// supabase.ts — Cliente próprio
// Substitui o @supabase/supabase-js
// Todas as chamadas vão para a API local
// ─────────────────────────────────────────

const API_URL = '/api';
const API_TOKEN = import.meta.env.VITE_API_SECRET || '';

async function request(method: string, path: string, body?: any) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-token': API_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) return { data: null, error: { message: data.error || 'Erro desconhecido', code: res.status.toString() } };
  return { data: data.data ?? data, error: null };
}

// ── Simulação da interface do Supabase ────
function from(table: string) {
  let _filters: string[] = [];
  let _params: Record<string, any> = {};
  let _order: string | null = null;
  let _range: [number, number] | null = null;
  let _single = false;
  let _countOnly = false;
  let _select = '*';
  let _id: string | number | null = null;

  const builder = {
    select(cols = '*', opts?: { count?: string; head?: boolean }) {
      _select = cols;
      if (opts?.count) _countOnly = opts.head || false;
      return builder;
    },
    eq(col: string, val: any) {
      if (col === 'id') _id = val;
      else _params[col] = val;
      return builder;
    },
    ilike(col: string, val: string) {
      _params['search'] = val.replace(/%/g, '');
      return builder;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      _order = col;
      return builder;
    },
    range(from: number, to: number) {
      _range = [from, to];
      return builder;
    },
    limit(n: number) {
      _params['limit'] = n;
      return builder;
    },
    lt(col: string, val: any) {
      _params['lt_' + col] = val;
      return builder;
    },
    or(filter: string) {
      _filters.push(filter);
      return builder;
    },
    single() {
      _single = true;
      return builder;
    },
    async then(resolve: Function) {
      const result = await builder.execute();
      resolve(result);
      return result;
    },
    async execute() {
      // COUNT only
      if (_countOnly) {
        const res = await fetch(`${API_URL}/${table}/count`, { headers: { 'x-api-token': API_TOKEN } });
        const d = await res.json();
        return { count: d.count, data: null, error: null };
      }

      // GET by ID
      if (_id !== null) {
        return request('GET', `/${table}/${_id}`);
      }

      // GET list
      const qs = new URLSearchParams();
      Object.entries(_params).forEach(([k, v]) => qs.set(k, String(v)));
      if (_range) { qs.set('offset', String(_range[0])); qs.set('limit', String(_range[1] - _range[0] + 1)); }

      const res = await fetch(`${API_URL}/${table}?${qs}`, { headers: { 'x-api-token': API_TOKEN } });
      const d = await res.json();

      if (!res.ok) return { data: null, error: { message: d.error, code: res.status.toString() } };

      const rows = d.data || d;
      if (_single) {
        return rows.length > 0
          ? { data: rows[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
      }
      return { data: rows, error: null };
    },

    // INSERT
    async insert(payload: any | any[]) {
      const isArray = Array.isArray(payload);
      if (isArray) return request('POST', `/${table}/bulk`, payload);
      return request('POST', `/${table}`, payload);
    },

    // UPDATE
    async update(payload: any) {
      return {
        eq: (col: string, val: any) => request('PUT', `/${table}/${val}`, payload)
      };
    },

    // UPSERT
    async upsert(payload: any) {
      if (table === 'settings') {
        return request('POST', `/settings/${payload.id}`, { value: payload.value });
      }
      return request('POST', `/${table}`, payload);
    },

    // DELETE
    delete() {
      return {
        eq: (col: string, val: any) => request('DELETE', `/${table}/${val}`),
        lt: (col: string, val: any) => request('DELETE', `/${table}?lt_${col}=${val}`),
        or: (filter: string) => request('DELETE', `/${table}?filter=${filter}`),
      };
    },
  };

  return builder;
}

// ── Channel fake (sem realtime por enquanto) ──
function channel(name: string) {
  return {
    on: () => ({ subscribe: (cb: Function) => { cb('SUBSCRIBED'); return {}; } }),
    subscribe: (cb: Function) => { cb('SUBSCRIBED'); return {}; },
  };
}

export const supabase = { from, channel };
export const isSupabaseConfigured = true;
