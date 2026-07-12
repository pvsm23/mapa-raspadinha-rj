/* =========================================================
   ETAPA 1 - Lógica do Mapa Raspadinha
   - Clique em um município -> marca como "visitado"
   - Estado salvo no LocalStorage (chave por código IBGE)
   - Estrutura já pensada para, na Etapa 2+, virar:
       * localStorage -> Firestore (por usuário logado)
       * cada município -> lista de destinos
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
    path.addEventListener("click", () => alternarMunicipio(path));
  });

  document
    .getElementById("btn-reset-tudo")
    .addEventListener("click", resetarTudo);

  document
    .getElementById("btn-reset-um")
    .addEventListener("click", desmarcarMunicipioAtual);
});

let municipioSelecionadoId = null;

/**
 * Alterna o estado de um município entre visitado/não visitado
 * e mostra o painel de detalhes.
 */
function alternarMunicipio(path) {
  const id = path.dataset.municipio;
  const nome = path.dataset.nome;

  // pequeno efeito visual de "clique"
  path.classList.add("clicando");
  setTimeout(() => path.classList.remove("clicando"), 150);

  const jaVisitado = estadoMapa[id]?.visitado;

  if (!jaVisitado) {
    // Marca como visitado agora
    estadoMapa[id] = {
      visitado: true,
      dataVisita: new Date().toISOString(),
    };
  }

  salvarEstado();
  aplicarEstadoNoSVG();
  atualizarContador();
  mostrarDetalhes(id, nome);
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
