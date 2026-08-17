/**
 * Confere se cada ponto turístico com coordenada cai DENTRO do polígono
 * do próprio município.
 *
 *   node tools/conferir-coordenadas.js          (só os problemas)
 *   node tools/conferir-coordenadas.js --tudo   (lista todos)
 *
 * POR QUE EXISTE: as coordenadas vieram de geocodificação por nome, e
 * nome de lugar se repete pelo estado inteiro. Um "Praça da Matriz"
 * procurado sem âncora cai na Praça da Matriz de outra cidade, e o
 * marcador aparece no mapa a 200 km de onde deveria.
 *
 * O teste é o mais duro que dá pra fazer sozinho: ponto-em-polígono
 * contra a malha do IBGE (`data/rj-municipios.geojson`). Se cair fora,
 * o script diz EM QUAL município a coordenada realmente está -- e essa
 * informação costuma explicar o erro na hora (o homônimo fica quase
 * sempre no município vizinho ou na capital).
 *
 * O que ele NÃO pega: coordenada errada DENTRO do município certo.
 * Para essas, a saída marca as que estão longe do centro do município
 * como "conferir", mas a palavra final é de quem conhece o lugar.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const destinos = JSON.parse(
  fs.readFileSync(path.join(RAIZ, "data", "destinos.json"), "utf8"),
);
const malha = JSON.parse(
  fs.readFileSync(path.join(RAIZ, "data", "rj-municipios.geojson"), "utf8"),
);

/** Um município pode ser Polygon ou MultiPolygon; normaliza pra lista de anéis. */
function aneisDe(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

const poligonos = new Map();
for (const f of malha.features) {
  poligonos.set(String(f.properties.id), {
    nome: f.properties.name,
    aneis: aneisDe(f.geometry),
  });
}

/** Ray casting. O primeiro anel é o contorno; os seguintes são buracos. */
function dentroDoAnel(lon, lat, anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    const cruza =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

function dentroDoMunicipio(lon, lat, aneis) {
  // Sem distinção de buraco: a malha do IBGE não tem enclave no RJ, e
  // tratar todo anel como contorno evita falso negativo em ilha.
  return aneis.some((anel) => dentroDoAnel(lon, lat, anel));
}

/** Em qual município do estado essa coordenada cai, se em algum. */
function ondeCai(lon, lat) {
  for (const [id, p] of poligonos) {
    if (dentroDoMunicipio(lon, lat, p.aneis)) return { id, nome: p.nome };
  }
  return null;
}

/** Centro aproximado (média dos vértices do maior anel) e raio de referência. */
function centroERaio(aneis) {
  let maior = aneis[0];
  for (const a of aneis) if (a.length > maior.length) maior = a;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of maior) {
    sx += x;
    sy += y;
  }
  const cx = sx / maior.length;
  const cy = sy / maior.length;
  let raio = 0;
  for (const [x, y] of maior) {
    const d = distanciaKm(cx, cy, x, y);
    if (d > raio) raio = d;
  }
  return { cx, cy, raio };
}

function distanciaKm(lon1, lat1, lon2, lat2) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const fora = [];
const foraDoEstado = [];
const dentro = [];

for (const [municipioId, municipio] of Object.entries(destinos)) {
  const poligono = poligonos.get(municipioId);
  if (!poligono) {
    console.log(`!! sem polígono para ${municipioId} (${municipio.nome})`);
    continue;
  }
  const { cx, cy, raio } = centroERaio(poligono.aneis);

  for (const ponto of municipio.destinos || []) {
    if (typeof ponto.lat !== "number" || typeof ponto.lon !== "number") continue;

    const registro = {
      id: ponto.id,
      cidade: municipio.nome,
      ponto: ponto.nome,
      lat: ponto.lat,
      lon: ponto.lon,
      geo: ponto._geo || "(colado à mão)",
      distancia: distanciaKm(cx, cy, ponto.lon, ponto.lat),
      raio,
    };

    if (dentroDoMunicipio(ponto.lon, ponto.lat, poligono.aneis)) {
      dentro.push(registro);
    } else {
      const real = ondeCai(ponto.lon, ponto.lat);
      registro.caiEm = real;
      (real ? fora : foraDoEstado).push(registro);
    }
  }
}

const total = fora.length + foraDoEstado.length + dentro.length;
console.log(`CONFERENCIA DE COORDENADAS -- ${total} pontos com coordenada\n`);
console.log(`  ${String(dentro.length).padStart(3)}  DENTRO do municipio certo`);
console.log(`  ${String(fora.length).padStart(3)}  FORA -- caem em OUTRO municipio do RJ`);
console.log(`  ${String(foraDoEstado.length).padStart(3)}  FORA do estado inteiro`);

if (foraDoEstado.length) {
  console.log(`\n${"=".repeat(70)}`);
  console.log("FORA DO ESTADO -- erro grosseiro:");
  console.log("=".repeat(70));
  for (const r of foraDoEstado) {
    console.log(`  ${r.cidade} / ${r.ponto}`);
    console.log(`     ${r.lat}, ${r.lon}  |  origem: ${r.geo}`);
  }
}

if (fora.length) {
  console.log(`\n${"=".repeat(70)}`);
  console.log("EM OUTRO MUNICIPIO -- provavel homonimo:");
  console.log("=".repeat(70));
  for (const r of fora) {
    console.log(`  ${r.cidade} / ${r.ponto}`);
    console.log(`     caiu em: ${r.caiEm.nome}  (${r.distancia.toFixed(1)} km do centro de ${r.cidade})`);
    console.log(`     origem: ${r.geo}`);
  }
}

// Dentro do município certo mas perto da borda extrema: vale um olhar,
// principalmente quando o nome do ponto é genérico.
const suspeitos = dentro
  .filter((r) => r.distancia > r.raio * 0.75)
  .sort((a, b) => b.distancia / b.raio - a.distancia / a.raio);

if (suspeitos.length) {
  console.log(`\n${"=".repeat(70)}`);
  console.log("DENTRO, mas na borda do municipio -- conferir:");
  console.log("=".repeat(70));
  for (const r of suspeitos) {
    console.log(`  ${r.cidade} / ${r.ponto}  (${r.distancia.toFixed(1)} km do centro, borda a ${r.raio.toFixed(1)})`);
    console.log(`     origem: ${r.geo}`);
  }
}

if (process.argv.includes("--tudo")) {
  console.log(`\n${"=".repeat(70)}`);
  console.log("TODOS OS QUE ESTAO DENTRO:");
  console.log("=".repeat(70));
  let atual = "";
  for (const r of dentro) {
    if (r.cidade !== atual) {
      atual = r.cidade;
      console.log(`\n  ${atual}`);
    }
    console.log(`     ${r.ponto}  (${r.distancia.toFixed(1)} km do centro)`);
  }
}
