# Desbrava — CLAUDE.md

Fonte única de memória do projeto. Atualizar só quando o Paulo pedir
"Atualize o resumo" ou ao final de uma funcionalidade grande.

## Escopo

App onde o usuário "raspa" selos dos municípios do RJ num mapa
interativo (SVG), com progresso, ranking, amigos, conquistas, rotas
temáticas (oficiais + personalizadas, sem selo), comunidade
(posts/curtidas/comentários), Motoclube Desbrava (dicas/lojas pra
motociclistas, Garagem Virtual), Loja Desbrava (e-commerce gamificado,
sem gateway de pagamento real) e verificação por GPS via Modo Viagem
(rastreio só em primeiro plano, ligado à mão pelo usuário). Estado de
SP em expansão (mapa navegável, sem conteúdo ainda).

Regras fixas:
- Versão (`VERSAO_APP` em `js/script.js` + `versionCode`/`versionName`
  em `android/app/build.gradle`): sobe só o último dígito por entrega;
  1º/2º dígito só quando o Paulo pedir.
- Segredo do Plano PRO: nunca em arquivo do repo (só na regra do
  Firestore, à mão).
- **Motoclube Desbrava**: gratuito hoje (`souMembroMotoclube()` em
  `js/script.js` sempre `true`), mas já estruturado como feature paga
  (R$ 4,90/mês). **Não implementar cobrança/checkout real nem
  endurecer o gate sem o Paulo pedir de novo** — mesma regra do Plano PRO.
- Selo "dourado" (texto visível) = `brilhante` (código/ids internos,
  não renomear).
- AdSense: não ativar sem pedido explícito.
- **Tema**: desde v0.11.16 o app tem Claro/Escuro/Sistema/Automático
  (era só dark fixo antes disso) — ver seção de tema abaixo antes de
  presumir que "o app é dark-only" numa próxima sessão.

## Stack

HTML/CSS/JS sem bundler · Firebase Auth+Firestore (Spark) · Fotos no
Google Drive via Apps Script · Capacitor (Android) · GitHub Pages +
Netlify (web) · GitHub Releases (APK, via `tools/publicar-apk.ps1`).

Build APK: `node tools/montar-www.js && npx cap sync android && cd
android && ./gradlew assembleDebug bundleRelease`.

## Última funcionalidade (v0.11.16)

**Tema Claro/Escuro/Sistema/Automático** (v0.11.16): o app não tinha
nenhum sistema de tema até aqui (só dark fixo). Agora `css/styles.css`
tem um bloco `:root` completo de variáveis (`--bg`/`--surf`/`--surf2`/
`--linha`/`--txt`/`--fraco`/`--vidro`/`--backdrop`, além das já
existentes `--verde`/`--ouro`/`--erro`) espelhado num
`:root[data-theme="light"]` + `@media (prefers-color-scheme: light)`
pro modo "Sistema". ~350 cores hexadecimais soltas (a maioria herdada
de antes dessa variável existir) foram convertidas pra usar essas
variáveis. `--verde-tinta` (texto escuro sobre botão verde) e as
cores dos selos/municípios no mapa (verde=visitado, dourado=brilhante,
cinza=bloqueado) ficam **iguais nos dois temas** de propósito — são
cor de estado, não decoração.
- JS (`aplicarDataTheme`/`definirTema`/`configurarAparencia` em
  `js/script.js`): grava em `localStorage` (`desbrava_tema`) e escreve
  `data-theme` em `<html>` (`"light"`/`"dark"`/ausente pro Sistema).
  Depois de mudar o atributo, força `void raiz.offsetHeight` --
  necessário mesmo em navegador de verdade, não só no preview
  (confirmado durante o desenvolvimento: sem isso, pelo menos um
  elemento com `color: var(--txt)` direto no seletor não repintava
  sozinho até o próximo repaint natural).
- Seletor "Aparência" (Sistema/Claro/Escuro/Automático) no Card 2 de
  Configurações (`#select-aparencia`).
- **"Automático"** liga o `AmbientLightSensor` do aparelho (permissão
  + zona-morta 400-1000 lux pra não piscar em sombra passageira) e
  escreve `data-theme` sozinho a cada leitura. **Essa API foi removida
  do Chrome em 2021 (fingerprinting) e nunca existiu no Safari/iOS** —
  ou seja, o `catch` (alerta + volta pra "Sistema" sozinho) é o
  caminho principal na prática pra quase todo aparelho real, não uma
  borda rara. `sensor.stop()` sempre que sai do modo Automático.

**Mapa (tela principal)** (v0.11.16): ícone de "Configurações" trocado
de um sol (confundia com toggle de tema) pra uma engrenagem de
verdade, mesmo id/comportamento. Modo Viagem virou FAB primário
(verde sólido, ícone branco, 58px vs. 48px da bússola, mais espaço
até ela — antes os dois quase se tocavam). Dica "Arraste para
mover..." some sozinha 4s depois de abrir (`configurarDicaMapa`).

## Última funcionalidade anterior (v0.11.15)

**Garagem Virtual redesenhada** (v0.11.15): as 3 abas (Criar/Editar/
Estatísticas) viraram um segmented control (só a ativa ganha
destaque, em vez de 3 botões soltos). A lista de motos empilhada —
que duplicava o nome da moto selecionada — deu lugar a um "Card
Seletor" compacto (`renderizarSeletorGaragem`): moto atual + estrela
dourada se for a ativa + setas pra trocar, só quando há 2+ motos. Aba
Estatísticas virou um dashboard de verdade: odômetro como herói
(`Math.round().toLocaleString("pt-BR")`, ex. "1.250 km"), viagens/
última viagem num grid 2 colunas com ícones. "Excluir moto" virou
ghost (só texto vermelho, sem contorno) pra não competir com "Salvar
alterações" (full width).

## Onda de redesign visual (v0.11.6 a v0.11.14)

A maior parte das telas do app passou por uma limpeza de UI, todas seguindo o mesmo
padrão minimalista de tabs (texto cinza inativo, branco + risco verde
embaixo quando ativo — classe `.social-aba`, reaplicada em
`.ranking-aba`/`.biblioteca-aba`/`.rotas-aba`) e um componente de
avatar circular reutilizável (`corAvatar`/`iniciaisApelido` em
`js/script.js`, iniciais sobre gradiente determinístico):
- **Rotas Temáticas** (v0.11.12): grid circular virou lista vertical
  de cards horizontais (miniatura 60x60 + barra de progresso fina +
  chevron), abas Oficiais/Personalizadas, sem cadeado amarelo — rota
  não iniciada (`visitados === 0`, diferente do gate "completa" da
  Biblioteca) fica em tons de cinza (`.rota-card-bloqueada`).
- **Popup do Município** (v0.11.13): selo raspável/revelado encolhido
  pra ~190-200px, status virou pill colorido (`definirStatusMunicipio`
  — verde quando verificado, âmbar quando raspado mas não verificado),
  os 3 botões de ação (Compartilhar/Filtro Comunidade "antigo @"/
  Sugestões — nenhum removido) viraram um grid horizontal discreto
  (`#modal-acoes-grid`/`.modal-acao-btn`), e "Abrir no Maps" trocou o
  bloco verde gigante por um link de texto pequeno.
- **Conquistas** (v0.11.14): cards verticais gigantes (1-2 por tela)
  viraram lista horizontal (medalha 76px + info ao lado); cadeado
  amarelo emoji virou ícone SVG pequeno e discreto; frase "Continue
  jogando para desbloquear" removida; pills de raridade padronizadas
  por cor (cinza/verde/roxo-azulado/dourado). De quebra, o fundo cinza
  chapado da raspadinha sem capa própria (`scratch-card.js`) virou um
  gradiente metálico em todo o app, não só aqui.
- **Menu inferior**: reorganizado em seções (Minha Jornada/Explorar/
  Sistema); Check-in semanal descontinuado por completo (removido de
  HTML/JS/CSS/README); Perfil só abre pelo avatar da topbar.
- **Configurações**: virou cards (`.settings-card`) com toggles CSS
  (`.settings-toggle-switch`) no lugar de checkbox nativo.
- **Comunidade**: feed estilo Instagram/Threads, sem cartões pesados
  (só `border-bottom` fino entre posts), FAB circular pra postar,
  menções `@nome` destacadas (`destacarMencoes` em `js/script.js`).
- **Amigos**: busca contínua (sem botão), avatar, menu "⋮" no lugar do
  botão vermelho de remover (`.amigo-menu`, com "Marcar como Parceiro
  de Estrada" como placeholder pra feature futura).
- **Ranking**: pódio com medalha (🥇🥈🥉) nos 3 primeiros, linha do
  usuário (`.ranking-me`) fixa no rodapé (`position: sticky`) quando
  ele não aparece no topo 50.
- **Biblioteca de selos**: virou álbum com 3 abas (Municípios/Regiões/
  Rotas — Conquistas saiu daqui, já tem modal próprio) + filtro de
  status (Todos/Conquistados/Faltam via classes `.locked`/`.unlocked`).
  Estado bloqueado padronizado (`filter: brightness(0.2) grayscale(100%)`
  na imagem, sem cadeado amarelo no texto).
- **Placeholder CSS puro** (`.selo-placeholder-box`/`.selo-placeholder-img`
  em `css/styles.css`): círculo com gradiente + emoji via `::after`
  pra qualquer selo/medalha sem arte ainda — a imagem real cobre
  perfeitamente assim que ganha `src`, sem trocar classe.
- **Perfil**: crachá "👑 Membro Desbrava"/"Desbravador" (via
  `souMembroMotoclube()`), dashboard 2x2 (Municípios/Selos Dourados/
  Rotas Concluídas/Regiões), minimapa com cantos arredondados, e só os
  4 selos mais recentes (`renderizarUltimosConquistadosPerfil`) no
  lugar da Biblioteca inteira repetida — com botão "Ver Biblioteca
  Completa" (só no próprio perfil).

**Loja Desbrava** (v0.11.5): e-commerce gamificado, SEM gateway de
pagamento real (`criarPedido` só registra a intenção de compra,
coleção `pedidos`). Catálogo em `produtos`, CRUD só pelo admin
(`UID_DONO`). Produto bloqueado (município da `regraDesbloqueio` não
raspado) aparece em silhueta. Voucher do Motoclube (R$4,90/mês, não
cumulativo) aplicado no checkout. Frete mockado via ViaCEP.

**3 recursos PRO do Motoclube ligados ao Modo Viagem** (v0.11.3-0.11.4):
Garagem Virtual (até 3 motos, odômetro somado sozinho pela moto
"ativa"), trilha do trajeto salvável como `rotasPersonalizadas`,
resumo + compartilhamento via `<canvas>`.

**Modo Viagem** (v0.11.2, base gratuita pra todos): substituiu o
rastreio em segundo plano (`@capacitor/background-runner`, removido —
exigia `ACCESS_BACKGROUND_LOCATION`, motivo de rejeição na Play
Store) por foreground service explícito
(`@capacitor-community/background-geolocation`), ligado só pelo botão
flutuante acima da bússola.

Firestore com `persistentLocalCache`. Motoclube Desbrava (dicas/lojas,
coleção `motoclubeItens`) e rotas personalizadas (sem selo, coleção
`rotasPersonalizadas`) gratuitos, mesma regra do Plano PRO pra cobrança
futura.
