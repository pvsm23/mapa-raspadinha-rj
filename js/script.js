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
const STORAGE_KEY_REGIOES = "scratchMapRJ_regioes_v1";

// Estrutura salva no localStorage:
// {
//   "3303302": { visitado: true, dataVisita: "2026-07-12T14:22:00.000Z" },
//   "3304557": { visitado: false }
// }

let estadoMapa = {};
// Estado do mega-selo de cada regiao (independente de estadoMapa):
// { "serrana": { revelado: true, dataRevelado: "..." } }
let estadoRegioes = {};
let destinosPorMunicipio = {};
let municipioSelecionadoId = null;
let regiaoSelecionadaId = null;
let mapaFoiArrastado = false;

// Registra o service worker (PWA instalável no celular e no PC)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((erro) => {
      console.error("Falha ao registrar o service worker:", erro);
    });
  });
}

// Guarda o evento do navegador (Chrome/Edge/Android) que permite
// instalar o PWA com um clique, em vez de só instruções manuais.
// Precisa ser capturado assim que disparar (pode ser antes do
// DOMContentLoaded), por isso fica fora do bloco de inicialização.
let promptInstalacaoPwa = null;

// Uma vez que a pessoa instala (pelo nosso botão), nunca mais mostra
// o aviso nesse navegador — mesmo que ela volte a abrir pela aba
// comum em vez do app instalado.
const CHAVE_PWA_INSTALADO = "desbrava_pwa_instalado";

window.addEventListener("beforeinstallprompt", (evento) => {
  evento.preventDefault();
  promptInstalacaoPwa = evento;
  document.getElementById("btn-instalar-pwa")?.classList.remove("oculto");
  document.getElementById("btn-como-instalar-pwa")?.classList.add("oculto");
});

window.addEventListener("appinstalled", () => {
  promptInstalacaoPwa = null;
  localStorage.setItem(CHAVE_PWA_INSTALADO, "true");
  fecharAvisoInstalarPwa();
});

document.addEventListener("DOMContentLoaded", () => {
  estadoMapa = carregarEstado();
  estadoRegioes = carregarEstadoRegioes();
  construirMapaDeRegioes();
  aplicarEstadoNoSVG();
  atualizarContador();
  inicializarPanZoomDoMapa();
  carregarDestinos();
  carregarRegioesInfo();
  carregarResumosRegioes();
  preCarregarSelos();

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

  // os itens de destino sao criados dinamicamente; delegacao de evento
  document
    .getElementById("modal-destinos")
    .addEventListener("click", aoClicarDestino);

  document
    .getElementById("btn-biblioteca")
    .addEventListener("click", () => exigirLogin(abrirBibliotecaSelos));

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
    .addEventListener("click", () => exigirLogin(abrirConfiguracoes));

  document
    .getElementById("btn-fechar-configuracoes")
    .addEventListener("click", fecharConfiguracoes);

  document
    .getElementById("modal-configuracoes")
    .addEventListener("click", (evento) => {
      if (evento.target.id === "modal-configuracoes") fecharConfiguracoes();
    });

  document.getElementById("btn-compartilhar").addEventListener("click", compartilharApp);
  document.getElementById("btn-logout").addEventListener("click", sairDaConta);
  document.getElementById("form-login").addEventListener("submit", aoEnviarFormLogin);
  document
    .getElementById("btn-alternar-modo")
    .addEventListener("click", alternarModoLogin);
  document
    .getElementById("btn-fechar-tela-login")
    .addEventListener("click", fecharTelaLogin);
  document.getElementById("tela-login").addEventListener("click", (evento) => {
    if (evento.target.id === "tela-login") fecharTelaLogin();
  });
  document.getElementById("toast-login").addEventListener("click", () => {
    const toast = document.getElementById("toast-login");
    if (!toast.classList.contains("toast-erro")) return;
    esconderToastLogin();
    abrirTelaLogin();
  });

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

  document
    .getElementById("btn-salvar-apelido-config")
    .addEventListener("click", salvarApelidoConfig);

  document
    .getElementById("btn-fechar-regiao")
    .addEventListener("click", fecharPopupRegiao);
  document.getElementById("modal-regiao").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-regiao") fecharPopupRegiao();
  });

  document.addEventListener("auth-mudou", (evento) => atualizarUiDeConta(evento.detail));
  document.addEventListener("precisa-apelido", (evento) => abrirModalApelido(evento.detail));

  document.getElementById("btn-instalar-pwa").addEventListener("click", instalarPwa);
  document
    .getElementById("btn-como-instalar-pwa")
    .addEventListener("click", alternarInstrucoesInstalarPwa);
  document
    .getElementById("btn-fechar-aviso-pwa")
    .addEventListener("click", fecharAvisoInstalarPwa);

  // Pequeno atraso pra não competir com o resto da tela carregando.
  setTimeout(mostrarAvisoInstalarPwa, 1200);
});

/**
 * Só deixa executar `acao` se o usuário estiver logado; senão, abre
 * o popup de login. Navegar/mexer no mapa (pan/zoom) não passa por
 * aqui — só interações de verdade (abrir município/região,
 * biblioteca, configurações).
 */
function exigirLogin(acao) {
  if (window.raspadinhaAuth?.usuarioAtual) {
    acao();
  } else {
    abrirTelaLogin();
  }
}

function abrirTelaLogin() {
  document.getElementById("tela-login").classList.remove("oculto");
}

function fecharTelaLogin() {
  document.getElementById("tela-login").classList.add("oculto");
}

/**
 * Compartilha o link do app (Web Share API no celular; copia o link
 * como alternativa no desktop/navegadores sem suporte).
 */
function compartilharApp() {
  const dados = {
    title: "Desbrava",
    text: "Desbrava — raspe o mapa do Rio de Janeiro conforme visita cada município!",
    url: window.location.href,
  };

  if (navigator.share) {
    navigator.share(dados).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard
      .writeText(dados.url)
      .then(() => alert("Link copiado! Cole onde quiser compartilhar."))
      .catch(() => prompt("Copie o link para compartilhar:", dados.url));
  } else {
    prompt("Copie o link para compartilhar:", dados.url);
  }
}

/**
 * Verdadeiro se o app já está rodando instalado (janela "standalone"
 * no Android/desktop, ou "adicionado à tela de início" no iOS) — daí
 * não faz sentido sugerir instalar de novo.
 */
function pwaJaInstalado() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function ehIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Mostra o aviso sugerindo instalar o app, com um botão de instalar
 * direto (se o navegador oferecer, ex: Chrome/Edge/Android) ou um
 * botão "Como instalar" com instruções manuais caso contrário.
 *
 * Não mostra se: já está rodando instalado, se essa instalação já
 * foi registrada antes (CHAVE_PWA_INSTALADO) ou se o navegador
 * consegue confirmar que já está instalado mesmo estando numa aba
 * comum (navigator.getInstalledRelatedApps — só Chrome/Edge/Android;
 * no Safari/iOS não existe forma de checar isso pela web).
 */
async function mostrarAvisoInstalarPwa() {
  if (pwaJaInstalado()) return;
  if (localStorage.getItem(CHAVE_PWA_INSTALADO) === "true") return;

  if (navigator.getInstalledRelatedApps) {
    try {
      const relacionados = await navigator.getInstalledRelatedApps();
      if (relacionados.length > 0) {
        localStorage.setItem(CHAVE_PWA_INSTALADO, "true");
        return;
      }
    } catch {
      // API experimental: se falhar, segue e mostra o aviso normalmente.
    }
  }

  document.getElementById("aviso-instalar-pwa").classList.remove("oculto");
}

function fecharAvisoInstalarPwa() {
  document.getElementById("aviso-instalar-pwa").classList.add("oculto");
}

async function instalarPwa() {
  if (!promptInstalacaoPwa) return;
  promptInstalacaoPwa.prompt();
  const resultado = await promptInstalacaoPwa.userChoice;
  promptInstalacaoPwa = null;
  if (resultado.outcome === "accepted") {
    fecharAvisoInstalarPwa();
  }
}

/**
 * Instruções manuais pra quando o navegador não oferece um botão de
 * instalação direto (ex: iOS Safari, ou Chrome antes do evento
 * "beforeinstallprompt" disparar).
 */
function alternarInstrucoesInstalarPwa() {
  const instrucoes = document.getElementById("aviso-instalar-instrucoes");
  if (!instrucoes.classList.contains("oculto")) {
    instrucoes.classList.add("oculto");
    return;
  }

  instrucoes.textContent = ehIOS()
    ? 'No Safari, toque no ícone de compartilhar (□ com uma seta ↑) e depois em "Adicionar à Tela de Início".'
    : 'No Chrome, clique no ícone de instalar (⊕) na barra de endereço, ou abra o menu "⋮" e escolha "Instalar Desbrava" (ou "Instalar app").';
  instrucoes.classList.remove("oculto");
}

let modoCadastro = false;

/**
 * Alterna entre "Entrar" e "Criar conta" no formulário de login.
 */
function alternarModoLogin() {
  modoCadastro = !modoCadastro;
  document.querySelector("#btn-entrar-email .btn-texto").textContent = modoCadastro
    ? "Criar conta"
    : "Entrar";
  document.getElementById("btn-alternar-modo").textContent = modoCadastro
    ? "Já tem conta? Entrar"
    : "Não tem conta? Criar conta";
  esconderErroLogin();
}

/**
 * Login/cadastro com e-mail e senha (js/auth.js). Em vez de travar a
 * tela esperando o Firebase responder, fecha o popup de login na
 * hora e deixa a requisição rolando em segundo plano — o andamento
 * (carregando/sucesso/erro) aparece num aviso flutuante no canto
 * inferior direito (ver mostrarToastLogin/atualizarToastLogin), pra
 * não obrigar o usuário a ficar parado esperando.
 */
function aoEnviarFormLogin(evento) {
  evento.preventDefault();
  esconderErroLogin();

  if (!window.raspadinhaAuth) {
    mostrarErroLogin("O login ainda não carregou. Espere alguns segundos e tente de novo.");
    return;
  }

  const email = document.getElementById("input-email").value.trim();
  const senha = document.getElementById("input-senha").value;
  if (!email || !senha) {
    mostrarErroLogin("Preencha e-mail e senha.");
    return;
  }

  const eraCadastro = modoCadastro;
  const acao = eraCadastro
    ? window.raspadinhaAuth.criarContaComEmail(email, senha)
    : window.raspadinhaAuth.entrarComEmail(email, senha);

  fecharTelaLogin();
  mostrarToastLogin(eraCadastro ? "Criando sua conta..." : "Login sendo efetuado...");

  acao
    .then(() => {
      atualizarToastLogin("sucesso", eraCadastro ? "Conta criada! ✅" : "Login realizado! ✅");
      setTimeout(esconderToastLogin, 2500);
    })
    .catch((erro) => {
      atualizarToastLogin("erro", traduzirErroAuth(erro));
    });
}

/**
 * Aviso flutuante (#toast-login) que acompanha o login/cadastro
 * rodando em segundo plano. No estado de erro fica clicável: um
 * clique reabre o popup de login pra tentar de novo.
 */
function mostrarToastLogin(mensagem) {
  const toast = document.getElementById("toast-login");
  toast.classList.remove("oculto", "toast-sucesso", "toast-erro");
  document.getElementById("toast-login-texto").textContent = mensagem;
}

function atualizarToastLogin(tipo, mensagem) {
  const toast = document.getElementById("toast-login");
  toast.classList.remove("toast-sucesso", "toast-erro");
  toast.classList.add(`toast-${tipo}`);
  document.getElementById("toast-login-texto").textContent = mensagem;
}

function esconderToastLogin() {
  document.getElementById("toast-login").classList.add("oculto");
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
 * Atualiza a UI (popup de login, seção "Conta" nas configurações) de
 * acordo com o login atual. `detalhe` é null (deslogado) ou
 * { usuario, apelido }. Navegar no mapa não exige login — por isso,
 * ao deslogar, NÃO reabre o popup de login sozinho; ele só aparece
 * quando alguma ação realmente exigir (ver exigirLogin()).
 */
function atualizarUiDeConta(detalhe) {
  const status = document.getElementById("conta-status");

  if (detalhe) {
    const { usuario, apelido } = detalhe;
    fecharTelaLogin();
    document.getElementById("modal-apelido").classList.add("oculto");
    document.getElementById("form-login").reset();

    status.textContent = `Conectado como ${apelido} (${usuario.email})`;
    document.getElementById("dados-email").textContent = `E-mail: ${usuario.email}`;
    document.getElementById("input-apelido-config").value = apelido;
  } else {
    status.textContent = "Você não está conectado.";
    document.getElementById("dados-email").textContent = "";
    document.getElementById("input-apelido-config").value = "";
  }
}

/**
 * Salva o novo apelido digitado em "Dados pessoais" (Configurações).
 * Mesma função de bastidor do apelido do primeiro login
 * (salvarApelido), que já rejeita apelidos repetidos.
 */
function salvarApelidoConfig() {
  const input = document.getElementById("input-apelido-config");
  const apelido = input.value.trim();
  const erro = document.getElementById("erro-apelido-config");
  erro.classList.add("oculto");

  if (!apelido) {
    erro.textContent = "Digite um apelido.";
    erro.classList.remove("oculto");
    return;
  }

  const botao = document.getElementById("btn-salvar-apelido-config");
  botao.disabled = true;
  botao.querySelector(".spinner").classList.remove("oculto");
  botao.querySelector(".btn-texto").classList.add("oculto");

  window.raspadinhaAuth
    ?.salvarApelido(apelido)
    .catch((e) => {
      erro.textContent = e?.message || "Não foi possível salvar agora. Tente de novo.";
      erro.classList.remove("oculto");
    })
    .finally(() => {
      botao.disabled = false;
      botao.querySelector(".spinner").classList.add("oculto");
      botao.querySelector(".btn-texto").classList.remove("oculto");
    });
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
    alert(erro?.message || "Não foi possível salvar seu nome agora. Tente de novo em instantes.");
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

// { "serrana": { nome: "Região Serrana", municipios: [...codigos IBGE] } }
let regioesInfo = {};

function carregarRegioesInfo() {
  fetch("data/regioes.json")
    .then((resposta) => (resposta.ok ? resposta.json() : {}))
    .then((dados) => {
      regioesInfo = dados;
    })
    .catch((erro) => {
      console.error("Não foi possível carregar data/regioes.json:", erro);
    });
}

// Resumo em texto de cada região (a preencher depois pelo usuário).
// { "serrana": { resumo: "..." } }
let resumosPorRegiao = {};

function carregarResumosRegioes() {
  fetch("data/regioes-resumo.json")
    .then((resposta) => (resposta.ok ? resposta.json() : {}))
    .then((dados) => {
      resumosPorRegiao = dados;
    })
    .catch(() => {
      // Arquivo ainda nao existe/preenchido -- sem problema, o
      // popup de regiao so nao mostra resumo nenhum.
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
  const ESCALA_MAXIMA = 10;
  const LIMIAR_ARRASTO = 5;
  // Fracao minima do mapa que precisa continuar visivel na tela,
  // mesmo arrastando para o canto mais longe possivel (nao pode
  // "se perder" num vazio sem mapa nenhum).
  const FRACAO_MINIMA_VISIVEL = 0.1;
  // Bem afastado (perto da escala minima) mostra as 8 regioes; a
  // partir daqui, mostra os 92 municipios individualmente.
  const LIMIAR_MUNICIPIOS = 1.8;
  // So a partir daqui os nomes dos municipios aparecem (senao
  // lotam a tela quando da pra ver muitos de uma vez).
  const LIMIAR_ROTULOS = 3.5;

  let escala = 1;
  let deslocX = 0;
  let deslocY = 0;

  /**
   * Limita deslocX/deslocY para que pelo menos FRACAO_MINIMA_VISIVEL
   * do mapa (largura E altura) continue dentro da tela, em qualquer
   * zoom. Sem isso, dava pra arrastar o mapa inteiro pra fora da
   * tela e ficar olhando pro vazio sem noção de como voltar.
   */
  function limitarDesloc() {
    const rect = viewport.getBoundingClientRect();
    const mapaLargura = rect.width * escala;
    const mapaAltura = rect.height * escala;
    const limiteX = rect.width / 2 + mapaLargura * (0.5 - FRACAO_MINIMA_VISIVEL);
    const limiteY = rect.height / 2 + mapaAltura * (0.5 - FRACAO_MINIMA_VISIVEL);
    deslocX = Math.max(-limiteX, Math.min(limiteX, deslocX));
    deslocY = Math.max(-limiteY, Math.min(limiteY, deslocY));
  }

  function aplicarTransform() {
    limitarDesloc();
    svg.style.transform = `translate(${deslocX}px, ${deslocY}px) scale(${escala})`;
    atualizarModoDeVisualizacao(escala, LIMIAR_MUNICIPIOS, LIMIAR_ROTULOS);
  }

  /**
   * Muda a escala mantendo fixo, na tela, o ponto (ancoraX, ancoraY)
   * em coordenadas de viewport (ex: centro da tela na roda do mouse,
   * ponto médio dos dois dedos na pinça). Sem isso, o zoom sempre
   * "puxa" o mapa de volta pro centro dele mesmo quando a visão já
   * estava deslocada pra um dos lados.
   */
  function aplicarZoomAncorado(novaEscala, ancoraX, ancoraY) {
    const rect = viewport.getBoundingClientRect();
    const origemX = rect.width / 2;
    const origemY = rect.height / 2;
    const fator = novaEscala / escala;

    deslocX = ancoraX - origemX - fator * (ancoraX - deslocX - origemX);
    deslocY = ancoraY - origemY - fator * (ancoraY - deslocY - origemY);
    escala = novaEscala;
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
      const novaEscala = Math.min(ESCALA_MAXIMA, Math.max(1, escala * fator));
      const rect = viewport.getBoundingClientRect();
      // ancora no cursor do mouse (relativo ao viewport), nao no
      // centro fixo, entao o zoom sempre "puxa" pra onde o mouse
      // esta, nao pro meio do mapa
      aplicarZoomAncorado(novaEscala, evento.clientX - rect.left, evento.clientY - rect.top);
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
        pinca = { ...distanciaEMeio(evento.touches), escalaInicial: escala };
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
        const novaEscala = Math.min(ESCALA_MAXIMA, Math.max(1, pinca.escalaInicial * fatorEscala));
        const rect = viewport.getBoundingClientRect();
        // ancora no ponto medio entre os dois dedos, que tambem e
        // quem "arrasta" o mapa quando os dedos se movem juntos
        aplicarZoomAncorado(novaEscala, atual.meioX - rect.left, atual.meioY - rect.top);
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

  aplicarTransform(); // define o modo inicial (regiões, com escala 1)
}

/**
 * true quando o mapa está afastado o bastante pra mostrar as 8
 * regiões em vez dos 92 municípios individualmente.
 */
let modoRegioes = true;

/**
 * Chamado a cada mudança de zoom: alterna entre visão de municípios
 * e de regiões, e mostra/esconde os nomes no mapa.
 */
function atualizarModoDeVisualizacao(escala, limiarMunicipios, limiarRotulos) {
  const svg = document.getElementById("mapa-rj");
  svg.classList.toggle("mostrar-rotulos", escala >= limiarRotulos);

  const novoModoRegioes = escala < limiarMunicipios;
  if (novoModoRegioes !== modoRegioes) {
    modoRegioes = novoModoRegioes;
    aplicarEstadoNoSVG();
  }
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

  if (modoRegioes) {
    exigirLogin(() => abrirPopupRegiao(path.dataset.regiao));
  } else {
    exigirLogin(() => abrirSeloPorId(path.dataset.municipio, path.dataset.nome));
  }
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
  mostrarSpinnerGrande(document.getElementById("scratch-modal-body"), true);

  const iniciar = (imageUrl, imageUrlCapa) => {
    document.getElementById("scratch-modal-body").innerHTML = "";
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
  mostrarSpinnerGrande(corpo, true);

  const caminhoColorido = `assets/img/selos/${id}.png`;
  carregarImagem(caminhoColorido).then((existeColorido) => {
    corpo.innerHTML = "";
    const img = document.createElement("img");
    img.src = existeColorido ? caminhoColorido : gerarSeloPlaceholder(id, nome);
    img.alt = nome;
    img.className = "selo-revelado";
    corpo.appendChild(img);
  });
}

/**
 * Renderiza a lista de pontos turísticos do município (se existir em
 * data/destinos.json) dentro do popup. Cada item é clicável: abre um
 * espaço reservado para um texto histórico/curiosidade (a preencher
 * depois) e um botão "Abrir no Maps" — desabilitado até existir um
 * link de verdade (campo `linkMaps`, reservado, ainda não existe em
 * nenhum destino).
 */
function mostrarDestinos(id) {
  const container = document.getElementById("modal-destinos");
  const destino = destinosPorMunicipio[id];

  if (!destino || !destino.destinos?.length) {
    container.innerHTML = "";
    return;
  }

  const itens = destino.destinos
    .map((d, indice) => {
      const temLink = !!d.linkMaps;
      return `
        <li>
          <button type="button" class="destino-item" data-indice="${indice}" aria-expanded="false">
            <strong>${escaparHtml(d.nome)}</strong>${escaparHtml(d.descricao)}
          </button>
          <div class="destino-detalhe oculto" data-indice="${indice}">
            <p class="destino-texto-completo">${escaparHtml(d.textoCompleto || "Em breve: um pouco da história e curiosidades sobre este lugar.")}</p>
            <button type="button" class="destino-btn-maps" data-link="${temLink ? escaparHtml(d.linkMaps) : ""}" ${temLink ? "" : "disabled"}>
              ▶️ Abrir no Maps
            </button>
          </div>
        </li>`;
    })
    .join("");

  container.innerHTML = `<h3>Pontos turísticos</h3><ul>${itens}</ul>`;
}

/**
 * Delegação de evento pros itens de destino (criados dinamicamente):
 * clicar no nome abre/fecha o detalhe; clicar em "Abrir no Maps" (só
 * quando tiver link) abre num navegador/app de mapas.
 */
function aoClicarDestino(evento) {
  const botaoMaps = evento.target.closest(".destino-btn-maps");
  if (botaoMaps) {
    if (botaoMaps.dataset.link) window.open(botaoMaps.dataset.link, "_blank");
    return;
  }

  const item = evento.target.closest(".destino-item");
  if (!item) return;

  const detalhe = document.querySelector(
    `.destino-detalhe[data-indice="${item.dataset.indice}"]`
  );
  const abrindo = detalhe.classList.contains("oculto");
  detalhe.classList.toggle("oculto");
  item.setAttribute("aria-expanded", String(abrindo));
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
 * Pré-carrega em segundo plano (sem travar nada) os selos de todos
 * os municípios, colorido + capa. Assim, quando o usuário abrir um
 * município mais tarde, a imagem já está no cache do navegador — sem
 * essa demora inicial que às vezes fazia parecer que não carregou.
 */
function preCarregarSelos() {
  document.querySelectorAll(".municipio").forEach((path) => {
    const id = path.dataset.municipio;
    carregarImagem(`assets/img/selos/${id}.png`);
    carregarImagem(`assets/img/selos/${id}fundo.png`);
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
 * Abre o popup de uma região: mostra quantos dos seus municípios já
 * foram visitados e, só quando TODOS estiverem completos, libera o
 * mega-selo (raspadinha bem maior) daquela região. Sem os selos de
 * região reais ainda (assets/img/regioes/<id>.png / <id>fundo.png),
 * cai no mesmo placeholder gerado na hora que os municípios usam.
 */
function abrirPopupRegiao(regiaoId) {
  regiaoSelecionadaId = regiaoId;

  const idsDaRegiao = municipiosPorRegiao[regiaoId] || [];
  const nomeRegiao = regioesInfo[regiaoId]?.nome || regiaoId;
  const visitados = idsDaRegiao.filter((id) => estadoMapa[id]?.visitado).length;
  const completa = visitados === idsDaRegiao.length && idsDaRegiao.length > 0;

  document.getElementById("regiao-nome").textContent = nomeRegiao;
  document.getElementById("regiao-status").textContent =
    `${visitados} / ${idsDaRegiao.length} municípios visitados`;
  document.getElementById("regiao-barra-preenchida").style.width =
    `${(visitados / idsDaRegiao.length) * 100}%`;
  mostrarResumoRegiao(regiaoId);

  const corpo = document.getElementById("regiao-selo-body");
  corpo.innerHTML = "";
  const instrucao = document.getElementById("regiao-instrucao");

  if (!completa) {
    const faltam = idsDaRegiao.length - visitados;
    instrucao.textContent = `Complete os ${faltam} município${faltam === 1 ? "" : "s"} que falta${faltam === 1 ? "" : "m"} nessa região para desbloquear o selo especial.`;
    mostrarSpinnerGrande(corpo, false);
    corpo.innerHTML = `<div class="selo-bloqueado">🔒</div>`;
    document.getElementById("modal-regiao").classList.remove("oculto");
    return;
  }

  if (estadoRegioes[regiaoId]?.revelado) {
    instrucao.textContent = "";
    exibirMegaSeloRevelado(regiaoId, corpo);
  } else {
    instrucao.textContent = "Região completa! Raspe o selo especial.";
    mostrarSpinnerGrande(corpo, true);
    const caminhoColorido = `assets/img/regioes/${regiaoId}.png`;
    const caminhoCapa = `assets/img/regioes/${regiaoId}fundo.png`;
    carregarImagem(caminhoColorido).then((existeColorido) => {
      const imageUrl = existeColorido ? caminhoColorido : gerarSeloPlaceholder(regiaoId, regioesInfo[regiaoId]?.nome || regiaoId, 400);
      const usarCapa = existeColorido
        ? carregarImagem(caminhoCapa).then((existeCapa) => (existeCapa ? caminhoCapa : null))
        : Promise.resolve(null);
      usarCapa.then((imageUrlCapa) => {
        corpo.innerHTML = "";
        initScratchCard({
          containerId: "regiao-selo-body",
          imageUrl,
          imageUrlCapa,
          tamanho: 400,
          onComplete: () => marcarRegiaoComoRevelada(regiaoId),
        });
      });
    });
  }

  document.getElementById("modal-regiao").classList.remove("oculto");
}

function exibirMegaSeloRevelado(regiaoId, corpo) {
  const caminhoColorido = `assets/img/regioes/${regiaoId}.png`;
  carregarImagem(caminhoColorido).then((existeColorido) => {
    const img = document.createElement("img");
    img.src = existeColorido ? caminhoColorido : gerarSeloPlaceholder(regiaoId, regioesInfo[regiaoId]?.nome || regiaoId, 400);
    img.alt = regioesInfo[regiaoId]?.nome || regiaoId;
    img.className = "selo-revelado";
    corpo.appendChild(img);
  });
}

function mostrarSpinnerGrande(corpo, mostrar) {
  corpo.innerHTML = mostrar ? '<div class="spinner spinner-grande"></div>' : "";
}

/**
 * Espaço reservado para o resumo em texto de cada região (o usuário
 * vai preencher depois em data/regioes-resumo.json). Sem esse
 * arquivo ainda, simplesmente não mostra nada.
 */
function mostrarResumoRegiao(regiaoId) {
  const container = document.getElementById("regiao-resumo");
  const resumo = resumosPorRegiao[regiaoId]?.resumo;
  container.textContent = resumo || "";
}

function marcarRegiaoComoRevelada(regiaoId) {
  estadoRegioes[regiaoId] = { revelado: true, dataRevelado: new Date().toISOString() };
  salvarEstadoRegioes();
}

function fecharPopupRegiao() {
  document.getElementById("modal-regiao").classList.add("oculto");
  document.getElementById("regiao-selo-body").innerHTML = "";
  regiaoSelecionadaId = null;
}

/**
 * Gera um "selo" temporário (data URL de um canvas) com o nome do
 * município (ou região), enquanto os selos ilustrados de verdade
 * não existem. A cor é derivada do id para variar entre eles.
 * `tamanho` é maior para o mega-selo de região (ver abrirPopupRegiao).
 */
function gerarSeloPlaceholder(id, nome, tamanho = 260) {
  const canvas = document.createElement("canvas");
  canvas.width = tamanho;
  canvas.height = tamanho;
  const ctx = canvas.getContext("2d");
  const centro = tamanho / 2;

  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const matiz = hash % 360;

  ctx.fillStyle = `hsl(${matiz}, 55%, 35%)`;
  ctx.fillRect(0, 0, tamanho, tamanho);

  ctx.fillStyle = `hsl(${matiz}, 55%, 55%)`;
  ctx.beginPath();
  ctx.arc(centro, centro * 0.81, tamanho * 0.21, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f1f5f9";
  ctx.font = `bold ${Math.round(tamanho * 0.06)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  quebrarTextoEmLinhas(ctx, nome, centro * 1.46, tamanho * 0.85, tamanho * 0.077).forEach((linha) => {
    ctx.fillText(linha.texto, centro, linha.y);
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
 * Pinta o SVG de acordo com o estado atual. Com o mapa afastado
 * (modoRegioes), a cor de cada município reflete se a REGIÃO INTEIRA
 * já foi visitada, não o município individualmente.
 */
function aplicarEstadoNoSVG() {
  document.querySelectorAll(".municipio").forEach((path) => {
    const id = path.dataset.municipio;
    const visitado = modoRegioes
      ? regiaoEstaCompleta(path.dataset.regiao)
      : !!estadoMapa[id]?.visitado;
    path.classList.toggle("visitado", visitado);
  });
}

/**
 * Agrupa os códigos IBGE de município por id de região, lendo direto
 * do atributo data-regiao de cada <path> (já vem do SVG gerado por
 * tools/geojson-to-svg.js a partir de data/regioes.json).
 */
let municipiosPorRegiao = {};

function construirMapaDeRegioes() {
  municipiosPorRegiao = {};
  document.querySelectorAll(".municipio").forEach((path) => {
    const regiaoId = path.dataset.regiao;
    (municipiosPorRegiao[regiaoId] ??= []).push(path.dataset.municipio);
  });
}

function regiaoEstaCompleta(regiaoId) {
  const idsDaRegiao = municipiosPorRegiao[regiaoId] || [];
  return idsDaRegiao.length > 0 && idsDaRegiao.every((id) => estadoMapa[id]?.visitado);
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
  estadoRegioes = {};
  salvarEstado();
  salvarEstadoRegioes();
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

function salvarEstadoRegioes() {
  localStorage.setItem(STORAGE_KEY_REGIOES, JSON.stringify(estadoRegioes));
}

function carregarEstadoRegioes() {
  try {
    const dados = localStorage.getItem(STORAGE_KEY_REGIOES);
    return dados ? JSON.parse(dados) : {};
  } catch (erro) {
    console.error("Erro ao carregar estado das regiões do LocalStorage:", erro);
    return {};
  }
}
