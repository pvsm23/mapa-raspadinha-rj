/* =========================================================
   Lógica do Mapa Raspadinha
   - Clique num município não visitado -> abre popup de raspadinha
     (motor em scratch-card.js); ao raspar o suficiente, marca
     como "visitado".
   - Clique num município já visitado -> mostra de novo o selo já
     revelado (sem precisar raspar), no mesmo popup, com status,
     destinos turísticos (data/destinos.json) e opção de desmarcar
     escondida atrás do menu "⋮".
   - Biblioteca de selos: grade com todos os municípios, cinza os
     não visitados e coloridos os já raspados, com contador e barra
     de progresso; clicar num item abre o mesmo fluxo de sempre.
   - Configurações: popup com o botão de resetar o mapa inteiro.
   - Login com e-mail/senha é obrigatório (js/auth.js): #tela-login
     cobre tudo até logar. No primeiro login, escolhe um apelido
     (salvo no Firestore) antes de liberar o app.
   - Estado salvo no LocalStorage (chave por código IBGE)
   - Estrutura já pensada para, mais adiante, virar:
       * localStorage -> Firestore (por usuário logado)
       * placeholder gerado no canvas -> selo ilustrado real
   ========================================================= */

const STORAGE_KEY = "scratchMapRJ_v1";

// Estrutura salva no localStorage:
// {
//   "3303302": { visitado: true, dataVisita: "2026-07-12T14:22:00.000Z" },
//   "3304557": { visitado: false }
// }

let estadoMapa = {};
let destinosPorMunicipio = {};
let municipioSelecionadoId = null;
let mapaFoiArrastado = false;

// Registra o service worker (PWA instalável no celular e no PC)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((erro) => {
      console.error("Falha ao registrar o service worker:", erro);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  estadoMapa = carregarEstado();
  aplicarEstadoNoSVG();
  atualizarContador();
  inicializarPanZoomDoMapa();
  carregarDestinos();

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
    .getElementById("btn-menu-modal")
    .addEventListener("click", (evento) => {
      evento.stopPropagation();
      document.getElementById("modal-menu").classList.toggle("oculto");
    });

  document
    .getElementById("btn-fechar-modal")
    .addEventListener("click", fecharModalRaspadinha);

  // fecha o modal ao clicar fora do cartão (no fundo escurecido)
  document
    .getElementById("modal-raspadinha")
    .addEventListener("click", (evento) => {
      if (evento.target.id === "modal-raspadinha") fecharModalRaspadinha();
    });

  document
    .getElementById("btn-biblioteca")
    .addEventListener("click", abrirBibliotecaSelos);

  document
    .getElementById("btn-fechar-biblioteca")
    .addEventListener("click", fecharBibliotecaSelos);

  document
    .getElementById("biblioteca-selos")
    .addEventListener("click", (evento) => {
      if (evento.target.id === "biblioteca-selos") fecharBibliotecaSelos();
    });

  document
    .getElementById("btn-configuracoes")
    .addEventListener("click", abrirConfiguracoes);

  document
    .getElementById("btn-fechar-configuracoes")
    .addEventListener("click", fecharConfiguracoes);

  document
    .getElementById("modal-configuracoes")
    .addEventListener("click", (evento) => {
      if (evento.target.id === "modal-configuracoes") fecharConfiguracoes();
    });

  document.getElementById("btn-login").addEventListener("click", abrirConfiguracoes);
  document.getElementById("btn-logout").addEventListener("click", sairDaConta);
  document.getElementById("form-login").addEventListener("submit", aoEnviarFormLogin);
  document
    .getElementById("btn-alternar-modo")
    .addEventListener("click", alternarModoLogin);

  document
    .getElementById("btn-baixar-offline")
    .addEventListener("click", baixarDadosOffline);

  document
    .getElementById("btn-confirmar-apelido")
    .addEventListener("click", confirmarApelido);
  document
    .getElementById("input-apelido")
    .addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") confirmarApelido();
    });

  document.addEventListener("auth-mudou", (evento) => atualizarUiDeConta(evento.detail));
  document.addEventListener("precisa-apelido", (evento) => abrirModalApelido(evento.detail));
});

let modoCadastro = false;

/**
 * Alterna entre "Entrar" e "Criar conta" no formulário de login.
 */
function alternarModoLogin() {
  modoCadastro = !modoCadastro;
  document.getElementById("btn-entrar-email").textContent = modoCadastro
    ? "Criar conta"
    : "Entrar";
  document.getElementById("btn-alternar-modo").textContent = modoCadastro
    ? "Já tem conta? Entrar"
    : "Não tem conta? Criar conta";
  esconderErroLogin();
}

/**
 * Login/cadastro com e-mail e senha (js/auth.js). Enquanto o
 * Firebase não estiver configurado (ver js/firebase-config.js), só
 * mostra um aviso — não quebra o resto do app.
 */
function aoEnviarFormLogin(evento) {
  evento.preventDefault();
  esconderErroLogin();

  const email = document.getElementById("input-email").value.trim();
  const senha = document.getElementById("input-senha").value;
  const acao = modoCadastro
    ? window.raspadinhaAuth?.criarContaComEmail(email, senha)
    : window.raspadinhaAuth?.entrarComEmail(email, senha);

  acao?.catch((erro) => mostrarErroLogin(traduzirErroAuth(erro)));
}

function mostrarErroLogin(mensagem) {
  const el = document.getElementById("erro-login");
  el.textContent = mensagem;
  el.classList.remove("oculto");
}

function esconderErroLogin() {
  document.getElementById("erro-login").classList.add("oculto");
}

/**
 * Traduz os códigos de erro mais comuns do Firebase Auth pra
 * mensagens em português que fazem sentido pro usuário.
 */
function traduzirErroAuth(erro) {
  const mensagens = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/missing-password": "Digite uma senha.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/email-already-in-use": "Já existe uma conta com esse e-mail. Tente entrar.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Não existe conta com esse e-mail. Crie uma conta.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente de novo.",
    "auth/operation-not-allowed":
      "Login por e-mail/senha ainda não foi ativado no Firebase (Console > Authentication > Sign-in method).",
  };
  return mensagens[erro?.code] || erro?.message || "Não foi possível continuar. Tente de novo.";
}

function sairDaConta() {
  window.raspadinhaAuth?.sair();
}

/**
 * Atualiza a UI (tela de login obrigatória, botão de topo, seção
 * "Conta" nas configurações) de acordo com o login atual.
 * `detalhe` é null (deslogado) ou { usuario, apelido }.
 */
function atualizarUiDeConta(detalhe) {
  const btnLoginTopo = document.getElementById("btn-login");
  const status = document.getElementById("conta-status");
  const telaLogin = document.getElementById("tela-login");

  if (detalhe) {
    const { usuario, apelido } = detalhe;
    telaLogin.classList.add("oculto");
    document.getElementById("modal-apelido").classList.add("oculto");
    document.getElementById("form-login").reset();

    btnLoginTopo.textContent = "🟢";
    btnLoginTopo.title = `Logado como ${apelido}`;
    status.textContent = `Conectado como ${apelido} (${usuario.email})`;
  } else {
    telaLogin.classList.remove("oculto");

    btnLoginTopo.textContent = "👤";
    btnLoginTopo.title = "Minha conta";
    status.textContent = "Você não está conectado.";
  }
}

/**
 * Abre o popup de escolher apelido (primeiro login). Sugere a parte
 * do e-mail antes do "@" como ponto de partida, mas o usuário pode
 * trocar livremente.
 */
function abrirModalApelido(usuario) {
  const input = document.getElementById("input-apelido");
  input.value = usuario?.email?.split("@")[0] ?? "";
  document.getElementById("modal-apelido").classList.remove("oculto");
  input.focus();
}

function confirmarApelido() {
  const input = document.getElementById("input-apelido");
  const apelido = input.value.trim();
  if (!apelido) {
    alert("Digite um nome de usuário para continuar.");
    return;
  }
  window.raspadinhaAuth?.salvarApelido(apelido).catch((erro) => {
    console.error("Falha ao salvar o apelido:", erro);
    alert("Não foi possível salvar seu nome agora. Tente de novo em instantes.");
  });
}

/**
 * TODO(PRO): stub do futuro recurso de baixar os dados (selos e
 * destinos) para uso offline, restrito a assinantes PRO. O botão já
 * fica desabilitado no HTML (ver #btn-baixar-offline) até isso
 * existir de verdade — esta função é só para não precisar mexer em
 * vários lugares do código quando a hora chegar.
 */
function baixarDadosOffline() {
  if (!ehUsuarioPro()) {
    alert("Recurso em construção — em breve disponível para assinantes PRO.");
    return;
  }
  // TODO(PRO): implementar o download de verdade (ex: empacotar
  // assets/img/selos + data/destinos.json num arquivo só).
}

/**
 * TODO(PRO): trocar por uma verificação real de assinatura (ex:
 * campo no Firestore ligado ao usuário logado) quando existir.
 */
function ehUsuarioPro() {
  return window.raspadinhaAuth?.ehPro() ?? false;
}

/**
 * Carrega data/destinos.json (pontos turísticos por município).
 * Hoje só tem alguns municípios preenchidos; os demais simplesmente
 * não aparecem na lista de destinos do popup.
 */
function carregarDestinos() {
  fetch("data/destinos.json")
    .then((resposta) => (resposta.ok ? resposta.json() : {}))
    .then((dados) => {
      destinosPorMunicipio = dados;
    })
    .catch((erro) => {
      console.error("Não foi possível carregar data/destinos.json:", erro);
    });
}

/**
 * Controla arrastar (mover) e zoom do mapa principal:
 * - Mouse: arrastar move o mapa; roda do mouse dá zoom.
 * - Toque: 1 dedo move o mapa; 2 dedos (pinça) dão zoom e movem.
 * - Duplo clique/toque reseta o zoom.
 * Marca `mapaFoiArrastado` quando o movimento passa de um limiar
 * pequeno, para não abrir a raspadinha sem querer ao soltar o dedo
 * depois de mover o mapa (ver aoClicarMunicipio).
 */
function inicializarPanZoomDoMapa() {
  const viewport = document.getElementById("mapa-viewport");
  const svg = document.getElementById("mapa-rj");
  const ESCALA_MAXIMA = 4;
  const LIMIAR_ARRASTO = 5;

  let escala = 1;
  let deslocX = 0;
  let deslocY = 0;

  function aplicarTransform() {
    svg.style.transform = `translate(${deslocX}px, ${deslocY}px) scale(${escala})`;
  }

  function distanciaEMeio(touches) {
    const [a, b] = touches;
    return {
      distancia: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
      meioX: (a.clientX + b.clientX) / 2,
      meioY: (a.clientY + b.clientY) / 2,
    };
  }

  // ---- Mouse: arrastar move; roda do mouse dá zoom ----
  let arrastando = false;
  let inicioX = 0;
  let inicioY = 0;
  let deslocXInicial = 0;
  let deslocYInicial = 0;

  viewport.addEventListener("mousedown", (evento) => {
    arrastando = true;
    mapaFoiArrastado = false;
    inicioX = evento.clientX;
    inicioY = evento.clientY;
    deslocXInicial = deslocX;
    deslocYInicial = deslocY;
    viewport.classList.add("arrastando");
  });

  window.addEventListener("mousemove", (evento) => {
    if (!arrastando) return;
    const dx = evento.clientX - inicioX;
    const dy = evento.clientY - inicioY;
    if (Math.abs(dx) > LIMIAR_ARRASTO || Math.abs(dy) > LIMIAR_ARRASTO) {
      mapaFoiArrastado = true;
    }
    deslocX = deslocXInicial + dx;
    deslocY = deslocYInicial + dy;
    aplicarTransform();
  });

  window.addEventListener("mouseup", () => {
    arrastando = false;
    viewport.classList.remove("arrastando");
  });

  viewport.addEventListener(
    "wheel",
    (evento) => {
      evento.preventDefault();
      const fator = evento.deltaY < 0 ? 1.15 : 1 / 1.15;
      escala = Math.min(ESCALA_MAXIMA, Math.max(1, escala * fator));
      if (escala === 1) {
        deslocX = 0;
        deslocY = 0;
      }
      aplicarTransform();
    },
    { passive: false }
  );

  // ---- Toque: 1 dedo move; pinça de 2 dedos dá zoom e move ----
  let toqueUnico = null;
  let pinca = null;

  viewport.addEventListener(
    "touchstart",
    (evento) => {
      mapaFoiArrastado = false;
      if (evento.touches.length === 1) {
        const t = evento.touches[0];
        toqueUnico = { x: t.clientX, y: t.clientY, deslocXInicial: deslocX, deslocYInicial: deslocY };
        pinca = null;
      } else if (evento.touches.length === 2) {
        pinca = { ...distanciaEMeio(evento.touches), escalaInicial: escala, deslocXInicial: deslocX, deslocYInicial: deslocY };
        toqueUnico = null;
      }
    },
    { passive: true }
  );

  viewport.addEventListener(
    "touchmove",
    (evento) => {
      if (evento.touches.length === 1 && toqueUnico) {
        evento.preventDefault();
        const t = evento.touches[0];
        const dx = t.clientX - toqueUnico.x;
        const dy = t.clientY - toqueUnico.y;
        if (Math.abs(dx) > LIMIAR_ARRASTO || Math.abs(dy) > LIMIAR_ARRASTO) {
          mapaFoiArrastado = true;
        }
        deslocX = toqueUnico.deslocXInicial + dx;
        deslocY = toqueUnico.deslocYInicial + dy;
        aplicarTransform();
      } else if (evento.touches.length === 2 && pinca) {
        evento.preventDefault();
        mapaFoiArrastado = true;
        const atual = distanciaEMeio(evento.touches);
        const fatorEscala = atual.distancia / pinca.distancia;
        escala = Math.min(ESCALA_MAXIMA, Math.max(1, pinca.escalaInicial * fatorEscala));
        deslocX = pinca.deslocXInicial + (atual.meioX - pinca.meioX);
        deslocY = pinca.deslocYInicial + (atual.meioY - pinca.meioY);
        aplicarTransform();
      }
    },
    { passive: false }
  );

  viewport.addEventListener("touchend", (evento) => {
    if (evento.touches.length === 0) {
      toqueUnico = null;
      pinca = null;
    }
  });

  viewport.addEventListener("dblclick", () => {
    escala = 1;
    deslocX = 0;
    deslocY = 0;
    aplicarTransform();
  });
}

/**
 * Decide o que fazer ao clicar num município:
 * se já visitado, mostra o selo revelado; se não, abre a raspadinha.
 */
function aoClicarMunicipio(path) {
  if (mapaFoiArrastado) return;

  // pequeno efeito visual de "clique"
  path.classList.add("clicando");
  setTimeout(() => path.classList.remove("clicando"), 150);

  abrirSeloPorId(path.dataset.municipio, path.dataset.nome);
}

/**
 * Ponto de entrada único para abrir o selo de um município, usado
 * tanto pelo clique no mapa quanto pela biblioteca de selos.
 */
function abrirSeloPorId(id, nome) {
  municipioSelecionadoId = id;
  const jaVisitado = estadoMapa[id]?.visitado;

  if (jaVisitado) {
    visualizarSeloRevelado(id, nome);
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
}

/**
 * Prepara o popup do zero: esconde o menu "⋮", limpa status/destinos
 * e mostra o nome do município. Chamado antes de abrir tanto a
 * raspadinha quanto a visualização de um selo já revelado.
 */
function prepararModal(nome) {
  document.getElementById("modal-municipio-nome").textContent = nome;
  document.getElementById("modal-menu").classList.add("oculto");
  document.getElementById("modal-raspadinha").classList.remove("oculto");
}

/**
 * Abre o popup com a raspadinha (canvas) para o município escolhido.
 * Ao raspar o suficiente, marca como visitado automaticamente.
 *
 * Usa o selo real em assets/img/selos/<codigo-ibge>.png (colorido) e
 * assets/img/selos/<codigo-ibge>fundo.png (capa preto-e-branco que
 * sera raspada) quando existirem; caso contrário, cai no placeholder
 * gerado na hora. Assim, basta colocar os PNGs na pasta (sem mexer
 * em código) para os selos reais passarem a valer.
 */
function abrirModalRaspadinha(id, nome) {
  prepararModal(nome);
  document.getElementById("modal-status").textContent = "";
  document.getElementById("modal-instrucao").textContent =
    "Raspe com o dedo ou o mouse para revelar!";
  mostrarDestinos(id);

  const caminhoColorido = `assets/img/selos/${id}.png`;
  const caminhoCapa = `assets/img/selos/${id}fundo.png`;

  const iniciar = (imageUrl, imageUrlCapa) => {
    initScratchCard({
      containerId: "scratch-modal-body",
      imageUrl,
      imageUrlCapa,
      onComplete: () => {
        marcarComoVisitado(id, nome);
        document.getElementById("modal-status").textContent =
          `Visitado em: ${new Date().toLocaleString("pt-BR")}`;
        setTimeout(fecharModalRaspadinha, 900);
      },
    });
  };

  carregarImagem(caminhoColorido).then((existeColorido) => {
    if (!existeColorido) {
      iniciar(gerarSeloPlaceholder(id, nome), null);
      return;
    }
    carregarImagem(caminhoCapa).then((existeCapa) => {
      iniciar(caminhoColorido, existeCapa ? caminhoCapa : null);
    });
  });
}

/**
 * Mostra de novo, dentro do mesmo popup, o selo de um município já
 * visitado — sem precisar raspar de novo, já revelado por completo,
 * junto com status/data e a opção de desmarcar (atrás do menu "⋮").
 */
function visualizarSeloRevelado(id, nome) {
  prepararModal(nome);

  const dados = estadoMapa[id];
  document.getElementById("modal-status").textContent = dados?.dataVisita
    ? `✅ Visitado em: ${new Date(dados.dataVisita).toLocaleString("pt-BR")}`
    : "✅ Visitado";
  document.getElementById("modal-instrucao").textContent = "";
  mostrarDestinos(id);

  const corpo = document.getElementById("scratch-modal-body");
  corpo.innerHTML = "";

  const caminhoColorido = `assets/img/selos/${id}.png`;
  carregarImagem(caminhoColorido).then((existeColorido) => {
    const img = document.createElement("img");
    img.src = existeColorido ? caminhoColorido : gerarSeloPlaceholder(id, nome);
    img.alt = nome;
    img.className = "selo-revelado";
    corpo.appendChild(img);
  });
}

/**
 * Renderiza a lista de pontos turísticos do município (se existir
 * em data/destinos.json) dentro do popup.
 */
function mostrarDestinos(id) {
  const container = document.getElementById("modal-destinos");
  const destino = destinosPorMunicipio[id];

  if (!destino || !destino.destinos?.length) {
    container.innerHTML = "";
    return;
  }

  const itens = destino.destinos
    .map(
      (d) =>
        `<li><strong>${escaparHtml(d.nome)}</strong>${escaparHtml(d.descricao)}</li>`
    )
    .join("");

  container.innerHTML = `<h3>Pontos turísticos</h3><ul>${itens}</ul>`;
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

const cacheExisteImagem = {};

/**
 * Testa se uma imagem existe/carrega, sem lançar erro se não existir.
 * O resultado fica em cache (mesma URL não é testada de novo).
 */
function carregarImagem(src) {
  if (src in cacheExisteImagem) {
    return Promise.resolve(cacheExisteImagem[src]);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      cacheExisteImagem[src] = true;
      resolve(true);
    };
    img.onerror = () => {
      cacheExisteImagem[src] = false;
      resolve(false);
    };
    img.src = src;
  });
}

/**
 * Fecha o popup de raspadinha/selo e limpa o canvas.
 */
function fecharModalRaspadinha() {
  document.getElementById("modal-raspadinha").classList.add("oculto");
  document.getElementById("modal-menu").classList.add("oculto");
  document.getElementById("scratch-modal-body").innerHTML = "";
}

/**
 * Abre a biblioteca de selos: uma grade com todos os municípios,
 * em cinza os ainda não visitados e coloridos os já raspados, com
 * contador e barra de progresso no topo.
 * Clicar num item reaproveita a mesma lógica de abrir o selo.
 */
function abrirBibliotecaSelos() {
  const grade = document.getElementById("biblioteca-grade");
  grade.innerHTML = "";

  const municipios = Array.from(document.querySelectorAll(".municipio"))
    .map((path) => ({ id: path.dataset.municipio, nome: path.dataset.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const totalVisitados = municipios.filter((m) => estadoMapa[m.id]?.visitado).length;
  document.getElementById("biblioteca-contador").textContent =
    `${totalVisitados} / ${municipios.length} selos coletados`;
  document.getElementById("biblioteca-barra-preenchida").style.width =
    `${(totalVisitados / municipios.length) * 100}%`;

  municipios.forEach(({ id, nome }) => {
    const visitado = !!estadoMapa[id]?.visitado;

    const item = document.createElement("button");
    item.type = "button";
    item.className = "selo-item";
    item.title = nome;
    item.addEventListener("click", () => {
      fecharBibliotecaSelos();
      abrirSeloPorId(id, nome);
    });

    const img = document.createElement("img");
    img.alt = nome;
    img.className = visitado ? "selo-colorido" : "selo-cinza";

    const caminhoColorido = `assets/img/selos/${id}.png`;
    carregarImagem(caminhoColorido).then((existeColorido) => {
      img.src = existeColorido ? caminhoColorido : gerarSeloPlaceholder(id, nome);
    });

    const legenda = document.createElement("span");
    legenda.textContent = nome;

    item.appendChild(img);
    item.appendChild(legenda);
    grade.appendChild(item);
  });

  document.getElementById("biblioteca-selos").classList.remove("oculto");
}

function fecharBibliotecaSelos() {
  document.getElementById("biblioteca-selos").classList.add("oculto");
}

function abrirConfiguracoes() {
  document.getElementById("modal-configuracoes").classList.remove("oculto");
}

function fecharConfiguracoes() {
  document.getElementById("modal-configuracoes").classList.add("oculto");
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
 * Desmarca o município atualmente aberto no popup, depois de
 * confirmar com o usuário, e fecha o popup em seguida.
 */
function desmarcarMunicipioAtual() {
  if (!municipioSelecionadoId) return;

  const confirmar = confirm("Tem certeza que deseja desmarcar este município?");
  if (!confirmar) return;

  delete estadoMapa[municipioSelecionadoId];
  salvarEstado();
  aplicarEstadoNoSVG();
  atualizarContador();
  municipioSelecionadoId = null;
  fecharModalRaspadinha();
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
  fecharConfiguracoes();
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
