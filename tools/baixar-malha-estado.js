/**
 * Baixa a malha de municípios de um estado no IBGE, já normalizada e
 * pronta pro tools/geojson-municipios-to-svg.js.
 *
 *   node tools/baixar-malha-estado.js mg
 *   node tools/baixar-malha-estado.js sp --qualidade intermediaria
 *
 * Substitui o antigo normalizar-geojson-sp.js, que tinha "sp" escrito
 * no nome dos arquivos e exigia baixar a malha e os nomes à mão antes.
 *
 * ============================================================
 * QUALIDADE MÁXIMA, E POR QUÊ
 * ============================================================
 *
 * O RJ usa `qualidade=maxima` e fica com ~402 vértices por município.
 * O SP tinha sido baixado numa qualidade menor e ficou com 67 -- SEIS
 * VEZES menos detalhe. Dava pra ver a diferença a olho nu: as divisas
 * de SP viravam polígonos grosseiros ao aproximar, enquanto as do RJ
 * seguiam finas.
 *
 * Medi se dava pra simplificar sem perder nada visível no zoom máximo
 * (40x, onde 1 pixel de tela = 0,025 unidades do SVG): Douglas-Peucker
 * nessa tolerância corta só 1-2%. A malha do IBGE já vem no limite do
 * útil -- não existe versão "leve e detalhada".
 *
 * O preço é o tamanho:
 *
 *     RJ   92 mun    36.982 vert   0,5 MB   (185 KB comprimido)
 *     SP  645 mun   222.324 vert   3,0 MB   (~1,1 MB comprimido)
 *     MG  853 mun   401.746 vert   5,8 MB   (~1,9 MB comprimido)
 *
 * Por isso os estados grandes NÃO vão no APK: ficam no site e são
 * baixados sob demanda, pro CacheStorage (ver baixarMapaDoEstado em
 * js/script.js). O RJ continua embutido -- é o app principal e tem que
 * abrir sem rede.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const RAIZ = path.join(__dirname, "..");

const sigla = (process.argv[2] || "").toLowerCase();
const iQualidade = process.argv.indexOf("--qualidade");
const qualidade = iQualidade !== -1 ? process.argv[iQualidade + 1] : "maxima";

if (!/^[a-z]{2}$/.test(sigla)) {
  console.error("Uso: node tools/baixar-malha-estado.js <sigla>   (ex: mg)");
  process.exit(1);
}

/** Código IBGE do estado a partir da sigla (data/estados.json). */
function codigoDoEstado() {
  const estados = JSON.parse(
    fs.readFileSync(path.join(RAIZ, "data", "estados.json"), "utf8")
  );
  for (const [codigo, dados] of Object.entries(estados)) {
    if (String(dados.sigla).toLowerCase() === sigla) return { codigo, nome: dados.nome };
  }
  return null;
}

function pegar(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "DesbravaApp/0.26" } }, (resposta) => {
        // A API do IBGE redireciona em alguns endpoints.
        if (resposta.statusCode >= 300 && resposta.statusCode < 400 && resposta.headers.location) {
          resolve(pegar(resposta.headers.location));
          return;
        }
        if (resposta.statusCode !== 200) {
          reject(new Error(`HTTP ${resposta.statusCode} em ${url}`));
          return;
        }
        let corpo = "";
        resposta.setEncoding("utf8");
        resposta.on("data", (p) => (corpo += p));
        resposta.on("end", () => resolve(corpo));
      })
      .on("error", reject);
  });
}

const conta = (a) => (Array.isArray(a[0]) ? a.reduce((s, x) => s + conta(x), 0) : 1);

(async () => {
  const estado = codigoDoEstado();
  if (!estado) {
    console.error(`Sigla "${sigla}" não está em data/estados.json.`);
    process.exit(1);
  }
  console.log(`${estado.nome} (${estado.codigo}) -- qualidade ${qualidade}`);

  // 1. Malha
  const urlMalha =
    `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${estado.codigo}` +
    `?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=${qualidade}`;
  console.log("  baixando a malha...");
  const geojson = JSON.parse(await pegar(urlMalha));

  // 2. Nomes (a malha v3 só traz `codarea`)
  console.log("  baixando os nomes...");
  const urlNomes = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${estado.codigo}/municipios`;
  const nomes = JSON.parse(await pegar(urlNomes));
  const idParaNome = {};
  for (const m of nomes) idParaNome[String(m.id)] = m.nome;

  // 3. Normaliza pro formato que o resto do projeto espera
  let semNome = 0;
  for (const feature of geojson.features) {
    const codigo = String(feature.properties.codarea);
    const nome = idParaNome[codigo];
    if (!nome) {
      semNome++;
      continue;
    }
    feature.properties = { id: codigo, name: nome, description: nome };
  }

  const destino = path.join(RAIZ, "data", `${sigla}-municipios.geojson`);
  fs.writeFileSync(destino, JSON.stringify(geojson), "utf8");

  /* 4. Mesorregiões -> data/<sigla>-regioes.json
     A mesma resposta de nomes já traz microrregiao.mesorregiao.nome, então
     sai de graça. Antes isso era o tools/gerar-regioes-sp.js, com "sp"
     escrito no nome e dependendo de um data/sp-municipios-nomes.json que
     nem existe mais -- por isso MG saiu sem regiões na primeira geração.

     O "cor" é um índice estável (mesorregiões em ordem alfabética) que o
     SVG carrega em data-cor. NÃO sobrescreve um arquivo existente: as
     regiões do SP podem ter sido ajustadas à mão. */
  const porMeso = {};
  for (const m of nomes) {
    const meso = m.microrregiao?.mesorregiao?.nome || m.regiaoImediata?.regiaoIntermediaria?.nome;
    if (!meso) continue;
    (porMeso[meso] = porMeso[meso] || []).push(String(m.id));
  }
  const arquivoRegioes = path.join(RAIZ, "data", `${sigla}-regioes.json`);
  if (Object.keys(porMeso).length && !fs.existsSync(arquivoRegioes)) {
    const emSlug = (t) =>
      String(t)
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    const regioes = {};
    Object.keys(porMeso)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .forEach((nome, i) => {
        regioes[emSlug(nome)] = { nome, cor: i, municipios: porMeso[nome].sort() };
      });
    fs.writeFileSync(arquivoRegioes, JSON.stringify(regioes, null, 2) + "\n", "utf8");
    console.log(`  ${Object.keys(regioes).length} mesorregiões em ${arquivoRegioes}`);
  }

  /* 5. Arquivos de conteúdo vazios. O visualizador não os lê hoje, mas o
     gerador de SVG e o resto do app esperam o conjunto completo por
     estado -- criar vazio agora evita um ENOENT quando o estado sair do
     "em desenvolvimento". Nunca sobrescreve. */
  for (const nome of ["destinos", "curiosidades", "rotas"]) {
    const arquivo = path.join(RAIZ, "data", `${sigla}-${nome}.json`);
    if (!fs.existsSync(arquivo)) fs.writeFileSync(arquivo, "{}\n", "utf8");
  }

  let vertices = 0;
  for (const f of geojson.features) vertices += conta(f.geometry.coordinates);

  console.log(
    `\n  ${geojson.features.length} municípios, ` +
      `${vertices.toLocaleString("pt-BR")} vértices ` +
      `(${(vertices / geojson.features.length).toFixed(0)} por município)`
  );
  if (semNome) console.log(`  !! ${semNome} sem nome -- confira data/estados.json`);
  console.log(`  ${(fs.statSync(destino).size / 1048576).toFixed(1)} MB em ${destino}`);
  console.log(`\nAgora: node tools/geojson-municipios-to-svg.js ${sigla}`);
})().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
