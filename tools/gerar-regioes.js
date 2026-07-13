/**
 * Gera data/regioes.json: 8 regioes de governo do RJ (CEPERJ) com o
 * codigo IBGE de cada municipio, cruzando com data/rj-municipios.geojson.
 * Fonte: CEPERJ (Mapa das Regioes de Governo e Municipios do Estado
 * do Rio de Janeiro - 2019) + Lei Complementar 105/2002 (Costa Verde).
 *
 * Uso: node tools/gerar-regioes.js
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const GEOJSON = path.join(RAIZ, "data", "rj-municipios.geojson");
const SAIDA = path.join(RAIZ, "data", "regioes.json");

const geojson = JSON.parse(fs.readFileSync(GEOJSON, "utf8"));
const nomeParaId = {};
geojson.features.forEach((f) => { nomeParaId[f.properties.name] = f.properties.id; });

const regioes = {
  "costa-verde": {
    nome: "Região da Costa Verde",
    municipios: ["Angra dos Reis", "Itaguaí", "Mangaratiba", "Paraty"],
  },
  "metropolitana": {
    nome: "Região Metropolitana",
    municipios: [
      "Belford Roxo", "Duque de Caxias", "Guapimirim", "Itaboraí", "Japeri",
      "Magé", "Maricá", "Mesquita", "Nilópolis", "Niterói", "Nova Iguaçu",
      "Paracambi", "Queimados", "Rio de Janeiro", "São Gonçalo",
      "São João de Meriti", "Seropédica", "Tanguá",
    ],
  },
  "serrana": {
    nome: "Região Serrana",
    municipios: [
      "Bom Jardim", "Cantagalo", "Carmo", "Cordeiro", "Duas Barras", "Macuco",
      "Nova Friburgo", "Petrópolis", "Santa Maria Madalena",
      "São José do Vale do Rio Preto", "São Sebastião do Alto", "Sumidouro",
      "Teresópolis", "Trajano de Moraes",
    ],
  },
  "baixadas-litoraneas": {
    nome: "Região das Baixadas Litorâneas",
    municipios: [
      "Araruama", "Armação dos Búzios", "Arraial do Cabo", "Cabo Frio",
      "Cachoeiras de Macacu", "Casimiro de Abreu", "Iguaba Grande",
      "Rio Bonito", "Rio das Ostras", "São Pedro da Aldeia", "Saquarema",
      "Silva Jardim",
    ],
  },
  "norte-fluminense": {
    nome: "Região Norte Fluminense",
    municipios: [
      "Campos dos Goytacazes", "Carapebus", "Cardoso Moreira",
      "Conceição de Macabu", "Macaé", "Quissamã", "São Fidélis",
      "São Francisco de Itabapoana", "São João da Barra",
    ],
  },
  "noroeste-fluminense": {
    nome: "Região Noroeste Fluminense",
    municipios: [
      "Aperibé", "Bom Jesus do Itabapoana", "Cambuci", "Italva", "Itaocara",
      "Itaperuna", "Laje do Muriaé", "Miracema", "Natividade", "Porciúncula",
      "Santo Antônio de Pádua", "São José de Ubá", "Varre-Sai",
    ],
  },
  "centro-sul-fluminense": {
    nome: "Região Centro-Sul Fluminense",
    municipios: [
      "Areal", "Comendador Levy Gasparian", "Engenheiro Paulo de Frontin",
      "Mendes", "Miguel Pereira", "Paraíba do Sul", "Paty do Alferes",
      "Sapucaia", "Três Rios", "Vassouras",
    ],
  },
  "medio-paraiba": {
    nome: "Região do Médio Paraíba",
    municipios: [
      "Barra do Piraí", "Barra Mansa", "Itatiaia", "Pinheiral", "Piraí",
      "Porto Real", "Quatis", "Resende", "Rio Claro", "Rio das Flores",
      "Valença", "Volta Redonda",
    ],
  },
};

const saida = {};
let totalMunicipios = 0;
const idsUsados = new Set();

for (const [regiaoId, dados] of Object.entries(regioes)) {
  const ids = dados.municipios.map((nome) => {
    const id = nomeParaId[nome];
    if (!id) throw new Error(`Municipio nao encontrado no geojson: ${nome}`);
    if (idsUsados.has(id)) throw new Error(`Municipio duplicado entre regioes: ${nome}`);
    idsUsados.add(id);
    return id;
  });
  totalMunicipios += ids.length;
  saida[regiaoId] = { nome: dados.nome, municipios: ids };
}

fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 2) + "\n", "utf8");
console.log("Total de regioes:", Object.keys(saida).length);
console.log("Total de municipios cobertos:", totalMunicipios, "(esperado: 92)");
console.log("Total de municipios no geojson:", geojson.features.length);
