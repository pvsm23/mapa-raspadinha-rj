/**
 * Gera o GUIA público do Desbrava — páginas HTML estáticas com
 * conteúdo real e legível (histórias das rotas, resumos dos 92
 * municípios e seus pontos turísticos), pra o robô do Google AdSense/
 * Busca conseguir ler sem precisar de login. Roda com:
 *   node tools/gerar-guia.js
 * e reescreve guia.html + guia/regiao-*.html + guia/rota-*.html +
 * sitemap.xml na raiz do repositório.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const rotas = JSON.parse(fs.readFileSync(path.join(RAIZ, "data/rotas.json"), "utf8"));
const destinos = JSON.parse(fs.readFileSync(path.join(RAIZ, "data/destinos.json"), "utf8"));
const curiosidades = JSON.parse(fs.readFileSync(path.join(RAIZ, "data/curiosidades.json"), "utf8"));
const regioes = JSON.parse(fs.readFileSync(path.join(RAIZ, "data/regioes.json"), "utf8"));

const BASE = "https://pvsm23.github.io/mapa-raspadinha-rj";
const CLIENT = "ca-pub-7585588467751471";

const esc = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// município -> região (nome), pra mostrar de onde é cada um
const munParaRegiao = {};
for (const [rid, r] of Object.entries(regioes)) {
  for (const m of r.municipios) munParaRegiao[m] = r.nome;
}

const nomeMun = (id) => (destinos[id] ? destinos[id].nome : id);

/**
 * Casca comum de toda página do guia: <head> com meta description,
 * robots index/follow, o script do AdSense e um CSS enxuto focado em
 * leitura; header com navegação e rodapé com link pro app.
 */
function pagina({ titulo, descricao, corpo, base = "", canonicalPath = "" }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${BASE}/${canonicalPath}">
<link rel="icon" href="${base ? "../" : ""}assets/icons/desbrava-icone.png">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}" crossorigin="anonymous"></script>
<style>
  :root { --bg:#20242b; --surf:#262b33; --text:#e7edf4; --muted:#aeb6c2; --accent:#8fd3f4; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system,system-ui,"Segoe UI",Roboto,sans-serif; line-height:1.65; }
  a { color:var(--accent); }
  header { background:var(--surf); padding:16px 20px; display:flex; flex-wrap:wrap; gap:12px 20px; align-items:center; justify-content:space-between; position:sticky; top:0; box-shadow:0 2px 12px rgba(0,0,0,.4); }
  header .logo { font-weight:900; letter-spacing:.12em; text-transform:uppercase; font-size:1.1rem; }
  header .logo b { color:var(--accent); }
  header nav a { margin-left:16px; font-size:.9rem; text-decoration:none; }
  main { max-width:760px; margin:0 auto; padding:28px 20px 60px; }
  h1 { font-size:1.9rem; line-height:1.2; text-wrap:balance; }
  h2 { font-size:1.35rem; margin-top:2.2em; border-bottom:1px solid rgba(255,255,255,.08); padding-bottom:.3em; }
  h3 { font-size:1.08rem; margin-top:1.6em; color:var(--accent); }
  p { margin:.8em 0; }
  .lead { color:var(--muted); font-size:1.05rem; }
  .tag { display:inline-block; font-size:.75rem; color:var(--accent); background:rgba(143,211,244,.1); padding:3px 10px; border-radius:99px; margin-bottom:8px; }
  ul.cards { list-style:none; padding:0; display:grid; gap:12px; }
  ul.cards li { background:var(--surf); border-radius:12px; padding:14px 16px; }
  ul.cards li a { font-weight:600; text-decoration:none; font-size:1.05rem; }
  ul.cards li p { margin:.3em 0 0; color:var(--muted); font-size:.9rem; }
  .destino { margin:0 0 14px; }
  .destino b { color:var(--text); }
  .voltar { display:inline-block; margin-top:8px; font-size:.9rem; }
  footer { border-top:1px solid rgba(255,255,255,.08); padding:28px 20px; text-align:center; color:var(--muted); font-size:.85rem; }
  footer a.app { display:inline-block; margin-top:8px; background:linear-gradient(145deg,var(--accent),#62b8e6); color:#0f2e3d; font-weight:700; text-decoration:none; padding:10px 20px; border-radius:12px; }
</style>
</head>
<body>
<header>
  <div class="logo">DES<b>BRAVA</b></div>
  <nav>
    <a href="${base ? "../" : ""}guia.html">Guia</a>
    <a href="${base ? "../" : ""}index.html">Abrir o mapa</a>
  </nav>
</header>
<main>
${corpo}
</main>
<footer>
  <p>Desbrava — explore os 92 municípios do Rio de Janeiro, sua história e seus pontos turísticos.</p>
  <a class="app" href="${base ? "../" : ""}index.html">🗺️ Abrir o mapa interativo</a>
  <p style="margin-top:16px"><a href="${base ? "../" : ""}privacidade.html">Política de privacidade</a></p>
</footer>
</body>
</html>
`;
}

// ---------- páginas de MUNICÍPIO dentro da região ----------
function blocoMunicipio(id) {
  const nome = nomeMun(id);
  const resumo = curiosidades[id]?.resumo || "";
  const lista = destinos[id]?.destinos || [];
  let html = `<h3>${esc(nome)}</h3>`;
  if (resumo) html += `<p>${esc(resumo)}</p>`;
  if (lista.length) {
    html += `<p><b>Pontos turísticos:</b></p>`;
    lista.forEach((d) => {
      html += `<p class="destino"><b>${esc(d.nome)}.</b> ${esc(d.descricao || "")}</p>`;
    });
  }
  return html;
}

// ---------- POLÍTICA DE PRIVACIDADE ----------
// Exigida pela Play Store (e bem-vista pelo AdSense). Descreve o que o
// app realmente coleta -- inclusive a ressalva honesta de que as fotos
// ficam, provisoriamente, num link público do Google Drive.
const privacidade = `
<h1>Política de Privacidade — Desbrava</h1>
<p class="lead">Esta página explica quais dados o Desbrava coleta, por que coleta e o que você pode fazer com eles. Última atualização: julho de 2026.</p>

<h2>Quem somos</h2>
<p>O Desbrava é um aplicativo web gratuito que funciona como um mapa dos 92 municípios do Rio de Janeiro, onde a pessoa registra as cidades que visita. Ele é mantido por uma pessoa física, sem fins comerciais diretos. Contato: <a href="mailto:eupaulovitorsm01@gmail.com">eupaulovitorsm01@gmail.com</a>.</p>

<h2>Dados que coletamos</h2>
<p><b>Conta.</b> Ao criar uma conta, guardamos seu e-mail e uma senha (a senha é gerenciada pelo Firebase Authentication, do Google — nós nunca temos acesso a ela). Você também escolhe um apelido, que aparece publicamente no ranking, nos posts e para seus amigos.</p>
<p><b>Progresso no app.</b> Guardamos quais municípios, regiões e rotas você marcou, suas conquistas, seus check-ins semanais e a data de cada visita.</p>
<p><b>Localização (GPS).</b> Quando você toca em "verificar que estou aqui", o app lê sua localização para confirmar se você está dentro do município. Guardamos o resultado dessa checagem (qual município e quando), não um histórico contínuo de onde você anda. O app só lê a localização quando você pede — nunca em segundo plano.</p>
<p><b>Conteúdo que você publica.</b> Fotos, legendas, sugestões de lugares, comentários e curtidas ficam salvos e são visíveis para outras pessoas do app.</p>
<p><b>Amizades.</b> Sua lista de amigos e os pedidos de amizade enviados e recebidos.</p>
<p><b>Antifraude.</b> Se o app detectar deslocamentos impossíveis entre duas verificações (por exemplo, dois municípios distantes em poucos minutos), ele registra esse evento — município anterior, novo, distância e tempo — para coibir uso de localização falsa.</p>
<p><b>Uso e anúncios.</b> Usamos o Google Analytics (via Firebase) para contar acessos e o Google AdSense para exibir anúncios no site. Essas ferramentas do Google podem usar cookies e identificadores para funcionar e para personalizar anúncios.</p>

<h2>Onde os dados ficam</h2>
<p>Os dados de conta, progresso e conteúdo ficam no <b>Google Firebase</b> (Authentication e Firestore). Relatos de bug, sugestões e registros antifraude também são espelhados numa planilha do <b>Google Sheets</b> de uso privado.</p>
<p><b>Ressalva importante sobre as fotos:</b> por uma limitação técnica temporária, as fotos publicadas ficam hospedadas no <b>Google Drive</b> com o link no modo "qualquer pessoa com o link pode ver". Na prática, isso significa que alguém que descubra o endereço direto da imagem consegue abri-la mesmo sem ter conta no Desbrava. Não publique fotos que você não queira que sejam acessíveis dessa forma. Pretendemos migrar para um armazenamento com acesso restrito.</p>

<h2>Com quem compartilhamos</h2>
<p>Não vendemos seus dados e não os repassamos para terceiros com fins comerciais. Os dados transitam apenas pelos serviços do Google citados acima, que os processam em nosso nome.</p>
<p>Parte do seu conteúdo é público dentro do app por natureza: apelido, selos, progresso, posts, sugestões e comentários. Você pode tornar seu perfil privado nas Configurações.</p>

<h2>Seus direitos</h2>
<p><b>Excluir tudo.</b> Em Configurações → Zona de risco → "Excluir minha conta", você apaga de forma permanente sua conta e todos os dados ligados a ela: progresso, selos, posts, fotos, comentários e amizades. A exclusão é definitiva e não pode ser desfeita.</p>
<p><b>Corrigir e limitar.</b> Você pode trocar o apelido, tornar o perfil privado, apagar posts e comentários individualmente e recusar a permissão de localização e de notificações no próprio navegador — o app continua funcionando, só sem essas funções.</p>
<p>Para qualquer pedido relacionado aos seus dados, escreva para <a href="mailto:eupaulovitorsm01@gmail.com">eupaulovitorsm01@gmail.com</a>.</p>

<h2>Crianças</h2>
<p>O Desbrava não é direcionado a menores de 13 anos e não coleta dados intencionalmente dessa faixa etária.</p>

<h2>Mudanças</h2>
<p>Se esta política mudar, atualizaremos esta página e a data no topo.</p>
`;
fs.writeFileSync(
  path.join(RAIZ, "privacidade.html"),
  pagina({
    titulo: "Política de Privacidade — Desbrava",
    descricao:
      "Como o Desbrava coleta, usa e protege seus dados: conta, progresso, localização, fotos e anúncios. Como excluir sua conta.",
    corpo: privacidade,
    base: "",
    canonicalPath: "privacidade.html",
  })
);

// ---------- páginas de REGIÃO ----------
fs.mkdirSync(path.join(RAIZ, "guia"), { recursive: true });
const urls = [`${BASE}/guia.html`, `${BASE}/privacidade.html`];

for (const [rid, r] of Object.entries(regioes)) {
  const corpo =
    `<a class="voltar" href="../guia.html">← Voltar ao guia</a>` +
    `<span class="tag">Região do Rio de Janeiro</span>` +
    `<h1>${esc(r.nome)}</h1>` +
    `<p class="lead">Conheça os ${r.municipios.length} municípios da ${esc(r.nome)}, com um resumo da história de cada um e os principais pontos turísticos para visitar.</p>` +
    r.municipios.map(blocoMunicipio).join("\n");
  fs.writeFileSync(
    path.join(RAIZ, "guia", `regiao-${rid}.html`),
    pagina({
      titulo: `${r.nome} — Guia Desbrava`,
      descricao: `Municípios da ${r.nome} no Rio de Janeiro: história e pontos turísticos de cada cidade.`,
      corpo,
      base: "guia/",
      canonicalPath: `guia/regiao-${rid}.html`,
    })
  );
  urls.push(`${BASE}/guia/regiao-${rid}.html`);
}

// ---------- páginas de ROTA ----------
for (const [id, rota] of Object.entries(rotas)) {
  const historiaHtml = String(rota.historia || "")
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim())}</p>`)
    .join("\n");
  const munsHtml = (rota.municipios || [])
    .map((m) => `<li>${esc(nomeMun(m))} <span style="color:var(--muted)">— ${esc(munParaRegiao[m] || "")}</span></li>`)
    .join("");
  const corpo =
    `<a class="voltar" href="../guia.html">← Voltar ao guia</a>` +
    `<span class="tag">Rota temática</span>` +
    `<h1>${esc(rota.nome)}</h1>` +
    `<p class="lead">${esc(rota.descricao || "")}</p>` +
    historiaHtml +
    `<h2>Municípios desta rota</h2><ul>${munsHtml}</ul>`;
  fs.writeFileSync(
    path.join(RAIZ, "guia", `rota-${id}.html`),
    pagina({
      titulo: `${rota.nome} — Guia Desbrava`,
      descricao: (rota.descricao || rota.nome).slice(0, 160),
      corpo,
      base: "guia/",
      canonicalPath: `guia/rota-${id}.html`,
    })
  );
  urls.push(`${BASE}/guia/rota-${id}.html`);
}

// ---------- página HUB (guia.html) ----------
const listaRegioes = Object.entries(regioes)
  .map(
    ([rid, r]) =>
      `<li><a href="guia/regiao-${rid}.html">${esc(r.nome)}</a><p>${r.municipios.length} municípios — ${esc(r.municipios.slice(0, 4).map(nomeMun).join(", "))}…</p></li>`
  )
  .join("\n");
const listaRotas = Object.entries(rotas)
  .map(
    ([id, rota]) =>
      `<li><a href="guia/rota-${id}.html">${esc(rota.nome)}</a><p>${esc(rota.descricao || "")}</p></li>`
  )
  .join("\n");

const hub =
  `<h1>Guia do Rio de Janeiro — história e pontos turísticos dos 92 municípios</h1>` +
  `<p class="lead">O Desbrava é um mapa interativo onde você registra os municípios do Rio de Janeiro conforme os visita de verdade. Este guia reúne, em texto aberto, a história e os principais pontos turísticos de cada uma das 92 cidades do estado, além de 22 rotas temáticas que atravessam séculos da história fluminense.</p>` +
  `<h2>Rotas temáticas</h2>` +
  `<p>Cada rota conta um capítulo da história do estado — do ciclo do ouro à imigração europeia, das batalhas coloniais na Baía de Guanabara à era do café.</p>` +
  `<ul class="cards">${listaRotas}</ul>` +
  `<h2>Municípios por região</h2>` +
  `<p>Os 92 municípios do Rio de Janeiro, organizados nas 8 regiões de governo do estado.</p>` +
  `<ul class="cards">${listaRegioes}</ul>`;

fs.writeFileSync(
  path.join(RAIZ, "guia.html"),
  pagina({
    titulo: "Guia do Rio de Janeiro — Desbrava | História e pontos turísticos dos 92 municípios",
    descricao:
      "Guia completo dos 92 municípios do Rio de Janeiro: história, curiosidades e pontos turísticos de cada cidade, além de 22 rotas temáticas pela história fluminense.",
    corpo: hub,
    base: "",
    canonicalPath: "guia.html",
  })
);

// ---------- sitemap ----------
const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  [`${BASE}/`, ...urls].map((u) => `  <url><loc>${u}</loc></url>`).join("\n") +
  `\n</urlset>\n`;
fs.writeFileSync(path.join(RAIZ, "sitemap.xml"), sitemap);

console.log(
  `Gerado: guia.html + ${Object.keys(regioes).length} regiões + ${Object.keys(rotas).length} rotas + sitemap.xml (${urls.length + 1} URLs)`
);
