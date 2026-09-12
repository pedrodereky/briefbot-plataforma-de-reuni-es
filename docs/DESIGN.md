# Sistema visual

Direção aprovada: **"operacional escuro"** — tipografia técnica, densidade alta,
e a IA como copiloto presente em vez de enfeite. Substitui o tema azul anterior,
que fazia o BriefBot parecer as ferramentas que ele complementa (Zoom, Meet,
Teams) sem mostrar o que ele entrega de diferente.

## Tema: claro, escuro e sistema

O padrão é **seguir o sistema**. Sem escolha explícita, o app acompanha o
`prefers-color-scheme` do aparelho — inclusive quando o usuário troca o modo com
o app aberto. Escolher Claro ou Escuro em Configurações → Aparência fixa o tema e
ganha do sistema nos dois sentidos.

Três peças fazem isso funcionar juntas, e vale saber por que são três:

| Onde | O que faz | Por que não dá para tirar |
|---|---|---|
| `src/index.css` | `:root` com os valores claros, `.dark` com os escuros, e um `@media (prefers-color-scheme: dark)` que repete os escuros | Resolve o tema **sem JavaScript nenhum**. É o que vale se o script falhar |
| `index.html` | Script embutido que lê `localStorage` e põe a classe no `<html>` | Roda antes do primeiro pixel. Sem ele, quem escolheu escuro vê um lampejo claro a cada carregamento |
| `src/contexts/ThemeProvider.tsx` | Estado em React, persistência e o `matchMedia` que escuta a troca em tempo real | As variantes `dark:` do Tailwind são por classe (`darkMode: ["class"]`); sem a classe elas não valem nada no modo sistema |

A duplicação dos valores escuros entre `.dark` e o bloco `@media` é deliberada e
está comentada no arquivo. Os dois caminhos concordam por construção porque os
valores são os mesmos.

### A sala de reunião é sempre escura

`MeetingRoomPage` e `JoinMeetingPage` chamam `useTemaTravado('escuro')`. Vídeo
pede fundo escuro ao redor — é o que Meet, Zoom e Teams fazem. São as únicas
rotas que ignoram a preferência do usuário, e a tela de Aparência avisa isso.

## Tokens

Nenhum componente conhece cor: só token. Trocar o tema inteiro depois custa uma
folha de estilo, não uma revisão de telas.

- **Cor de ação:** teal. No claro é `188 84% 31%`, no escuro `188 61% 57%` — o
  teal claro do tema escuro não alcança 4.5:1 sobre branco, então ele escurece.
- **Alerta:** coral (`--destructive`, `--live`), para o que exige ação: item
  vencendo, reunião ao vivo.
- **Semânticas:** `--success`, `--warning`, `--info`, `--live`. Cada uma é
  ajustada por tema para funcionar como **texto sobre o próprio tom a 15%** —
  que é como os selos são montados (`bg-success/15 text-success`). Era esse o
  bug do padrão antigo: `text-green-700` sobre `bg-green-500/15` some no escuro.
- **`--faint`:** mais claro que `muted-foreground`, para carimbos de horário.
- **Impressão:** o bloco `@media print` redefine os tokens para valores claros.
  Sem isso, quem está no tema escuro imprime a ata com cartões pretos.

## Tipografia

IBM Plex Sans no texto, IBM Plex Mono em **tudo que é número ou carimbo**:
horários, contadores, durações, códigos de erro. A classe `.tabular` liga
`font-variant-numeric: tabular-nums` para os números alinharem em coluna.

## Estrutura das telas

- **Sem barra de topo.** Identidade e logout desceram para o rodapé do menu
  lateral; a faixa do topo passou a ser do conteúdo, que é onde o usuário procura
  o botão da ação principal. Cada página abre com `<PageHeader>` (título, resumo
  em monoespaçada, ações) e segue com `<PageBody>`.
- **`<MetricStrip>`** no lugar dos cartões de métrica: quatro células separadas
  por 1px, sem ícone. Os ícones não diziam nada que o rótulo já não dissesse.
- **Menu lateral** de 204px, lista única sem rótulos de seção, com o contador de
  action items abertos em monoespaçada.

## Estados

Quatro, e são quatro telas diferentes de propósito:

| Estado | Componente | A regra |
|---|---|---|
| Vazio de conta nova | `EmptyState` | Não diz "nenhum resultado": mostra os caminhos reais de começar |
| Busca sem resultado | `EmptyState` com outro texto | O usuário **tem** dados; o problema é o filtro. A saída é afrouxar o recorte, não criar |
| Carregando | `ListSkeleton`, `MetricStrip carregando` | Esqueleto com a forma do conteúdo que vem. Cabeçalho e botões ficam de fora: já são conhecidos, e virar bloco cinza faz a tela pular |
| Erro | `ErrorState` | Diz o que **não** se perdeu. Falha da IA depois de 1h40 de reunião gera pânico de "perdi a reunião"; a frase "Nada foi perdido: a transcrição está salva" transforma o erro em espera |

## O que ainda não foi aplicado

O mobile das telas internas usa o responsivo do Tailwind, mas as adaptações
desenhadas — copiloto como folha que sobe na sala, barra de abas inferior — não
foram implementadas. Estão nos mockups aprovados.
