/* =========================================================
   Lógica do Mapa Raspadinha
   - Clique num município não visitado -> abre modal de raspadinha
     (motor em scratch-card.js); ao raspar o suficiente, marca
     como "visitado".
   - Clique num município já visitado -> só mostra o painel de
     detalhes (não precisa raspar de novo).
   - Estado salvo no LocalStorage (chave por código IBGE)
   - Estrutura já pensada para, mais adiante, virar:
       * localStorage -> Firestore (por usuário logado)
       * cada município -> lista de destinos
       * placeholder gerado no canvas -> selo ilustrado real
   ========================================================= */

const STORAGE_KEY = "scratchMapRJ_v1";

// Estrutura salva no localStorage:
// {
//   "3303302": { visitado: true, dataVisita: "2026-07-12T14:22:00.000Z" },
//   "3304557": { visitado: false }
// }

let estadoMapa = {};

document.addEventListener("DOMContentLoaded", () => {
  estadoMapa = carregarEstado();
  aplicarEstadoNoSVG();
  atualizarContador();

  const municipios = document.querySelectorAll(".municipio");
  municipios.forEach((path) => {
    path.addEventListener("click", () => aoClicarMunicipio(path));
  });

  document
    .getElementById("btn-reset-tudo")
    .addEventListener("click", resetarTudo);

  document
    .getElementById("btn-reset-um")
    .addEventListener("click", desmarcarMunicipioAtual);

  document
    .getElementById("btn-fechar-modal")
    .addEventListener("click", fecharModalRaspadinha);

  // fecha o modal ao clicar fora do cartão (no fundo escurecido)
  document
    .getElementById("modal-raspadinha")
    .addEventListener("click", (evento) => {
      if (evento.target.id === "modal-raspadinha") fecharModalRaspadinha();
    });
});

let municipioSelecionadoId = null;

/**
 * Decide o que fazer ao clicar num município:
 * se já visitado, só mostra os detalhes; se não, abre a raspadinha.
 */
function aoClicarMunicipio(path) {
  const id = path.dataset.municipio;
  const nome = path.dataset.nome;

  // pequeno efeito visual de "clique"
  path.classList.add("clicando");
  setTimeout(() => path.classList.remove("clicando"), 150);

  const jaVisitado = estadoMapa[id]?.visitado;

  if (jaVisitado) {
    mostrarDetalhes(id, nome);
  } else {
    abrirModalRaspadinha(id, nome);
  }
}

/**
 * Marca um município como visitado agora, salva e atualiza a UI.
 */
function marcarComoVisitado(id, nome) {
  estadoMapa[id] = {
    visitado: true,
    dataVisita: new Date().toISOString(),
  };

  salvarEstado();
  aplicarEstadoNoSVG();
  atualizarContador();
  mostrarDetalhes(id, nome);
}

/**
 * Abre o modal com a raspadinha (canvas) para o município escolhido.
 * Ao raspar o suficiente, marca como visitado automaticamente.
 */
function abrirModalRaspadinha(id, nome) {
  document.getElementById("modal-municipio-nome").textContent = nome;
  document.getElementById("modal-raspadinha").classList.remove("oculto");

  initScratchCard({
    containerId: "scratch-modal-body",
    imageUrl: gerarSeloPlaceholder(id, nome),
    onComplete: () => {
      marcarComoVisitado(id, nome);
      setTimeout(fecharModalRaspadinha, 900);
    },
  });
}

/**
 * Fecha o modal de raspadinha e limpa o canvas.
 */
function fecharModalRaspadinha() {
  document.getElementById("modal-raspadinha").classList.add("oculto");
  document.getElementById("scratch-modal-body").innerHTML = "";
}

/**
 * Gera um "selo" temporário (data URL de um canvas) com o nome do
 * município, enquanto os selos ilustrados de verdade não existem.
 * A cor é derivada do código IBGE para variar entre municípios.
 */
function gerarSeloPlaceholder(id, nome) {
  const canvas = document.createElement("canvas");
  canvas.width = 260;
  canvas.height = 260;
  const ctx = canvas.getContext("2d");

  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const matiz = hash % 360;

  ctx.fillStyle = `hsl(${matiz}, 55%, 35%)`;
  ctx.fillRect(0, 0, 260, 260);

  ctx.fillStyle = `hsl(${matiz}, 55%, 55%)`;
  ctx.beginPath();
  ctx.arc(130, 105, 55, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  quebrarTextoEmLinhas(ctx, nome, 190, 220, 20).forEach((linha) => {
    ctx.fillText(linha.texto, 130, linha.y);
  });

  return canvas.toDataURL();
}

/**
 * Quebra um texto em várias linhas para caber numa largura máxima,
 * retornando cada linha já com sua posição Y central calculada.
 */
function quebrarTextoEmLinhas(ctx, texto, yInicial, larguraMaxima, alturaLinha) {
  const palavras = texto.split(" ");
  const linhas = [];
  let linhaAtual = "";

  palavras.forEach((palavra) => {
    const tentativa = linhaAtual ? `${linhaAtual} ${palavra}` : palavra;
    if (ctx.measureText(tentativa).width > larguraMaxima && linhaAtual) {
      linhas.push(linhaAtual);
      linhaAtual = palavra;
    } else {
      linhaAtual = tentativa;
    }
  });
  if (linhaAtual) linhas.push(linhaAtual);

  const yBase = yInicial - ((linhas.length - 1) * alturaLinha) / 2;
  return linhas.map((linhaTexto, i) => ({ texto: linhaTexto, y: yBase + i * alturaLinha }));
}

/**
 * Pinta o SVG de acordo com o objeto estadoMapa atual.
 */
function aplicarEstadoNoSVG() {
  document.querySelectorAll(".municipio").forEach((path) => {
    const id = path.dataset.municipio;
    const visitado = estadoMapa[id]?.visitado;
    path.classList.toggle("visitado", !!visitado);
  });
}

/**
 * Atualiza o contador "Visitados: X / Y"
 */
function atualizarContador() {
  const total = document.querySelectorAll(".municipio").length;
  const visitados = Object.values(estadoMapa).filter(
    (m) => m.visitado
  ).length;

  document.getElementById("contador").textContent = visitados;
  document.getElementById("total").textContent = total;
}

/**
 * Mostra o painel com nome, status e data da visita.
 */
function mostrarDetalhes(id, nome) {
  municipioSelecionadoId = id;
  const dados = estadoMapa[id];

  const painel = document.getElementById("detalhes");
  painel.classList.remove("oculto");

  document.getElementById("detalhes-nome").textContent = nome;
  document.getElementById("detalhes-status").textContent = dados?.visitado
    ? "Status: ✅ Visitado"
    : "Status: ⬜ Não visitado";

  document.getElementById("detalhes-data").textContent = dados?.dataVisita
    ? `Visitado em: ${new Date(dados.dataVisita).toLocaleString("pt-BR")}`
    : "";
}

/**
 * Desmarca o município que está atualmente selecionado no painel.
 */
function desmarcarMunicipioAtual() {
  if (!municipioSelecionadoId) return;

  delete estadoMapa[municipioSelecionadoId];
  salvarEstado();
  aplicarEstadoNoSVG();
  atualizarContador();
  document.getElementById("detalhes").classList.add("oculto");
  municipioSelecionadoId = null;
}

/**
 * Zera todo o progresso (com confirmação).
 */
function resetarTudo() {
  const confirmar = confirm(
    "Tem certeza que deseja resetar todo o mapa? Essa ação não pode ser desfeita."
  );
  if (!confirmar) return;

  estadoMapa = {};
  salvarEstado();
  aplicarEstadoNoSVG();
  atualizarContador();
  document.getElementById("detalhes").classList.add("oculto");
}

/* ---------- LocalStorage ---------- */

function salvarEstado() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(estadoMapa));
}

function carregarEstado() {
  try {
    const dados = localStorage.getItem(STORAGE_KEY);
    return dados ? JSON.parse(dados) : {};
  } catch (erro) {
    console.error("Erro ao carregar estado do LocalStorage:", erro);
    return {};
  }
}
