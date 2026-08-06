# Sessão real de autenticação (substituindo o token fixo de API)

## Contexto

O SmartPrice hoje está exposto na internet pública (VPS com domínio próprio)
e tem uma falha de fundo no controle de acesso: a autorização de escrita na
API (`x-api-token`) é um valor **fixo** (`API_SECRET`), igual pra todo mundo,
e é **embutido no bundle JavaScript** enviado ao navegador
(`VITE_API_SECRET`, lido em `src/lib/supabase.ts` e usado em toda chamada de
API pelo `store.ts`/`api.ts`). Como o Vite injeta esse valor em tempo de
build, ele fica visível a qualquer pessoa que inspecionar o código-fonte da
página — inclusive um visitante que nunca fez login.

Consequência prática: hoje, **não existe controle de acesso real** para quem
escreve no banco. `POST/PUT/DELETE /products`, `POST /settings/:id`,
`POST /admin/credentials`, `GET /system/stats`, `GET /tef-status` e
`GET /barcode-lookup/:gtin` são protegidos só pelo middleware `apiAuth`
(`api.ts:32-36`), que compara `x-api-token` recebido com o valor público do
bundle. O login administrativo (`POST /admin/login`) confere usuário/senha,
mas **não gera nenhuma sessão depois** — a resposta é só
`{ success: true }`; "estar logado" hoje é um estado puramente visual no
front-end (Zustand + `localStorage`), sem vínculo nenhum com o servidor.
Além disso:

- As senhas de admin são comparadas em **texto puro** (`api.ts:67`,
  `api.ts:89`), sem hash.
- Os valores padrão de fallback (`ADMIN_PASSWORD_DAYLON=8814`,
  `ADMIN_PASSWORD_JH=1993`, em `api.ts:44-45`) são fracos e previsíveis se
  ninguém tiver trocado.
- Não há limite de tentativas em `/admin/login` — nada impede força bruta.
- O login de "loja" (CNPJ + usuário, sem senha, em `Login.tsx`) só é validado
  no cliente contra a lista `allowedStores`; nada impede chamar a API
  diretamente ignorando os limites de acesso simultâneo
  (`maxConcurrentStores`, `cnpjUserLimits`).

Esta spec substitui esse modelo por sessão de verdade emitida pelo servidor,
via cookie assinado, mantendo o `API_SECRET` só para uso servidor-a-servidor
(`scripts/backup.sh`, `scripts/migrate-from-legacy.mjs`).

## Decisões já tomadas (confirmadas com o usuário)

- Sistema é acessível pela internet pública — prioridade alta.
- Resolver tudo de uma vez (sessão real + hash de senha + rate limit),
  não em etapas.
- Sessão via **cookie httpOnly** (não `Authorization` header/localStorage) —
  resistente a roubo de token via XSS.
- Login de loja **continua sem senha** por ora (CNPJ + usuário) — só troca o
  mecanismo por baixo (sessão real em vez do token fixo). Exigir senha de
  loja fica como possível projeto futuro separado.
- Duração de sessão: **loja 7 dias**, **admin 8 horas** (admin tem mais poder
  de ação, expira mais rápido).

## Arquitetura

### Sessão via JWT em cookie httpOnly

- Novo segredo `SESSION_SECRET` (32+ bytes aleatórios) no `.env`, nunca no
  front-end.
- No login bem-sucedido, o servidor assina um JWT
  (`jsonwebtoken`) com payload `{ role: 'admin' | 'store', username, cnpj?, exp }`
  e devolve num cookie `smartprice_session`:
  `httpOnly; Secure (só quando NODE_ENV=production); SameSite=Lax; Path=/api`.
- Expiração no próprio JWT: 8h pra `role: 'admin'`, 7 dias pra `role: 'store'`.
- Novo middleware `requireSession(role?)` em `api.ts` substitui `apiAuth` nos
  endpoints que hoje exigem token: lê o cookie (`cookie-parser`), verifica
  assinatura/expiração com `jsonwebtoken`, popula `req.session` com o payload.
  Se `role` for passado e não bater, ou se o cookie for inválido/ausente/
  expirado → `401`.
- `POST /api/logout` limpa o cookie (`res.clearCookie`).
- `GET /api/session` (novo, sem exigir nada além do cookie) — devolve
  `{ role, username, cnpj }` se a sessão for válida, ou `401` se não. O
  front chama isso ao carregar o app pra saber se continua logado, em vez de
  confiar só no `localStorage`.

### `API_SECRET` — escopo reduzido

- Deixa de ser lido pelo navegador: `VITE_API_SECRET` sai do `.env` de build
  e de todo uso em `src/` (o front não manda mais `x-api-token`).
- Continua existindo só para os dois scripts que já o usam
  server-to-server (`scripts/backup.sh`, `scripts/migrate-from-legacy.mjs`),
  atrás de um middleware separado (`requireServerToken`, o antigo `apiAuth`
  renomeado) nas poucas rotas que esses scripts efetivamente chamam.
- Valor atual (`smartprice-api-2026`) deve ser tratado como comprometido —
  precisa ser trocado por um valor forte e aleatório no `.env` da VPS antes
  do deploy desta mudança.

### Novo endpoint de login de loja

`POST /api/login/store` recebe `{ cnpj, username }`, confere contra
`allowedStores` **no servidor** (hoje só confere no cliente), reforça
`maxConcurrentStores`/`cnpjUserLimits` no backend (hoje só no front, dá pra
burlar chamando a API direto), e emite o cookie com `role: 'store'`.

## Senhas de admin: hash + rate limiting

- `bcryptjs` (sem dependência de binário nativo) para hash das senhas.
  `getAdminCredentials()`/`saveAdminCredentials()` passam a guardar
  `{ [username]: hashDaSenha }` em vez de texto puro.
- **Migração automática e silenciosa**: se o valor salvo em
  `settings.admin_credentials` (ou o fallback `DEFAULT_ADMIN_CREDENTIALS`)
  ainda for texto puro (não começa com `$2`), o servidor gera o hash na
  primeira verificação e regrava — sem exigir troca manual de senha, sem
  downtime.
- `POST /admin/login` e `POST /admin/credentials` passam a comparar com
  `bcrypt.compare()`.
- Fallbacks fracos (`8814`/`1993`) somem do código — `ADMIN_PASSWORD_DAYLON`/
  `ADMIN_PASSWORD_JH` deixam de ter valor padrão; se não estiverem definidos
  no `.env`, o login desses usuários fica bloqueado até serem configurados
  (em vez de aceitar um valor previsível).
- `express-rate-limit` em `POST /admin/login`: 5 tentativas por 15 min por
  IP, resposta `429` genérica (sem revelar se o usuário existe). Mesmo
  limite aplicado em qualquer outro endpoint que reusa `/admin/login` como
  "confirmar senha de admin antes de ação sensível" (padrão usado em
  `UserManagement.tsx` e outros componentes).

## Endpoints afetados

| Endpoint | Antes | Depois |
|---|---|---|
| `POST/PUT/DELETE /products*` | `apiAuth` (token fixo) | `requireSession('admin')` |
| `POST /settings/:id` | `apiAuth` | `requireSession('admin')` |
| `POST /admin/credentials` | `apiAuth` | `requireSession('admin')` |
| `GET /system/stats` | `apiAuth` | `requireSession('admin')` |
| `GET /tef-status` | `apiAuth` | `requireSession('admin')` |
| `GET /barcode-lookup/:gtin` | `apiAuth` | `requireSession('admin')` |
| `POST /admin/login` | `apiAuth` | público + rate limit (é o próprio login) |
| `POST /api/login/store` (novo) | — | público, valida no servidor |
| `POST /api/logout` (novo) | — | `requireSession()` (qualquer role) |
| `GET /api/session` (novo) | — | público (retorna 401 se sem sessão) |
| `GET /products`, `/products/:id`, `/health`, `/barcode-image` | público | continua público (sem dado sensível) |

## Front-end

- `src/store.ts`: `login()` e `verifyAdminLogin()` passam a chamar as rotas
  novas (`/api/login/store`, `/api/admin/login`); nenhuma chamada de API
  mais manda `x-api-token` (removido de `api.ts`, `src/lib/supabase.ts` e
  qualquer outro `fetch` que hoje inclui esse header).
- Todo `fetch` de API passa `credentials: 'include'` pra mandar o cookie.
- Ao carregar o app, chama `GET /api/session` pra confirmar com o servidor
  se a sessão ainda é válida — `localStorage` continua guardando só
  preferências de UI (ex.: último CNPJ digitado), não mais o estado de
  "estou logado".
- `src/components/Login.tsx` não muda visualmente; só troca o que acontece
  no `handleSubmit`.

## Erros e mensagens ao usuário

| Situação | Comportamento |
|---|---|
| Sessão ausente/expirada em endpoint protegido | `401`, front redireciona pra tela de login |
| `POST /admin/login` com senha errada | `401` genérico ("Usuário ou senha de administrador incorretos"), igual hoje |
| Rate limit estourado em `/admin/login` | `429`, mensagem "Muitas tentativas, aguarde alguns minutos" |
| `ADMIN_PASSWORD_*` não configurado no `.env` | Login desse usuário falha com `401`, sem mensagem diferenciada (não revela que é problema de configuração) |
| Cookie corrompido/assinatura inválida | Tratado igual sessão ausente (`401`) |

## Migração / rollout

1. Trocar `API_SECRET` no `.env` da VPS por um valor novo e forte.
2. Gerar e definir `SESSION_SECRET` no `.env` da VPS.
3. Definir `ADMIN_PASSWORD_DAYLON`/`ADMIN_PASSWORD_JH` reais no `.env` (sem
   fallback previsível).
4. Deploy quebra sessões antigas — usuários (loja e admin) precisam logar de
   novo depois do deploy. Sem perda de dados: rascunhos de produto/preço em
   edição são locais por CNPJ+usuário e não dependem do token.
5. Migração de senha em texto puro para hash acontece sozinha no primeiro
   login de cada admin depois do deploy — não precisa de script manual.

## Testes

- Login admin com senha correta gera cookie válido; senha errada não.
- Migração automática de senha texto puro → hash no primeiro login.
- Rate limit bloqueia a 6ª tentativa em 15 min e devolve `429`.
- Endpoint de escrita (`POST /products`) rejeita requisição sem cookie
  (`401`) e aceita com cookie de sessão `admin` válido.
- Cookie expirado (JWT com `exp` no passado) é recusado.
- `POST /api/login/store` recusa CNPJ fora de `allowedStores`, recusa CNPJ
  suspenso, e respeita `maxConcurrentStores`/`cnpjUserLimits` no servidor
  (não só no front).
- `scripts/backup.sh` e `scripts/migrate-from-legacy.mjs` continuam
  funcionando com `API_SECRET` (fluxo servidor-a-servidor intacto).

## Fora de escopo (por decisão do usuário)

- Senha para login de loja (CNPJ + usuário continua sem senha).
- Refresh token / renovação silenciosa de sessão (ao expirar, loga de novo).
- 2FA para admin.
