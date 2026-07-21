# Lançar o Desbrava na Google Play — passo a passo

Guia do processo completo. Marca ⚠️ = ponto que costuma travar/reprovar
se não for tratado antes. "**Você**" = ação que só o Paulo faz (conta,
pagamento, decisões); "**Claude**" = eu consigo fazer/preparar.

---

## Fase 0 — Decisões antes de tudo (importantes!)

### ⚠️ 0.1 Permissão de localização em segundo plano
O app pede `ACCESS_BACKGROUND_LOCATION` (rastreio em segundo plano). O
Google **fiscaliza isso pesado**: exige um **formulário de justificativa
+ um vídeo** mostrando o uso, e **reprova** muitos apps. Opções:
- **(Recomendado pra v1)** Lançar **sem** o rastreio em segundo plano
  (mantém "onde estou" manual, que usa localização só com o app aberto —
  não precisa dessa permissão). Aprova muito mais fácil e rápido.
- Manter e encarar a revisão (vídeo + texto explicando por que um app de
  turismo precisa rastrear em background). Mais risco e demora.

### ⚠️ 0.2 Regra dos 20 testadores (contas novas)
Desde nov/2023, **conta de desenvolvedor pessoal nova** precisa rodar um
**teste fechado com no mínimo 20 testadores por 14 dias seguidos** antes
de poder publicar em produção. Ou seja: **comece o teste fechado o quanto
antes** — os 14 dias correm em paralelo com o resto.

### 0.3 Nome, ícone e conta
- Nome na loja: **Desbrava** (confira se não há conflito de marca).
- E-mail de contato público (aparece na loja).

---

## Fase 1 — Conta Google Play Console  (**Você**)
1. [play.google.com/console](https://play.google.com/console) → criar
   conta de desenvolvedor → **taxa única de US$ 25**.
2. Tipo: **Pessoal** (ou Organização, se for abrir CNPJ depois).
3. Verificação de identidade (documento) — pode levar alguns dias.

## Fase 2 — Build de produção assinado  (**Claude** prepara, **Você** guarda a chave)
A Play Store **não aceita o APK de debug**. Precisa de um **AAB (Android
App Bundle) assinado**. Passos:
1. **Claude:** gerar uma **keystore de upload** (`keytool`) e configurar
   a assinatura em `android/app/build.gradle`. ⚠️ **A keystore + as senhas
   você guarda pra sempre e em segredo** (sem ela, não dá pra atualizar o
   app depois). Fica FORA do Git.
2. **Claude:** `./gradlew bundleRelease` → gera o `.aab`.
3. **Você:** ativar o **Play App Signing** (o Google guarda a chave final;
   você sobe só a de upload) — é o padrão, aceite quando aparecer.

## Fase 3 — Ficha da loja (assets)  (**Claude** ajuda a gerar / **Você** aprova)
- **Ícone:** 512×512 PNG (temos a logo — dá pra exportar).
- **Gráfico de destaque:** 1024×500 (banner do topo).
- **Screenshots:** mín. 2 (telefone), ideal 4–8 — dá pra tirar do app.
- **Descrição curta** (80 caracteres) e **completa** (até 4000).
- Categoria (ex: Viagens e local), tags.

## Fase 4 — Políticas e formulários  (**Você** preenche, **Claude** orienta)
- ⚠️ **Política de privacidade** (URL pública): já temos `privacidade.html`
  — precisa estar no ar (GitHub Pages/Netlify) e com o conteúdo certo.
- **Data safety** (Segurança dos dados): declarar que coleta e-mail,
  localização, fotos (posts) etc. Tem que bater com o que o app faz.
- **Classificação de conteúdo** (questionário) → provável Livre/10+.
- **Público-alvo e conteúdo:** definir faixa etária.
- ⚠️ **Anúncios:** declarar que o app **contém anúncios** (AdSense/AdMob).
- **Permissões sensíveis:** justificar localização (e background, se ficar).

## Fase 5 — Trilhas de teste  (**Você** convida, ambos acompanham)
1. **Teste interno** (até 100 pessoas, ativa na hora) — pra você validar o
   AAB instalando pela Play.
2. ⚠️ **Teste fechado** com **20+ testadores por 14 dias** (obrigatório
   pra conta nova) — junte 20 e-mails (amigos/família) e mantenha ativos.
3. **Teste aberto** (opcional) — qualquer um entra por link.

## Fase 6 — Produção
- Depois dos 14 dias de teste fechado, solicitar **acesso à produção**.
- Enviar pra revisão. Primeira revisão costuma levar de **alguns dias a
  ~2 semanas**.

---

## O que muda no código pra produção (resumo técnico)
- Assinatura release (keystore) — **Claude** configura.
- `versionCode`/`versionName` sobem a cada envio (já seguimos isso).
- Revisar permissões no `AndroidManifest.xml` (tirar background se for a
  decisão da Fase 0).
- Fotos continuam no **Drive** por enquanto (ver `BLAZE.md`); nada disso
  bloqueia a Play Store.
- App Check (recomendado antes de abrir ao público) — ver `BLAZE.md`.

## Ordem sugerida (o caminho mais rápido)
1. Decidir a Fase 0 (background location: tirar ou manter).
2. Criar a conta (Fase 1) — enquanto a verificação corre.
3. Claude gera keystore + AAB (Fase 2).
4. Subir no teste interno, depois **abrir o teste fechado com 20 pessoas
   JÁ** (os 14 dias contam a partir daí).
5. Enquanto os 14 dias correm: ficha da loja + formulários (Fases 3–4).
6. Produção (Fase 6).
