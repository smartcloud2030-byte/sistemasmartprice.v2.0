# Cosmos — Indicador de Cota Diária Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar quantas das 25 consultas diárias gratuitas à API da Cosmos Bluesoft já foram usadas, em dois lugares: um badge compacto no cadastro de produto e um card com barra de progresso no AdminDashboard.

**Architecture:** O backend conta cada chamada real à Cosmos num upsert atômico na tabela `settings` (chave `cosmos_usage_daily`, valor `{date, count}`, resetando sozinho quando a data em `America/Sao_Paulo` muda). O frontend só lê essa mesma linha via o endpoint genérico `GET /api/settings/:id` que já existe — nenhum endpoint novo. Lógica pura (data no fuso de Brasília, threshold de cor) fica isolada em `src/lib/cosmosUsage.ts`, compartilhada pelos dois componentes visuais.

**Tech Stack:** Express + `pg` (Postgres) no backend, React + Tailwind no frontend, testes com `node:assert` via `tsx` (mesmo padrão de `src/lib/monitoringStatus.test.ts`).

## Global Constraints

- Cota: 25 consultas/dia (`COSMOS_DAILY_LIMIT = 25`), reset à meia-noite em `America/Sao_Paulo`.
- Conta apenas chamadas que efetivamente saem pro servidor da Cosmos e recebem resposta (200, 404, ou erro HTTP dela) — não conta exceções de rede/timeout nem buscas bloqueadas antes por duplicidade local.
- Não bloqueia a busca por código de barras quando a cota esgota — só exibe aviso visual.
- Sem endpoint novo de leitura — reaproveita `GET /api/settings/:id` já existente em `api.ts`.
- Sem tabela nova — reaproveita `settings` (já existe em `migration.sql:20-24`).

---

### Task 1: Módulo compartilhado `cosmosUsage.ts`

**Files:**
- Create: `src/lib/cosmosUsage.ts`
- Test: `src/lib/cosmosUsage.test.ts`
- Modify: `package.json:8` (adicionar o novo test ao script `test`)

**Interfaces:**
- Produces: `COSMOS_DAILY_LIMIT: number`, `getBrazilDateString(date?: Date): string`, `getUsageState(count: number, limit?: number): 'ok' | 'warning' | 'critical'`, tipo `CosmosUsageState`.

- [ ] **Step 1: Escrever o teste (vai falhar — o módulo ainda não existe)**

Criar `src/lib/cosmosUsage.test.ts`:

```ts
import assert from 'node:assert';
import { getBrazilDateString, getUsageState, COSMOS_DAILY_LIMIT } from './cosmosUsage';

function dataConvertidaParaHorarioDeBrasilia() {
  // 02:30 UTC = 23:30 do dia anterior em Brasilia (UTC-3, sem horario de verao)
  assert.strictEqual(getBrazilDateString(new Date('2026-08-12T02:30:00Z')), '2026-08-11');
  // 12:00 UTC = 09:00 em Brasilia, mesmo dia
  assert.strictEqual(getBrazilDateString(new Date('2026-08-12T12:00:00Z')), '2026-08-12');
}

function estadoOkAteSetentaPorCentoDaCota() {
  assert.strictEqual(getUsageState(0, COSMOS_DAILY_LIMIT), 'ok');
  assert.strictEqual(getUsageState(17, COSMOS_DAILY_LIMIT), 'ok');
}

function estadoAlertaEntreSetentaENoventaENovePorCento() {
  assert.strictEqual(getUsageState(18, COSMOS_DAILY_LIMIT), 'warning');
  assert.strictEqual(getUsageState(24, COSMOS_DAILY_LIMIT), 'warning');
}

function estadoCriticoNoLimiteOuAcima() {
  assert.strictEqual(getUsageState(25, COSMOS_DAILY_LIMIT), 'critical');
  assert.strictEqual(getUsageState(30, COSMOS_DAILY_LIMIT), 'critical');
}

try {
  dataConvertidaParaHorarioDeBrasilia();
  estadoOkAteSetentaPorCentoDaCota();
  estadoAlertaEntreSetentaENoventaENovePorCento();
  estadoCriticoNoLimiteOuAcima();
  console.log('PASS: todos os testes de cosmosUsage passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx src/lib/cosmosUsage.test.ts`
Expected: erro do tipo `Cannot find module './cosmosUsage'`

- [ ] **Step 3: Implementar o módulo**

Criar `src/lib/cosmosUsage.ts`:

```ts
export const COSMOS_DAILY_LIMIT = 25;

export type CosmosUsageState = 'ok' | 'warning' | 'critical';

// A cota da Cosmos zera à meia-noite de Brasília, não UTC — a chave do
// contador precisa ser calculada em America/Sao_Paulo, senão o reset
// acontece 3h adiantado ou atrasado dependendo de onde a VPS roda.
export function getBrazilDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function getUsageState(count: number, limit: number = COSMOS_DAILY_LIMIT): CosmosUsageState {
  if (count >= limit) return 'critical';
  if (count / limit > 0.7) return 'warning';
  return 'ok';
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx src/lib/cosmosUsage.test.ts`
Expected: `PASS: todos os testes de cosmosUsage passaram`

- [ ] **Step 5: Adicionar ao script `test` do `package.json`**

Em `package.json:8`, no final da cadeia existente, adicionar ` && tsx src/lib/cosmosUsage.test.ts` (mesmo padrão dos outros `.test.ts` já encadeados na mesma linha).

- [ ] **Step 6: Rodar o script completo de testes**

Run: `npm test`
Expected: todos os testes existentes continuam passando, incluindo a nova linha `PASS: todos os testes de cosmosUsage passaram`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cosmosUsage.ts src/lib/cosmosUsage.test.ts package.json
git commit -m "feat: adiciona logica compartilhada de cota diaria da Cosmos"
```

---

### Task 2: Contagem no backend (`api.ts`)

**Files:**
- Modify: `api.ts:1-10` (import novo)
- Modify: `api.ts:160-193` (handler de `/barcode-lookup/:gtin`)

**Interfaces:**
- Consumes: `getBrazilDateString` de `./src/lib/cosmosUsage` (Task 1), `pool` já existente em `api.ts:14-22`.
- Produces: linha `settings.id = 'cosmos_usage_daily'` com `value = { date: string, count: number }`, atualizada a cada consulta real à Cosmos. Consumida pelas Tasks 3 e 4 via `GET /api/settings/cosmos_usage_daily`.

Não há suíte de testes de rota HTTP neste projeto (nenhum `supertest`/equivalente — as rotas de `api.ts`/`monitoring.ts` não têm testes automatizados, só a lógica pura em `src/lib/*.test.ts`). A verificação desta task é manual, via `psql`/`curl` contra o Postgres local, seguindo o mesmo padrão de confiança do resto do arquivo.

- [ ] **Step 1: Importar o helper de data**

Em `api.ts`, logo abaixo da linha 10 (`import { minioClient, BUCKET } from './src/gallery';`):

```ts
import { getBrazilDateString } from './src/lib/cosmosUsage';
```

- [ ] **Step 2: Adicionar a função de registro de uso**

Em `api.ts`, imediatamente antes da rota `router.get('/barcode-lookup/:gtin', ...)` (linha 160), adicionar:

```ts
// Registra uma consulta real à Cosmos no contador diário (tabela settings,
// chave 'cosmos_usage_daily'). Upsert atomico numa query so — evita
// race condition sem precisar de transacao/lock explicito. O CASE dentro
// do UPDATE reseta o contador sozinho quando a data muda, sem job/cron.
async function registerCosmosUsage() {
  const today = getBrazilDateString();
  await pool.query(
    `INSERT INTO settings (id, value, updated_at)
     VALUES ('cosmos_usage_daily', jsonb_build_object('date', $1::text, 'count', 1), NOW())
     ON CONFLICT (id) DO UPDATE SET
       value = CASE
         WHEN settings.value->>'date' = $1 THEN jsonb_set(settings.value, '{count}', to_jsonb(((settings.value->>'count')::int) + 1))
         ELSE jsonb_build_object('date', $1::text, 'count', 1)
       END,
       updated_at = NOW()`,
    [today]
  );
}
```

- [ ] **Step 3: Chamar o registro logo após receber resposta da Cosmos**

Em `api.ts:174` (logo após `clearTimeout(timeout);` dentro do handler de `/barcode-lookup/:gtin`, antes dos `if (r.status === 404)`/`if (!r.ok)`), inserir a chamada. O trecho completo do handler fica:

```ts
router.get('/barcode-lookup/:gtin', apiAuth, async (req: Request, res: Response) => {
  const token = process.env.COSMOS_API_TOKEN;
  if (!token) return res.status(501).json({ error: 'COSMOS_API_TOKEN não configurado no servidor' });

  const gtin = req.params.gtin.replace(/\D/g, '');
  if (!gtin) return res.status(400).json({ error: 'Código de barras inválido' });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${gtin}.json`, {
      headers: { 'X-Cosmos-Token': token, 'User-Agent': 'SmartPrice (suporte@sistemasmartprice.com.br)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // Conta a partir daqui — a Cosmos respondeu (sucesso, 404 ou erro dela),
    // e isso é o que consome a cota diária, não só as buscas com resultado.
    await registerCosmosUsage();

    if (r.status === 404) return res.status(404).json({ error: 'Produto não encontrado na base Cosmos' });
    if (!r.ok) return res.status(r.status).json({ error: `Cosmos retornou HTTP ${r.status}` });

    const json: any = await r.json();
    res.json({
      gtin: json.gtin,
      description: json.description || null,
      brand: json.brand?.name || null,
      thumbnail: json.thumbnail ? `/api/barcode-image/${gtin}` : null,
      ncm: json.ncm?.description || null,
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Falha ao consultar a Cosmos' });
  }
});
```

(O comentário original sobre o proxy de thumbnail, linhas 184-186 do arquivo atual, continua igual — só a chamada de `registerCosmosUsage()` é nova.)

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 5: Verificação manual end-to-end**

Precisa do Postgres local rodando (`docker compose up -d postgres` ou equivalente já configurado no projeto) e das variáveis `COSMOS_API_TOKEN`/`API_SECRET`/`DB_*` no `.env`.

```bash
npm run dev
# em outro terminal, com o servidor no ar:
curl -H "x-api-token: $API_SECRET" http://localhost:3000/api/barcode-lookup/7891000315507
curl -H "x-api-token: $API_SECRET" http://localhost:3000/api/settings/cosmos_usage_daily
```

Expected: a segunda chamada retorna `{"value":{"date":"AAAA-MM-DD","count":1}}` com a data de hoje em Brasília. Repetindo a primeira chamada, `count` incrementa; chamando de novo no dia seguinte, `count` volta pra 1.

- [ ] **Step 6: Commit**

```bash
git add api.ts
git commit -m "feat: conta consultas diarias a Cosmos na tabela settings"
```

---

### Task 3: Badge compacto no cadastro de produto (`ProductManager.tsx`)

**Files:**
- Modify: `src/components/ProductManager.tsx:1-9` (imports)
- Modify: `src/components/ProductManager.tsx:112-163` (estado + `lookupBarcode`)
- Modify: `src/components/ProductManager.tsx:525-541` (JSX do campo de código de barras)

**Interfaces:**
- Consumes: `getUsageState`, `COSMOS_DAILY_LIMIT`, tipo `CosmosUsageState` de `../lib/cosmosUsage` (Task 1); endpoint `GET /api/settings/cosmos_usage_daily` (Task 2).

- [ ] **Step 1: Ajustar os imports**

Em `src/components/ProductManager.tsx:5`, trocar:

```ts
import { isValidImageUrl, getProxyUrl } from '../lib/utils';
```

por:

```ts
import { isValidImageUrl, getProxyUrl, cn } from '../lib/utils';
```

E logo abaixo do import de `duplicateProductMatch` (linha 3), adicionar:

```ts
import { getUsageState, COSMOS_DAILY_LIMIT, CosmosUsageState } from '../lib/cosmosUsage';
```

Logo após `CATEGORY_COLORS` (linha 29-36), no mesmo estilo de mapa top-level, adicionar:

```ts
const COSMOS_BADGE_COLOR: Record<CosmosUsageState, string> = {
  ok: 'text-zinc-400',
  warning: 'text-amber-500',
  critical: 'text-red-500',
};
```

- [ ] **Step 2: Adicionar estado e função de busca do uso**

Em `src/components/ProductManager.tsx:112` (logo após `const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false);`), adicionar:

```ts
  const [cosmosUsage, setCosmosUsage] = useState<{ date: string; count: number } | null>(null);

  const fetchCosmosUsage = async () => {
    try {
      const res = await fetch('/api/settings/cosmos_usage_daily', { headers: { 'x-api-token': API_SECRET } });
      const json = await res.json();
      setCosmosUsage(json?.value || null);
    } catch {
      // indicador é informativo — se falhar, so nao mostra nada, sem toast de erro
    }
  };

  useEffect(() => { fetchCosmosUsage(); }, []);
```

- [ ] **Step 3: Atualizar o uso depois de cada busca**

Em `src/components/ProductManager.tsx:160-162`, dentro do `finally` do `lookupBarcode`, trocar:

```ts
    } finally {
      setIsLookingUpBarcode(false);
    }
```

por:

```ts
    } finally {
      setIsLookingUpBarcode(false);
      fetchCosmosUsage();
    }
```

- [ ] **Step 4: Renderizar o badge**

Em `src/components/ProductManager.tsx`, logo abaixo do `</div>` que fecha o grid de código de barras (linha 540, antes do `</div>` que fecha o bloco "Identificação" na linha 541), adicionar:

```tsx
                  {cosmosUsage && (
                    <p className={cn('text-[10px] font-bold', COSMOS_BADGE_COLOR[getUsageState(cosmosUsage.count, COSMOS_DAILY_LIMIT)])}>
                      Cosmos: {cosmosUsage.count}/{COSMOS_DAILY_LIMIT} consultas hoje
                    </p>
                  )}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Verificação manual**

```bash
npm run dev
```

Abrir o cadastro de produto no navegador, bipar/digitar um código de barras válido, confirmar que o texto "Cosmos: N/25 consultas hoje" aparece abaixo dos campos de código de barras e o número sobe a cada busca.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProductManager.tsx
git commit -m "feat: mostra cota diaria da Cosmos no cadastro de produto"
```

---

### Task 4: Card no AdminDashboard (`CosmosUsageStatus.tsx`)

**Files:**
- Create: `src/components/CosmosUsageStatus.tsx`
- Modify: `src/components/AdminDashboard.tsx:11` (import)
- Modify: `src/components/AdminDashboard.tsx:230-233` (render)

**Interfaces:**
- Consumes: `getUsageState`, `COSMOS_DAILY_LIMIT`, tipo `CosmosUsageState` de `../lib/cosmosUsage` (Task 1); endpoint `GET /api/settings/cosmos_usage_daily` (Task 2); `cn` de `../lib/utils` (já usado no arquivo).

- [ ] **Step 1: Criar o componente**

Criar `src/components/CosmosUsageStatus.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Barcode, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { getUsageState, COSMOS_DAILY_LIMIT, CosmosUsageState } from '../lib/cosmosUsage';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';

interface CosmosUsageValue {
  date: string;
  count: number;
}

const CosmosUsageStatus: React.FC = () => {
  const [data, setData] = useState<CosmosUsageValue | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const res = await fetch('/api/settings/cosmos_usage_daily', { headers: { 'x-api-token': API_SECRET } });
        const json = await res.json();
        setData(json?.value || null);
      } catch (e) {
        console.error('Erro ao carregar uso da Cosmos:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsage();
    const interval = setInterval(fetchUsage, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-sm text-zinc-400">
        Carregando uso da Cosmos...
      </div>
    );
  }

  const count = data?.count ?? 0;
  const state = getUsageState(count, COSMOS_DAILY_LIMIT);

  const config: Record<CosmosUsageState, { icon: React.ElementType; color: string; bg: string; bar: string; label: string }> = {
    ok: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', bar: 'bg-emerald-500', label: 'Cota tranquila' },
    warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', bar: 'bg-amber-500', label: 'Perto do limite' },
    critical: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', bar: 'bg-red-500', label: 'Cota esgotada' },
  };
  const { icon: Icon, color, bg, bar, label } = config[state];
  const percent = Math.min((count / COSMOS_DAILY_LIMIT) * 100, 100);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', bg)}>
        <Icon className={cn('w-5 h-5', color)} />
      </div>
      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2">
          <Barcode className="w-3.5 h-3.5 text-zinc-400" />
          <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Consultas de código de barras (Cosmos)</p>
        </div>
        <p className={cn('text-sm font-bold mt-0.5', color)}>{label} — {count}/{COSMOS_DAILY_LIMIT} hoje</p>
        <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 mt-2">
          <div className={cn('h-1.5 rounded-full transition-all', bar)} style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
};

export default CosmosUsageStatus;
```

- [ ] **Step 2: Importar no AdminDashboard**

Em `src/components/AdminDashboard.tsx:11`, logo após `import BackupStatus from './BackupStatus';`, adicionar:

```ts
import CosmosUsageStatus from './CosmosUsageStatus';
```

- [ ] **Step 3: Renderizar ao lado do BackupStatus**

Em `src/components/AdminDashboard.tsx:230-233`, trocar:

```tsx
        {/* Backup status */}
        <motion.div {...entrance(0.34, shouldReduceMotion)}>
          <BackupStatus />
        </motion.div>
```

por:

```tsx
        {/* Backup status */}
        <motion.div {...entrance(0.34, shouldReduceMotion)}>
          <BackupStatus />
        </motion.div>

        {/* Cota diaria da Cosmos (busca por codigo de barras) */}
        <motion.div {...entrance(0.37, shouldReduceMotion)}>
          <CosmosUsageStatus />
        </motion.div>
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 5: Verificação manual**

```bash
npm run dev
```

Abrir o AdminDashboard logado como admin, confirmar que o card "Consultas de código de barras (Cosmos)" aparece logo abaixo do card de backup, com a barra de progresso preenchida proporcionalmente ao `count` atual (mesmo valor visto no badge da Task 3).

- [ ] **Step 6: Commit**

```bash
git add src/components/CosmosUsageStatus.tsx src/components/AdminDashboard.tsx
git commit -m "feat: adiciona card de cota diaria da Cosmos no AdminDashboard"
```
