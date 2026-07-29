# Encarte Online v2 — Moldes reutilizáveis + Perfil de Loja

## Contexto

Hoje o usuário monta os encartes promocionais (5+ por semana, pra várias
farmácias diferentes do grupo do Piauí — Ultra Popular, Bigfort, etc.) todo
manual no Photoshop: arte de fundo, textos de produto, preços, tudo
desenhado do zero toda vez.

O sistema já tem uma tela "Encarte Online" (`src/components/EncarteCreator.tsx`,
2601 linhas), acessível pelo botão "Encarte" no menu principal
(`src/App.tsx:701-714`, atrás da flag `hasEncarteAccess` por loja em
`allowedStores`). Ela sobrepõe produtos numa grade **fixa** (4/6/8/10/12
posições igualmente espaçadas) por cima de uma imagem de fundo. Na prática
está vazia — `encarteThemes`, `encarteLogos` e `encarteLayouts` nascem como
array vazio (`src/store.ts:1510-1515`) e só crescem colando URL manualmente
(`src/components/EncarteCreator.tsx:2229-2236`), sem upload direto. A grade
fixa também não bate com artes reais (ex: 15 produtos em 3×5, como no
exemplo "Fecha Mês" enviado pelo usuário) e não separa identidade da loja
(logo, endereço, telefone, Instagram) do desenho da arte — cada arte de
fundo tem tudo isso já desenhado dentro, então nada é reaproveitável entre
lojas diferentes.

Esta spec substitui o "Encarte Online" atual por um sistema em 3 camadas:
**Perfil de Loja**, **Molde** e **Encarte da semana**.

## Decisões já tomadas (confirmadas com o usuário)

- **Photoshop continua existindo só pra desenhar a arte decorativa** (banner,
  cores, moldura) — não pra digitar produto por produto toda semana. Ver
  fluxo completo abaixo.
- **Molde ≠ Perfil de Loja.** O molde é só o desenho + posições. A logo,
  endereço, telefone e Instagram ficam num Perfil de Loja separado,
  reaproveitável em qualquer molde — assim um molde "grade vermelha 15
  produtos" serve pra qualquer loja nova do grupo sem redesenhar nada.
- **Grade automática por padrão** (colunas × linhas, arrasta só a área útil
  da imagem) — cobre a maioria dos casos reais (ambos exemplos enviados são
  grades regulares: 3×5 e 3×4). **Modo "Desenhar" manual é opcional**,
  ativado só quando alguma posição foge do padrão (ex: bloco maior pra
  combo de produtos).
- **Data de validade** vira campo de texto editável posicionado no molde
  (não mais desenhada na arte) — mesma arte serve pra semanas diferentes.
- **Tipografia mantida**: mesmo padrão do Encarte atual (fonte condensada
  caixa alta + seletor Inter/Roboto/Oswald já existente na aba "Fontes").
  Nada novo aqui.
- **Frente e verso continuam existindo** (a maioria dos casos é imagem
  única pra WhatsApp/Instagram, mas às vezes precisa imprimir em papel,
  A4 frente/verso) — reaproveita o pipeline de export atual
  (`html2canvas` + `jsPDF`, `EncarteCreator.tsx:396-472`).
- **Sem migração de dados**: como o Encarte atual está vazio na prática,
  a v2 substitui a tela inteira sem precisar converter nada.

## Modelo de dados

Três entidades novas em `src/store.ts`, seguindo o mesmo padrão de
persistência já usado pelo Encarte atual (blob JSON salvo via
`POST /settings/:id`, `api.ts:350-367` — cada entidade um `id` próprio na
tabela `settings`, não reaproveita o blob `users_and_flags` pra não inchar
ele mais ainda):

```ts
interface StoreProfile {
  id: string;
  cnpj?: string;        // opcional, só pra habilitar a busca automática
  nome: string;        // "Bigfort — Guadalupe"
  logoUrl: string;
  endereco: string;
  telefone: string;
  instagram: string;
}

interface EncarteSlotDef {
  id: string;
  tipo: 'produto' | 'data' | 'logo' | 'contato';
  xPct: number; yPct: number; widthPct: number; heightPct: number; // % da imagem, não px — independe da resolução de export
}

interface EncarteMolde {
  id: string;
  nome: string;         // "Fecha Mês", "Dia do Bebê"
  frontBgUrl: string;
  backBgUrl?: string;
  frontSlots: EncarteSlotDef[];
  backSlots?: EncarteSlotDef[];
}

interface EncarteSemanal {
  id: string;
  moldeId: string;
  storeProfileId: string;
  validade: string;                              // texto livre, ex: "30 e 31 de Julho"
  produtos: Record<string /* slotId */, SelectedProduct | null>; // reaproveita SelectedProduct já existente (store.ts:150-170)
}
```

Persistidas em `settings` sob os ids `encarte_lojas`, `encarte_moldes`,
`encarte_semanais` respectivamente — mesmo mecanismo de fetch/save que já
existe pra `current_layout` e outras chaves avulsas (`api.ts:339-367`).

## Fluxo 1 — Cadastrar Perfil de Loja

Tela simples de lista + formulário (CNPJ opcional, nome, upload de logo,
endereço, telefone, Instagram). Upload de logo reaproveita
`POST /gallery/upload/:category` (`src/gallery.ts:247`, já usado pelo
cadastro de produtos) — corrige de quebra a limitação atual do Encarte de
só aceitar logo por URL colada manualmente.

**Busca automática por CNPJ (opcional):** digitando o CNPJ, um botão
"Buscar dados" consulta a [BrasilAPI](https://brasilapi.com.br/api/cnpj/v1/{cnpj})
(gratuita, sem autenticação) e pré-preenche nome e endereço a partir do
cadastro oficial da Receita. Telefone e Instagram **não** são
pré-preenchidos por essa busca (o telefone da Receita raramente é o
WhatsApp real da loja, e Instagram não existe nesse cadastro) — continuam
manuais. Todo campo pré-preenchido permanece editável; a busca é só um
atalho, nunca bloqueia o cadastro se o CNPJ não for informado ou a consulta
falhar (rede fora do ar, CNPJ não encontrado etc. — mostra um aviso e
segue com o formulário em branco).

## Fluxo 2 — Criar/editar Molde

1. Upload da arte de fundo (mesmo endpoint de galeria acima).
2. Define colunas × linhas e arrasta um retângulo sobre a área útil da
   imagem (onde ficam os produtos) — o sistema distribui os slots tipo
   `produto` igualmente dentro dessa área. Cobre os dois exemplos reais
   enviados (3×5 e 3×4).
3. Botão "Desenhar manualmente" (opcional): alterna pra modo onde cada slot
   vira uma caixa arrastável/redimensionável individual — usado só quando
   uma posição foge da grade regular.
4. Marca (arrastando uma caixa, mesmo mecanismo do passo 3) onde entram os
   slots tipo `data`, `logo` e `contato`.
5. Nomeia e salva.

Repete pro verso, se o molde tiver frente/verso.

## Fluxo 3 — Montar o Encarte da semana

1. Escolhe um Molde salvo e um Perfil de Loja salvo.
2. Preview mostra a arte de fundo com os slots vazios nas posições exatas
   do molde; slots `logo`/`contato` já vêm preenchidos automaticamente
   pelo Perfil de Loja escolhido.
3. Clica num slot `produto` → abre o `ProductSelector` já existente
   (`src/components/ProductSelector.tsx`) pra buscar no cadastro → nome e
   foto entram automaticamente → digita o preço promocional ou marca "%
   desconto" (reaproveita `SelectedProduct.displayType` e
   `discountValue`, já existentes, `store.ts:157-158`).
4. Preenche o campo de validade (texto livre).
5. Exporta: PNG (frente, ou frente+verso separados) ou PDF frente/verso
   A4 — reaproveita `handleExportPNG`/`handleExportPDF`
   (`EncarteCreator.tsx:396-472`) adaptado pros novos ids de elemento.

## Fora de escopo (v1)

- Editor de cor/tamanho de fonte por slot — mantém o padrão herdado da
  aba "Fontes" atual, sem granularidade por posição.
- Geração da arte decorativa (banner, moldura, ícones) dentro do sistema —
  continua sendo feita no Photoshop e importada como imagem de fundo.
- Combos com múltiplos produtos numa única posição (ex: "Linha Dove" com 3
  produtos numa imagem só) — tratado como upload de uma imagem/foto única
  no slot de produto, igual ao catálogo já suporta hoje; não é uma
  funcionalidade nova.
- Duplicar/clonar molde pra ajuste rápido — se necessário, entra numa v2
  depois de validar o fluxo básico com uso real.

## Teste

Local, antes de qualquer deploy (`npx playwright`, sem subir na VPS até o
usuário aprovar):

1. Cadastrar 2 Perfis de Loja (ex: Ultra Popular e Bigfort) com logo,
   endereço, telefone e Instagram diferentes. Testar a busca por CNPJ num
   deles (CNPJ válido pré-preenche nome/endereço; CNPJ inválido ou sem
   internet mostra aviso sem travar o formulário).
2. Criar um Molde a partir da arte "Fecha Mês" (3 colunas × 5 linhas) →
   confirmar que os 15 slots ficam posicionados dentro da área marcada,
   sem sobrepor o banner do topo nem o rodapé.
3. Criar um segundo Molde a partir da arte "Dia do Bebê" (3×4) → confirmar
   que funciona igual, com arte, cores e proporção diferentes.
4. Montar um Encarte da semana com o Molde "Fecha Mês" + Perfil "Ultra
   Popular": preencher os 15 produtos buscando no cadastro, digitar
   validade → exportar PNG → conferir visualmente que bate com o layout
   original enviado pelo usuário.
5. Trocar o Perfil de Loja do mesmo Molde pra "Bigfort" sem mexer em mais
   nada → confirmar que logo/endereço/telefone trocam sozinhos e o resto
   do layout permanece igual (prova a reutilização entre lojas).
6. Testar o modo "Desenhar manualmente": ajustar um slot fora da grade
   automática e confirmar que a posição customizada é salva e reaparece
   corretamente ao reabrir o molde.
7. Exportar um encarte com frente e verso → confirmar PDF A4 com as duas
   páginas corretas.
