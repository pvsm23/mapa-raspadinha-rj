# Firebase Blaze, limites e custos — plano do Desbrava

Documento de referência pra decidir **quando e como** ligar o plano
Blaze sem sustos de cobrança. Enquanto isso não acontece, o app fica no
**Spark (grátis)**. Status: **só planejamento** (nada de billing ligado).

## A verdade principal (leia antes de tudo)

1. **App nenhum garante limite de custo do Firebase pelo código.** As
   leituras/gravações acontecem no servidor; um cliente modificado
   ignora qualquer trava feita no app. Trava no app é **camada de UX**,
   não garantia financeira.
2. **No Spark (grátis) é IMPOSSÍVEL te cobrarem.** Ao bater o limite, o
   serviço **para** até o mês virar. Zero conta pra pagar.
3. **No Blaze você paga o que passar do grátis.** A proteção real contra
   susto é um **Orçamento no Google Cloud + alertas** e, opcional, uma
   **função que desliga o faturamento** ao estourar o teto.

➡️ Conclusão: enquanto o objetivo for "lançar sem risco de cobrança",
**ficar no Spark é o certo**. Só vá pro Blaze quando precisar de um
recurso que só existe lá (hoje: Cloud Storage) — e aí com orçamento.

## O que o Desbrava usa hoje (mapa de consumo)

| Recurso Firebase | Usa? | Observação |
|---|---|---|
| **Cloud Firestore** | ✅ muito | progresso, ranking, posts (metadados), amigos, sugestões |
| **Authentication** (e-mail/senha) | ✅ | 50k usuários/mês grátis — folgado |
| **Cloud Storage** | ❌ | fotos vão pro **Google Drive** (via Apps Script) justamente pra não precisar do Blaze |
| **Realtime Database** | ❌ | não usado (tudo é Firestore) |
| **Cloud Functions** | ❌ | não usado (usamos Apps Script, fora do Firebase) |
| **Hosting** | ❌ | site fica no GitHub Pages / Netlify |
| **Phone Auth (SMS)** | ❌ | **evitar** — é o que mais cobra |
| **Test Lab** | ❌ | não usado |

**O maior gerador de custo, se um dia migrar, é foto (Storage) e o
volume de leituras/gravações do Firestore (feed social).**

## Limites do plano grátis (referência — números do Paulo)

> No Spark isso é teto (serviço para). No Blaze é o que vem de graça
> antes de começar a cobrar. Valores por **mês**, salvo indicado.

1. **Firestore** — 1 GiB armazenamento · 600k gravações · 1,5 mi leituras · 600k exclusões (por dia, no caso do Firestore são cotas **diárias**)
2. **Realtime Database** — 1 GB armazenado · 10 GB transferência
3. **Auth** — 50.000 MAU (sem SAML/OIDC) · 50 MAU (SAML/OIDC) · Phone Auth cobrado por SMS
4. **Cloud Storage** — 5 GB armazenado · 30 GB download · 2,1 mi operações
5. **Cloud Functions** — 2 mi invocações · 400k GB-s · 200k CPU-s · 5 GB rede
6. **Hosting** — 10 GB armazenado · 10 GB transferência
7. **Test Lab** — 1h/dia virtual · 30 min/dia físico

## Passo a passo pra ir pro Blaze COM segurança (quando decidir)

1. **Só o projeto Desbrava:** Firebase Console → ⚙️ → *Uso e faturamento*
   → *Detalhes e configurações* → **Modificar plano → Blaze**. Escolha
   (ou crie) uma conta de faturamento **só pra esse projeto**.
2. **Orçamento + alertas** (o que te protege de verdade):
   Google Cloud Console → *Billing → Budgets & alerts → Create budget* →
   valor baixo (ex: **R$ 20**) → alertas em 50/90/100%. Isso **avisa**,
   não bloqueia sozinho.
3. **Trava real (opcional, recomendado):** uma Cloud Function que
   escuta o tópico de orçamento (Pub/Sub) e **desabilita o faturamento**
   do projeto ao bater 100% — aí vira "para de funcionar" em vez de
   "continua cobrando". (Guia oficial: "disable billing to stop usage".)
4. **App Check** (Play Integrity / reCAPTCHA): impede bots de inflarem
   seu Firestore/Storage. Ligar antes de abrir ao público.
5. **Regras do Firestore/Storage estritas** (já temos boas regras; só
   revisar Storage se voltar a usar).

## O que muda / migra quando/se for pro Blaze

- **Fotos (Drive → Storage):** opcional. Voltar pro Firebase Storage
  deixa tudo num lugar só, mas passa a consumir a cota de Storage
  (5 GB / 30 GB download / 2,1 mi ops). **Recomendação: manter no Drive**
  até ter receita — é grátis e já funciona.
- **App Check** novo (ligar).
- **Orçamento + trava** (itens 2 e 3 acima).
- Continuar **sem** Phone Auth e **sem** Cloud Functions pagas.

## Recursos in-app planejados (implementar quando o Paulo mandar)

Combinado: fazer isso no app, editável por você, com aviso ao usuário.
Feito de forma **honesta** (é UX, não garantia de custo):

- **`configuracoes/limites`** (Firestore): guarda os números acima,
  **editáveis no painel de Admin**. Você afrouxa aos poucos conforme
  for lucrando.
- **Tela "Limites do plano grátis"** no app: mostra os números + explica
  que é um projeto pequeno se sustentando.
- **Aviso de doação ao atingir limite:** controlado por
  `configuracoes/global.modoLimite` (você liga no Admin quando vir o uso
  subindo no console) → mostra a todos um banner "estamos no limite,
  ajude com uma doação 💚" apontando pra sua chave PIX. Design
  **dono-controlado** de propósito: o app não tem como medir sozinho e
  de forma confiável o uso real do Firebase, então quem decide é você,
  vendo os números no console — sem fingir automação que enganaria.
- (Avançado, só no Blaze) trava suave no maior vetor de custo (postar
  foto): contador mensal global + bloqueio + o mesmo aviso de doação.

Relacionado: `CLAUDE.md` (ordens gerais), `README.md` (regras do
Firestore).
