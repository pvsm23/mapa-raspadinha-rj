/**
 * Processa em lote uma pasta de selos novos, gerando as variações que
 * o app espera.
 *
 *   node tools/processar-selos.js
 *   node tools/processar-selos.js --entrada ./novos_selos --saida ./saida
 *
 * ============================================================
 * OS NOMES IMPORTAM -- o app procura exatamente estes
 * ============================================================
 *
 *   {id}.webp         a arte colorida (o original que você põe na pasta)
 *   {id}fundo.webp    a CAPA raspável, em preto e branco
 *   {id}dourado.webp  a versão dourada (raspou com sorte)
 *
 * Nada de `_bw` ou `_gold`: `resolverImagemColorida` em js/script.js
 * monta o caminho concatenando o sufixo, e um nome diferente
 * simplesmente não é encontrado -- o app cai no selo dinâmico sem
 * avisar ninguém.
 *
 * O `{id}` é o código IBGE de 7 dígitos (3301504 = Cordeiro). Se os
 * seus arquivos estiverem com o NOME da cidade, o script resolve pelo
 * data/destinos.json e renomeia sozinho.
 *
 * ============================================================
 * O DOURADO NAO SAI DAQUI
 * ============================================================
 *
 * Decisao do Paulo (17/08/2026), confirmando o que
 * tools/gerar-fundo-selos.js ja registrava: o preto e branco pode ser
 * filtro, mas o DOURADO e feito por IA.
 *
 * O dourado dos 43 selos que existem e uma medalha em relevo, com luz
 * propria -- filtro nenhum reproduz aquilo. Cheguei a implementar uma
 * aproximacao por duotone aqui e foi descartada na comparacao lado a
 * lado: passava longe do estilo.
 *
 * Quem faz o dourado: tools/gerar-selos-ia.js, que usa o selo do Rio
 * (3304557) como referencia de traco e moldura.
 *
 * ============================================================
 * ONDE CADA COISA MORA
 * ============================================================
 *
 *   ESTE script          arte nova em lote -> {id}.webp + {id}fundo.webp
 *   gerar-fundo-selos.js so a capa P&B, dos selos JA em assets/
 *   gerar-selos-ia.js    colorido + dourado, por IA
 *   aprovar-selos.js     move de Selos/gerados/ pra assets/
 *
 * ============================================================
 * COMO RODAR
 * ============================================================
 *
 *   1. sharp já está no projeto (package.json). Se faltar:
 *        npm install sharp
 *   2. Ponha as artes coloridas em ./novos_selos
 *   3. node tools/processar-selos.js
 *   4. Confira a pasta de saída e mova para assets/img/selos/
 *
 * Por padrão ele NÃO sobrescreve assets/img/selos: escreve em
 * ./selos-processados, pra você conferir antes.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const RAIZ = path.join(__dirname, "..");

function argumento(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i !== -1 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : padrao;
}

const ENTRADA = argumento("--entrada", path.join(RAIZ, "novos_selos"));
const SAIDA = argumento("--saida", path.join(RAIZ, "selos-processados"));
const forcar = process.argv.includes("--forcar");

/* Nome da cidade -> código IBGE, pra aceitar "Cordeiro.png" além de
   "3301504.png". Acento e caixa são ignorados na comparação. */
const semAcento = (t) =>
  String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function mapaDeNomes() {
  const destinos = JSON.parse(
    fs.readFileSync(path.join(RAIZ, "data", "destinos.json"), "utf8")
  );
  const mapa = {};
  for (const [id, m] of Object.entries(destinos)) mapa[semAcento(m.nome)] = id;
  return mapa;
}

function resolverId(arquivo, mapa) {
  const base = path.basename(arquivo, path.extname(arquivo));
  if (/^\d{7}$/.test(base)) return base;
  const achado = mapa[semAcento(base)];
  if (achado) return achado;
  return null;
}

/**
 * Capa raspável: preto e branco de verdade.
 *
 * `grayscale` sozinho deixa a capa cinza-clara demais e o contraste com
 * o selo colorido revelado fica fraco -- a pessoa raspa e mal percebe a
 * diferença. O `linear` puxa o preto pra baixo e segura o branco,
 * ampliando a faixa. Mesma lógica do tools/gerar-fundo-selos.js.
 */
function versaoPretoEBranco(entrada) {
  return sharp(entrada)
    .grayscale()
    .linear(1.18, -14)
    .modulate({ brightness: 0.94 })
    .webp({ quality: 88 });
}

async function principal() {
  if (!fs.existsSync(ENTRADA)) {
    console.error(`A pasta de entrada não existe: ${ENTRADA}`);
    console.error("Crie ./novos_selos e ponha as artes coloridas lá, ou use --entrada <pasta>.");
    process.exit(1);
  }

  const mapa = mapaDeNomes();
  const arquivos = fs
    .readdirSync(ENTRADA)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    // Ignora o que o próprio script já produziu, se apontarem a saída
    // pra mesma pasta da entrada.
    .filter((f) => !/(fundo|dourado)\.(webp|png)$/i.test(f));

  if (!arquivos.length) {
    console.log(`Nenhuma imagem em ${ENTRADA}.`);
    return;
  }

  fs.mkdirSync(SAIDA, { recursive: true });

  let feitos = 0;
  const semId = [];

  for (const arquivo of arquivos) {
    const id = resolverId(arquivo, mapa);
    if (!id) {
      semId.push(arquivo);
      continue;
    }
    const entrada = path.join(ENTRADA, arquivo);

    const colorido = path.join(SAIDA, `${id}.webp`);
    if (forcar || !fs.existsSync(colorido)) {
      await sharp(entrada).webp({ quality: 90 }).toFile(colorido);
    }

    const fundo = path.join(SAIDA, `${id}fundo.webp`);
    if (forcar || !fs.existsSync(fundo)) {
      await versaoPretoEBranco(entrada).toFile(fundo);
    }

    feitos++;
    console.log(`  ok  ${arquivo}  ->  ${id}.webp + ${id}fundo.webp`);
  }

  console.log(`\n${feitos} selo(s) processado(s) em ${SAIDA}`);
  console.log("O dourado NAO sai daqui -- use tools/gerar-selos-ia.js (ver topo).");
  if (semId.length) {
    console.log(`\nNão consegui descobrir o município de ${semId.length} arquivo(s):`);
    semId.forEach((f) => console.log(`  - ${f}`));
    console.log("Renomeie para o código IBGE (ex. 3301504.png) ou para o nome exato da cidade.");
  }
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
