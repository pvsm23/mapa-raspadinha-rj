/**
 * Gera os icones do PWA (assets/icons/) em PNG simples (fundo escuro
 * arredondado + circulo verde), sem depender de canvas: desenha pixel
 * a pixel e empacota como PNG manualmente (IHDR/IDAT/IEND).
 *
 * Uso: node tools/gerar-icones.js
 * Placeholder ate existir uma arte de verdade para o app.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData), 0);
  return Buffer.concat([len, typeData, crc]);
}

function gerarIcone(tamanho, arquivoSaida, semTransparencia = false) {
  const raio = tamanho * 0.18; // raio do arredondado do quadrado de fundo
  const cx = tamanho / 2;
  const cy = tamanho / 2;
  const raioCirculo = tamanho * 0.32;

  const corFundo = [15, 23, 42]; // #0f172a
  const corCirculo = [34, 197, 94]; // #22c55e

  function dentroDoQuadradoArredondado(x, y) {
    // distancia ao "quadrado com cantos arredondados": fora das faixas
    // de canto, e dentro do circulo de raio `raio` perto dos cantos
    const dx = Math.max(raio - x, 0, x - (tamanho - raio));
    const dy = Math.max(raio - y, 0, y - (tamanho - raio));
    if (dx === 0 || dy === 0) return true;
    return dx * dx + dy * dy <= raio * raio;
  }

  const rowSize = 1 + tamanho * 4; // 1 byte de filtro + RGBA por pixel
  const raw = Buffer.alloc(rowSize * tamanho);

  for (let y = 0; y < tamanho; y++) {
    raw[y * rowSize] = 0; // filtro "none"
    for (let x = 0; x < tamanho; x++) {
      const off = y * rowSize + 1 + x * 4;
      const dentro = semTransparencia || dentroDoQuadradoArredondado(x, y);
      const distCirculo = Math.hypot(x - cx, y - cy);
      let cor;
      let alpha = 255;
      if (!dentro) {
        alpha = 0;
        cor = [0, 0, 0];
      } else if (distCirculo <= raioCirculo) {
        cor = corCirculo;
      } else {
        cor = corFundo;
      }
      raw[off] = cor[0];
      raw[off + 1] = cor[1];
      raw[off + 2] = cor[2];
      raw[off + 3] = alpha;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idatData = zlib.deflateSync(raw);

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  fs.mkdirSync(path.dirname(arquivoSaida), { recursive: true });
  fs.writeFileSync(arquivoSaida, png);
  console.log(`OK: ${arquivoSaida} (${tamanho}x${tamanho}, ${(png.length / 1024).toFixed(1)} KB)`);
}

const raizProjeto = path.join(__dirname, "..");
gerarIcone(192, path.join(raizProjeto, "assets", "icons", "icon-192.png"));
gerarIcone(512, path.join(raizProjeto, "assets", "icons", "icon-512.png"));
gerarIcone(180, path.join(raizProjeto, "assets", "icons", "apple-touch-icon.png"), true);
