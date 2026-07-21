/**
 * Gera os ícones de launcher do app Android a partir da logo do
 * Desbrava (assets/icons/desbrava-icone.png -- fundo preto, "DESBRAVA"
 * em branco). Roda depois de qualquer mudança na logo:
 *
 *   node tools/gerar-icone-android.js
 *
 * Produz, em cada densidade de android/app/src/main/res/mipmap-*:
 *  - ic_launcher.png / ic_launcher_round.png  (ícone legado, Android 7-)
 *  - ic_launcher_foreground.png               (camada do ícone adaptativo)
 * e deixa o fundo do ícone adaptativo PRETO (values/ic_launcher_background.xml)
 * pra casar com a identidade da logo.
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const ORIGEM = path.join(RAIZ, "assets/icons/desbrava-icone.png");
const RES = path.join(RAIZ, "android/app/src/main/res");

// tamanho do ícone legado (px) por densidade
const LEGADO = { "mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96, "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192 };
// tamanho da camada de frente do ícone adaptativo (px) por densidade
const FRENTE = { "mipmap-mdpi": 108, "mipmap-hdpi": 162, "mipmap-xhdpi": 216, "mipmap-xxhdpi": 324, "mipmap-xxxhdpi": 432 };
// fração do canvas ocupada pela logo na camada de frente (o resto é a
// "zona segura" que a máscara circular/arredondada pode cortar)
const ESCALA_FRENTE = 0.72;

function mascaraCirculo(tam) {
  const r = tam / 2;
  return Buffer.from(
    `<svg width="${tam}" height="${tam}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`
  );
}

async function gerar() {
  if (!fs.existsSync(ORIGEM)) {
    console.error("Logo não encontrada em", ORIGEM);
    process.exit(1);
  }

  for (const [dir, tam] of Object.entries(LEGADO)) {
    const destino = path.join(RES, dir);
    if (!fs.existsSync(destino)) continue;

    // quadrado (fundo preto pra não vazar transparência nas quinas)
    const quadrado = await sharp(ORIGEM)
      .resize(tam, tam, { fit: "cover" })
      .flatten({ background: "#000000" })
      .png()
      .toBuffer();
    await sharp(quadrado).toFile(path.join(destino, "ic_launcher.png"));

    // redondo (mesma arte, recortada num círculo)
    await sharp(quadrado)
      .composite([{ input: mascaraCirculo(tam), blend: "dest-in" }])
      .png()
      .toFile(path.join(destino, "ic_launcher_round.png"));

    // camada de frente do adaptativo: logo reduzida e centralizada num
    // canvas transparente (o fundo preto vem do ic_launcher_background)
    const tamFrente = FRENTE[dir];
    const logo = Math.round(tamFrente * ESCALA_FRENTE);
    const logoPng = await sharp(ORIGEM).resize(logo, logo, { fit: "contain", background: "#00000000" }).png().toBuffer();
    await sharp({
      create: { width: tamFrente, height: tamFrente, channels: 4, background: "#00000000" },
    })
      .composite([{ input: logoPng, gravity: "center" }])
      .png()
      .toFile(path.join(destino, "ic_launcher_foreground.png"));

    console.log("  ok", dir);
  }

  // fundo do ícone adaptativo -> preto
  const bg = path.join(RES, "values/ic_launcher_background.xml");
  if (fs.existsSync(bg)) {
    let xml = fs.readFileSync(bg, "utf8");
    xml = xml.replace(/(name="ic_launcher_background">)#[0-9A-Fa-f]{6,8}(<)/, "$1#000000$2");
    fs.writeFileSync(bg, xml);
    console.log("  ok fundo adaptativo -> #000000");
  }

  console.log("Ícones do Desbrava gerados.");
}

gerar().catch((e) => {
  console.error(e);
  process.exit(1);
});
