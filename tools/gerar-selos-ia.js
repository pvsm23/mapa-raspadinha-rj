/**
 * Gera os selos que faltam pela API do Gemini.
 *
 * A CHAVE NUNCA ENTRA NESTE ARQUIVO -- o repositório é público. Ela
 * vem da variável de ambiente GEMINI_API_KEY:
 *
 *   $env:GEMINI_API_KEY = "sua-chave"
 *   node tools/gerar-selos-ia.js 3303807
 *   node tools/gerar-selos-ia.js --todos
 *
 * SAÍDA: tudo cai em Selos/gerados/, NUNCA direto em assets/img/selos.
 * O Paulo revisa antes de publicar; aprovar é mover o arquivo (ver
 * tools/aprovar-selos.js).
 *
 * Só gera COLORIDO e DOURADO. O preto e branco sai de graça do
 * colorido, por filtro, em tools/gerar-fundo-selos.js -- e tem que
 * sair de lá mesmo: ele é a capa da raspadinha e precisa estar
 * alinhado pixel a pixel com o selo revelado.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const RAIZ = path.join(__dirname, "..");
const SELOS = path.join(RAIZ, "assets", "img", "selos");
const SAIDA = path.join(RAIZ, "Selos", "gerados");

// Selo do Rio: a referência de estilo de tudo. Traço, saturação e a
// moldura dourada saem daqui.
const REF_COLORIDA = path.join(SELOS, "3304557.webp");
const REF_DOURADA = path.join(SELOS, "3304557dourado.webp");

const MODELO = "gemini-3-pro-image";
const LADO = 768; // mesmo tamanho dos selos que já existem

const chave = process.env.GEMINI_API_KEY;
if (!chave) {
  console.error("Defina GEMINI_API_KEY no ambiente antes de rodar.");
  process.exit(1);
}

const destinos = JSON.parse(fs.readFileSync(path.join(RAIZ, "data", "destinos.json"), "utf8"));
const assuntos = carregarAssuntos();

/**
 * O que cada selo mostra. Um arquivo opcional (Selos/assuntos.json)
 * manda mais que o destinos.json: é lá que o Paulo escreve o cartão
 * postal da cidade quando o ponto turístico "oficial" não rende uma
 * imagem bonita -- caso comum nas cidades pequenas.
 */
function carregarAssuntos() {
  const arquivo = path.join(RAIZ, "Selos", "assuntos.json");
  return fs.existsSync(arquivo) ? JSON.parse(fs.readFileSync(arquivo, "utf8")) : {};
}

function assuntoDe(id) {
  if (assuntos[id]) return assuntos[id];
  const d = destinos[id];
  const primeiro = d?.destinos?.[0];
  if (!primeiro) return d?.nome || "";
  return `${primeiro.nome}, em ${d.nome} (RJ). ${primeiro.descricao}`;
}

function comoParte(arquivo) {
  return {
    inlineData: {
      mimeType: "image/webp",
      data: fs.readFileSync(arquivo).toString("base64"),
    },
  };
}

async function pedirImagem(partes) {
  const resposta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": chave, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: partes }] }),
    }
  );

  const corpo = await resposta.json();
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}: ${JSON.stringify(corpo).slice(0, 400)}`);

  const saida = corpo.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!saida) {
    // Recusa do modelo vem como texto, não como erro HTTP -- sem isto,
    // o script morreria com "undefined" e ninguém saberia o motivo.
    const texto = corpo.candidates?.[0]?.content?.parts?.map((p) => p.text).join(" ");
    throw new Error("Sem imagem na resposta. " + (texto || JSON.stringify(corpo).slice(0, 300)));
  }
  return Buffer.from(saida.inlineData.data, "base64");
}

async function salvar(buffer, alvo) {
  await sharp(buffer).resize(LADO, LADO, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .webp({ quality: 92 })
    .toFile(alvo);
}

async function gerarColorido(id) {
  const alvo = path.join(SAIDA, `${id}.webp`);
  const prompt =
    "Use a imagem anexada apenas como referência de ESTILO, nunca de conteúdo. " +
    "Crie um selo circular no mesmo estilo de ilustração flat/cartoon: mesmo tipo de traço, " +
    "mesma saturação de cores, mesmo contorno preto e a mesma moldura dourada circular, " +
    "sobre fundo transparente, formato quadrado 1x1. " +
    `O selo deve mostrar: ${assuntoDe(id)}. ` +
    "Não escreva texto, letras ou números em nenhuma parte da imagem.";

  const buffer = await pedirImagem([comoParte(REF_COLORIDA), { text: prompt }]);
  await salvar(buffer, alvo);
  return alvo;
}

async function gerarDourado(id) {
  const colorido = path.join(SAIDA, `${id}.webp`);
  const alvo = path.join(SAIDA, `${id}dourado.webp`);
  const prompt =
    "A primeira imagem é a referência de ESTILO: uma medalha de ouro maciço em alto-relevo. " +
    "A segunda imagem é o CONTEÚDO. Recrie o conteúdo da segunda imagem como uma medalha " +
    "dourada idêntica em estilo à primeira: ouro polido, relevo esculpido, mesmas sombras e " +
    "brilhos, mesma moldura circular, fundo transparente, quadrado 1x1. " +
    "Mantenha exatamente os mesmos elementos e a mesma composição da segunda imagem. " +
    "Não escreva texto, letras ou números.";

  const buffer = await pedirImagem([comoParte(REF_DOURADA), comoParte(colorido), { text: prompt }]);
  await salvar(buffer, alvo);
  return alvo;
}

(async () => {
  fs.mkdirSync(SAIDA, { recursive: true });
  const existentes = new Set(fs.readdirSync(SELOS));
  const jaGerados = new Set(fs.readdirSync(SAIDA));

  const pedidos = process.argv.filter((a) => /^\d{7}$/.test(a));
  const todos = process.argv.includes("--todos");

  const ids = (pedidos.length ? pedidos : Object.keys(destinos)).filter((id) => {
    if (pedidos.length) return true;
    if (!todos) return false;
    // Retomável: pula o que já existe, publicado ou aguardando revisão.
    return !existentes.has(`${id}.webp`) || !existentes.has(`${id}dourado.webp`);
  });

  if (!ids.length) {
    console.log("Nada a gerar. Use --todos ou passe códigos IBGE.");
    return;
  }

  let ok = 0;
  for (const id of ids) {
    const nome = destinos[id]?.nome || id;
    try {
      if (!existentes.has(`${id}.webp`) && !jaGerados.has(`${id}.webp`)) {
        await gerarColorido(id);
        console.log(`  ${nome}: colorido`);
      }
      if (!existentes.has(`${id}dourado.webp`) && !jaGerados.has(`${id}dourado.webp`)) {
        await gerarDourado(id);
        console.log(`  ${nome}: dourado`);
      }
      ok++;
    } catch (erro) {
      // Uma cidade que falha não pode derrubar as outras 50.
      console.error(`  ${nome}: FALHOU -- ${erro.message}`);
    }
  }
  console.log(`\n${ok}/${ids.length} municípios prontos em Selos/gerados/`);
})();
