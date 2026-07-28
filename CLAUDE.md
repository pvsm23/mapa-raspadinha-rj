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

## Stack

HTML/CSS/JS sem bundler · Firebase Auth+Firestore (Spark) · Fotos no
Google Drive via Apps Script · Capacitor (Android) · GitHub Pages +
Netlify (web) · GitHub Releases (APK, via `tools/publicar-apk.ps1`).

Build APK: `node tools/montar-www.js && npx cap sync android && cd
android && ./gradlew assembleDebug bundleRelease`.

## Última funcionalidade (v0.11.11)

**Onda de redesign visual** (v0.11.6 a v0.11.11) — a maior parte das
telas do app passou por uma limpeza de UI, todas seguindo o mesmo
padrão minimalista de tabs (texto cinza inativo, branco + risco verde
embaixo quando ativo — classe `.social-aba`, reaplicada em
`.ranking-aba`/`.biblioteca-aba`) e um componente de avatar circular
reutilizável (`corAvatar`/`iniciaisApelido` em `js/script.js`, iniciais
sobre gradiente determinístico):
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
