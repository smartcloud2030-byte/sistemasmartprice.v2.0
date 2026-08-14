# Encarte Online — editor de temas embutido para Moldes

## Contexto

Hoje, criar a arte de fundo de um Molde (`MoldeEditor.tsx`) é só upload: o
usuário precisa desenhar o banner em outra ferramenta (ex: encartefácil,
manualmente, no plano grátis deles) e subir o PNG pronto. Pra contornar a
limitação de formato do plano grátis do encartefácil (só libera "Post
Vertical" 1080×1350, formato A4 fica trancado no Pro), existe até um
script Python (`montar_molde_smartprice.py`, fora deste repo) que
redimensiona o banner exportado e cola numa folha A4 branca antes do
upload manual.

O pedido é eliminar essa dependência externa: dar ao `MoldeEditor` um
gerador de tema embutido, inspirado visualmente na aba "Temas" do
encartefácil (biblioteca de designs prontos por categoria), mas 100%
nativo — sem integrar com a ferramenta deles, só usando como referência de
UX. Fica de fora do escopo, por ora, replicar toda a estrutura de abas do
encartefácil (Importação com IA, Remover fundo, Exportar+vídeo, Enviar
WhatsApp) — o alvo desta spec é só a criação da arte de fundo do Molde.

## Decisões já tomadas (confirmadas com o usuário)

- **Não integra com o encartefácil** — é só referência visual. O gerador
  de tema é nativo, roda inteiro dentro do SmartPrice.
- **Pacotes de tema prontos** (não um picker de cor livre): cada tema já
  vem com fundo, cores de texto/preço e fonte combinando entre si — sem
  risco de o usuário montar uma combinação ilegível.
- **10 temas iniciais**, cobrindo o calendário comum de farmácia: Fecha o
  Mês, Verão, Outono, Inverno, Primavera, Festa Junina, Dia das Mães, Dia
  dos Namorados, Black Friday, Natal.
- **Ícone decorativo por tema**, via `lucide-react` (já é dependência do
  projeto, mesmo estilo visual do resto do sistema) — sem fotos de banco
  de imagens, que não é algo gerável por código.
- **Tema cobre a folha inteira** (não só o cabeçalho) — decisão do
  usuário. Ver seção "Legibilidade" abaixo pra como isso não compromete o
  texto dos produtos.
- **Aplica-se aos dois lados do molde** (frente e verso), cada lado pode
  usar um tema diferente — mesmo padrão de estado independente por `side`
  que o `MoldeEditor` já tem hoje.
- **Título + subtítulo editáveis** por uso do tema (ex: título "Inverno
  das Melhores Ofertas", subtítulo "Preços que esquentam sua economia").
- **Logo da loja entra automático**, puxada de `logoUrl` do perfil de loja
  ativo (`StoreProfileManager`), com toggle pra esconder se não quiser
  naquele molde específico.

## Legibilidade — folha inteira colorida sem perder o texto dos produtos

`EncarteWeekly.tsx` hoje renderiza nome/subtítulo do produto como texto
solto (`bg-transparent`, sem caixa própria) por cima do `frontBgUrl` —
só o preço tem caixa colorida sólida (`priceBoxColor`). Um fundo colorido
vibrante atrás disso arriscaria ilegibilidade do nome, e mudar
`EncarteWeekly.tsx` pra dar caixa própria ao nome está fora do escopo
desta spec (afetaria todos os moldes já existentes, não só os feitos com
tema novo).

Resolvido inteiramente dentro da imagem gerada pelo tema, sem tocar em
`EncarteWeekly.tsx`: o `MoldeEditor` já define `grid.area` (retângulo
onde os produtos vão ser posicionados — `DEFAULT_AREA = { xPct: 5, yPct:
18, widthPct: 90, heightPct: 68 }`). O gerador de tema desenha um painel
claro (branco ou creme, com leve sombra) exatamente nessa área, com a cor
forte do tema só nas bordas/topo/rodapé — mesmo efeito visual de "cartão
claro sobre fundo colorido" que o próprio encartefácil usa. Cada preset
de tema já define a cor de texto do nome do produto (`productNameColor`)
otimizada para ler bem sobre esse painel claro, não sobre a cor forte de
fundo.

## Modelo de dados

Novo arquivo `src/lib/encarteTemas.ts`, exportando um array `ENCARTE_TEMAS:
EncarteTema[]`:

```ts
interface EncarteTema {
  id: string;                    // 'fecha-mes', 'verao', etc.
  nome: string;                  // "Fecha o Mês"
  categoria: string;             // agrupamento futuro (não usado na v1, todos numa lista só)
  background: { tipo: 'solido' | 'gradiente'; cores: string[]; anguloDeg?: number };
  painelClaroColor: string;      // cor do painel atrás da grade de produtos
  tituloColor: string;
  subtituloColor: string;
  priceBoxColor: string;         // já existe em EncarteMolde, reaproveitado
  productNameColor: string;      // já existe em EncarteMolde, reaproveitado
  fontFamily: EncarteFontFamily; // já existe em EncarteMolde, reaproveitado
  icone: string;                 // nome do componente exportado por lucide-react, ex: 'Snowflake'
  iconePosicao: { xPct: number; yPct: number; sizePct: number; opacity: number };
}
```

Paletas propostas (fundo em gradiente, cor primária → secundária):

| Tema | Fundo | Título | Preço/nome | Fonte | Ícone |
|---|---|---|---|---|---|
| Fecha o Mês | `#7f1d1d → #dc2626` | branco | `#f59e0b` / branco | Anton | TrendingDown |
| Verão | `#0ea5e9 → #fbbf24` | branco | `#f97316` / branco | Poppins | Sun |
| Outono | `#b45309 → #78350f` | creme | `#c2410c` / branco | Playfair Display | Leaf |
| Inverno | `#1e3a8a → #60a5fa` | branco | `#0369a1` / branco | Montserrat | Snowflake |
| Primavera | `#f472b6 → #4ade80` | branco | `#16a34a` / branco | Poppins | Flower2 |
| Festa Junina | `#b91c1c → #ca8a04` | creme | `#991b1b` / creme | Oswald | Flame |
| Dia das Mães | `#fda4af → #f472b6` | branco | `#db2777` / branco | Playfair Display | Heart |
| Dia dos Namorados | `#dc2626 → #db2777` | branco | `#991b1b` / branco | Playfair Display | Heart |
| Black Friday | `#111827 → #000000` | `#facc15` | `#facc15` (texto preto) / branco | Anton | Tag |
| Natal | `#166534 → #b91c1c` | branco | `#b91c1c` / branco | Playfair Display | Gift |

`painelClaroColor` é branco (`#ffffff`) ou creme bem claro (`#fef9ec`) em
todos — mantém consistência e legibilidade, varia só o tom de fundo forte
ao redor.

## Componente novo

`src/components/encarte/TemaPicker.tsx`:

- **Galeria**: grade de miniaturas dos 10 temas, renderizadas em CSS puro
  (`background: linear-gradient(...)`, sem gerar imagem real só pra
  escolher — leve e instantâneo).
- **Painel de customização**, ao selecionar um tema: campo título, campo
  subtítulo, toggle "Mostrar logo da loja" (default ligado se
  `logoUrl` existir no perfil de loja ativo), preview grande ao vivo do
  molde inteiro (fundo + painel claro + título/subtítulo + logo + ícone).
- Botão **"Usar este tema"**.

## Integração no `MoldeEditor.tsx`

Quando `!bgUrl` pro lado atual, em vez de só a dropzone de upload, duas
opções lado a lado: "Enviar arte de fundo" (existente) e "Criar com
tema" (abre `TemaPicker` num modal/painel). Ao confirmar "Usar este
tema":

1. Renderiza um DOM temporário (tamanho do molde, mesma técnica de
   `html2canvas` já usada em `EncarteWeekly.tsx`) com fundo, painel
   claro na área de `grid.area`, título/subtítulo, logo (se ativo) e
   ícone.
2. Converte pra PNG (blob) e sobe via `uploadBackgroundImage(file,
   'encarte-moldes')` — mesma função que o upload manual já usa hoje.
3. Preenche `bgUrl` do lado atual com a URL retornada, e já aplica no
   `draft` o `fontFamily`, `priceBoxColor` e `productNameColor` do tema
   escolhido (os mesmos campos que o `MoldeEditor` já edita manualmente
   hoje — o tema só define o valor inicial, o usuário pode ajustar depois
   nos controles que já existem).

Depois de aplicado, o restante do fluxo do `MoldeEditor` (grade de
produtos, slots especiais, salvar) continua idêntico ao de hoje — o
sistema não distingue uma arte de fundo gerada por tema de uma enviada
por upload manual.

## Fora de escopo

- Reorganizar as abas do Encarte Online em 5 etapas ao estilo
  encartefácil (Importação com IA, Remover fundo, Exportar+vídeo, Enviar
  WhatsApp) — ideia paralela discutida, não faz parte desta spec.
- Picker de cor livre / customização de paleta por tema (fase futura,
  se pedido).
- Categorização/busca de temas (a v1 lista os 10 numa grade só).
- Alterar `EncarteWeekly.tsx` pra dar caixa própria ao nome do produto —
  resolvido via painel claro dentro da própria imagem do tema, sem tocar
  no renderer.
- Editor de tema pra Verso funcionar simultâneo/vinculado à Frente (cada
  lado escolhe e gera seu tema de forma independente).
