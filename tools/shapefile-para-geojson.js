/**
 * Converte um shapefile (.shp + .dbf) em geojson no formato que o
 * tools/geojson-municipios-to-svg.js espera.
 *
 * Existe por causa do DISTRITO FEDERAL. O DF tem UM único município
 * (Brasília), então o caminho normal -- a API de malhas do IBGE por
 * município -- devolveria uma mancha só, sem divisão nenhuma. As
 * divisões reais do DF são as Regiões Administrativas (Plano Piloto,
 * Ceilândia, Taguatinga...), que o IBGE publica como SUBDISTRITOS.
 *
 * E subdistrito a API não serve: a v3 aceita só mesorregiao,
 * microrregiao e municipio, e a v2 devolve a mesma feature única.
 * A geometria existe apenas nos shapefiles do geoftp.
 *
 * Parser escrito à mão de propósito: o projeto não tem nenhuma
 * dependência de geo (só sharp, pra imagem), e puxar uma biblioteca
 * inteira pra ler 35 polígonos uma vez na vida não se paga. O formato
 * é simples e está todo documentado na especificação da ESRI.
 *
 * Uso:
 *   node tools/shapefile-para-geojson.js <base-sem-extensao> <saida.geojson> \
 *        [--id CAMPO] [--nome CAMPO]
 */
const fs = require("fs");

/* ---- .dbf (os atributos) ----
   Cabeçalho de 32 bytes, depois um descritor de 32 bytes por campo,
   terminado por 0x0D. Os registros vêm em seguida, cada um começando
   por um byte de "apagado". */
function lerDbf(caminho) {
  const b = fs.readFileSync(caminho);
  /* A codificação vem no .cpg ao lado, quando existe. NÃO dá pra fixar:
     o arquivo do DF de 2010 é latin1 e o do Brasil de 2022 é UTF-8 --
     ler um com a régua do outro estraga todo acento. */
  const cpg = caminho.replace(/.dbf$/i, ".cpg");
  const rotulo = fs.existsSync(cpg) ? fs.readFileSync(cpg, "utf8").trim().toLowerCase() : "";
  const codificacao = /utf-?8/.test(rotulo) ? "utf8" : "latin1";
  const nRegistros = b.readUInt32LE(4);
  const inicioRegistros = b.readUInt16LE(8);
  const tamanhoRegistro = b.readUInt16LE(10);

  const campos = [];
  for (let p = 32; b[p] !== 0x0d && p < inicioRegistros; p += 32) {
    campos.push({
      nome: b.toString("latin1", p, p + 11).replace(/\0.*$/, "").trim(),
      tamanho: b[p + 16],
    });
  }

  const linhas = [];
  for (let i = 0; i < nRegistros; i++) {
    let p = inicioRegistros + i * tamanhoRegistro + 1; // +1 pula o flag
    const linha = {};
    for (const c of campos) {
      linha[c.nome] = b.toString(codificacao, p, p + c.tamanho).trim();
      p += c.tamanho;
    }
    linhas.push(linha);
  }
  return linhas;
}

/* ---- .shp (a geometria) ----
   Cabeçalho de 100 bytes; depois registros com cabeçalho de 8 bytes
   (número e tamanho em WORDS de 16 bits, big-endian) e conteúdo em
   little-endian. Só interessam Polygon (5) e PolygonZ (15). */
function lerShp(caminho) {
  const b = fs.readFileSync(caminho);
  const fim = b.readInt32BE(24) * 2; // tamanho total, em bytes
  const formas = [];

  let p = 100;
  while (p < fim) {
    const tamanhoConteudo = b.readInt32BE(p + 4) * 2;
    const inicio = p + 8;
    const tipo = b.readInt32LE(inicio);

    if (tipo === 5 || tipo === 15 || tipo === 25) {
      const nPartes = b.readInt32LE(inicio + 36);
      const nPontos = b.readInt32LE(inicio + 40);
      const inicioPartes = inicio + 44;
      const inicioPontos = inicioPartes + nPartes * 4;

      const partes = [];
      for (let i = 0; i < nPartes; i++) partes.push(b.readInt32LE(inicioPartes + i * 4));

      const aneis = [];
      for (let i = 0; i < nPartes; i++) {
        const de = partes[i];
        const ate = i + 1 < nPartes ? partes[i + 1] : nPontos;
        const anel = [];
        for (let k = de; k < ate; k++) {
          anel.push([
            b.readDoubleLE(inicioPontos + k * 16),
            b.readDoubleLE(inicioPontos + k * 16 + 8),
          ]);
        }
        aneis.push(anel);
      }
      formas.push(aneis);
    } else {
      formas.push(null); // ponto/linha/nulo: não usamos
    }
    p = inicio + tamanhoConteudo;
  }
  return formas;
}

const base = process.argv[2];
const saida = process.argv[3];
if (!base || !saida) {
  console.error(
    "Uso: node tools/shapefile-para-geojson.js <base-sem-extensao> <saida.geojson> [--id CAMPO] [--nome CAMPO]"
  );
  process.exit(1);
}
const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i !== -1 ? process.argv[i + 1] : null;
};

const atributos = lerDbf(`${base}.dbf`);
const formas = lerShp(`${base}.shp`);
if (atributos.length !== formas.length) {
  console.error(`.dbf tem ${atributos.length} registros e .shp tem ${formas.length} formas.`);
  process.exit(1);
}

const colunas = Object.keys(atributos[0] || {});
const campoId = arg("--id") || colunas.find((c) => /^CD_/i.test(c)) || colunas[0];
const campoNome = arg("--nome") || colunas.find((c) => /^NM_SUBDIST|^NM_MUN|^NM_/i.test(c)) || colunas[1];
const filtro = arg("--filtro");
const [filtroCampo, filtroValor] = filtro ? filtro.split("=") : [];
console.log(`campos disponíveis: ${colunas.join(", ")}`);
console.log(`usando id="${campoId}" e nome="${campoNome}"`);

const features = [];
for (let i = 0; i < formas.length; i++) {
  if (!formas[i]) continue;
  if (filtroCampo && atributos[i][filtroCampo] !== filtroValor) continue;
  const nome = atributos[i][campoNome];
  features.push({
    type: "Feature",
    properties: { id: atributos[i][campoId], name: nome, description: nome },
    // Um shapefile guarda TODOS os anéis juntos, sem dizer quais são
    // ilhas e quais são buracos. O gerador de SVG trata cada anel como
    // um pedaço do território, que é o comportamento certo aqui.
    geometry: { type: "Polygon", coordinates: formas[i] },
  });
}

fs.writeFileSync(saida, JSON.stringify({ type: "FeatureCollection", features }), "utf8");
const vertices = features.reduce((s, f) => s + f.geometry.coordinates.reduce((t, a) => t + a.length, 0), 0);
console.log(
  `${features.length} feições, ${vertices.toLocaleString("pt-BR")} vértices -> ${saida}`
);
