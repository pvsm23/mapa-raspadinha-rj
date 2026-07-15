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
const STORAGE_KEY_CONQUISTAS = "scratchMapRJ_conquistas_v1";
const STORAGE_KEY_STREAK = "scratchMapRJ_streak_v1";

// Chave PIX mostrada no botão 💬 → "Colaborar" (ver PENDENCIAS.md).
const CHAVE_PIX_COLABORACAO = "pvsm23@jim.com";

// Dono "atual" das chaves de localStorage acima -- "anon" enquanto
// ninguém logou nesta aba, ou o uid de quem está logado. CRÍTICO:
// sem isso, contas diferentes no MESMO navegador liam/escreviam a
// MESMA chave fixa e se misturavam (o progresso de uma conta
// aparecia/sobrescrevia o da outra) -- ver carregarEstadoDoUsuario /
// voltarParaEstadoAnonimo, chamadas sempre que o login muda.
let uidStorageAtual = "anon";

function chaveComUid(chaveBase) {
  return `${chaveBase}_${uidStorageAtual}`;
}

// Estrutura salva no localStorage:
// {
//   "3303302": {
//     visitado: true,
//     dataVisita: "2026-07-12T14:22:00.000Z",
//     // "brilhante"/"chanceDecidida" -- ver decidirBrilhante(): so
//     // existem em municipios raspados a partir da raspadinha
//     // brilhante entrar no ar. Municipios raspados antes disso nao
//     // tem chanceDecidida (fica undefined/falso), entao ganham UMA
//     // chance de decidir a sorte se a pessoa desmarcar e raspar de
//     // novo (ver desmarcarMunicipioAtual).
//     brilhante: false,
//     chanceDecidida: true,
//     // "verificado" -- so vira true quando a geolocalizacao confirma
//     // que a pessoa esta MESMO dentro do municipio (ver
//     // verificarPresencaNoMunicipio). Raspar sempre e permitido, mas
//     // so conta pro contador/ranking/conquistas/regiao-completa
//     // quando verificado (ver estaVerificado()). Enquanto nao
//     // verificado, o municipio fica VERMELHO no mapa (nao verde) e
//     // marcado com aviso na biblioteca de selos.
//     verificado: false,
//     motivoNaoVerificado: "",
//   },
//   "3304557": { visitado: false }
// }

let estadoMapa = {};
// Estado do mega-selo de cada regiao (independente de estadoMapa):
// { "serrana": { revelado: true, dataRevelado: "..." } }
let estadoRegioes = {};
// Estado das raspadinhas de conquista (10/25/50/75/100% do mapa):
// { "10pct": { revelado: true, dataRevelado: "..." } }
let estadoConquistas = {};
// Sequencia de dias seguidos abrindo o app (streak), pra conquista
// "7 dias seguidos" -- local, nao depende do check-in (semanal) no
// Firestore pra nao precisar de leitura assincrona so pra isso.
let estadoStreak = { ultimoDia: null, contagem: 0 };
let destinosPorMunicipio = {};
let curiosidadesPorMunicipio = {};
// Limites geograficos reais dos municipios (data/rj-municipios.geojson),
// usados so pra conferir se a pessoa esta mesmo dentro do municipio na
// hora de verificar a visita: { "3300100": [[ [lon,lat], ... ]] }
let geojsonMunicipios = {};
let municipioSelecionadoId = null;
let regiaoSelecionadaId = null;
let mapaFoiArrastado = false;

// Guarda quem convidou (?convite=uid no link compartilhado) ate a
// conta ser criada de verdade -- soh entao js/auth.js credita a
// raspadinha brilhante garantida pra quem convidou (ver
// creditarConviteSeExistir em js/auth.js).
(function detectarLinkDeConvite() {
  const conviteUid = new URLSearchParams(window.location.search).get("convite");
  if (conviteUid) {
    localStorage.setItem("desbrava_convite_pendente", conviteUid);
  }
})();

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
  estadoConquistas = carregarEstadoConquistas();
  estadoStreak = carregarEstadoStreak();
  registrarAcessoDeHoje();
  construirMapaDeRegioes();
  construirContornosDeRegiao();
  aplicarEstadoNoSVG();
  atualizarContador();
  inicializarPanZoomDoMapa();
  carregarDestinos();
  carregarCuriosidades();
  carregarGeoJsonMunicipios().then(() => verificarLocalizacaoAoAbrirApp());
  carregarRegioesInfo();
  carregarResumosRegioes();
  preCarregarSelos();

  // Confere de novo sempre que o app volta a ficar visível (ex: usuário
  // minimizou/trocou de app e voltou) -- ver verificarLocalizacaoAoAbrirApp
  // pra entender o que isso detecta (e o que NÃO detecta).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") verificarLocalizacaoAoAbrirApp();
  });

  const municipios = document.querySelectorAll("#mapa-rj .municipio");
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
    .getElementById("btn-verificar-local")
    .addEventListener("click", tentarVerificarLocalAgora);

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

  document
    .getElementById("btn-compartilhar")
    .addEventListener("click", () => document.getElementById("modal-compartilhar").classList.remove("oculto"));
  document
    .getElementById("btn-fechar-compartilhar")
    .addEventListener("click", () => document.getElementById("modal-compartilhar").classList.add("oculto"));
  document.getElementById("modal-compartilhar").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-compartilhar") {
      document.getElementById("modal-compartilhar").classList.add("oculto");
    }
  });
  document.getElementById("btn-compartilhar-de-fato").addEventListener("click", compartilharApp);
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
    .getElementById("btn-fechar-apelido")
    .addEventListener("click", fecharModalApelidoComAleatorio);

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
  document.addEventListener("boosts-brilhantes-mudou", atualizarAvisoBrilhantePendente);

  // ---- Meu perfil ----
  document
    .getElementById("btn-meu-perfil")
    .addEventListener("click", () => exigirLogin(() => abrirPerfil(window.raspadinhaAuth.usuarioAtual.uid)));

  // ---- Ranking ----
  document
    .getElementById("btn-abrir-ranking")
    .addEventListener("click", () => exigirLogin(abrirRanking));
  document.getElementById("btn-fechar-ranking").addEventListener("click", fecharRanking);
  document.getElementById("modal-ranking").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-ranking") fecharRanking();
  });
  document.getElementById("btn-ranking-global").addEventListener("click", () => alternarAbaRanking("global"));
  document.getElementById("btn-ranking-amigos").addEventListener("click", () => alternarAbaRanking("amigos"));

  // ---- Conquistas ----
  document
    .getElementById("btn-abrir-conquistas")
    .addEventListener("click", () => exigirLogin(abrirConquistas));
  document.getElementById("btn-fechar-conquistas").addEventListener("click", fecharConquistas);
  document.getElementById("modal-conquistas").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-conquistas") fecharConquistas();
  });

  // ---- Amigos ----
  document
    .getElementById("btn-abrir-amigos")
    .addEventListener("click", () => exigirLogin(abrirAmigos));
  document.getElementById("btn-fechar-amigos").addEventListener("click", fecharAmigos);
  document.getElementById("modal-amigos").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-amigos") fecharAmigos();
  });
  document.getElementById("btn-buscar-amigo").addEventListener("click", buscarAmigoPorTexto);
  document.getElementById("input-busca-amigo").addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") buscarAmigoPorTexto();
  });

  // ---- Check-in semanal ----
  document
    .getElementById("btn-abrir-checkin")
    .addEventListener("click", () => exigirLogin(abrirCheckin));
  document.getElementById("btn-fechar-checkin").addEventListener("click", fecharCheckin);
  document.getElementById("modal-checkin").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-checkin") fecharCheckin();
  });

  // ---- Feedback e colaboração ----
  document.getElementById("btn-feedback").addEventListener("click", abrirFeedback);
  document.getElementById("btn-fechar-feedback").addEventListener("click", fecharFeedback);
  document.getElementById("modal-feedback").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-feedback") fecharFeedback();
  });
  document.querySelectorAll(".feedback-opcao").forEach((botao) => {
    botao.addEventListener("click", () => mostrarPainelFeedback(botao.dataset.painel));
  });
  document
    .getElementById("btn-enviar-feedback-bug")
    .addEventListener("click", () => enviarFeedback("bug"));
  document
    .getElementById("btn-enviar-feedback-sugestao")
    .addEventListener("click", () => enviarFeedback("sugestao"));
  document
    .getElementById("btn-enviar-feedback-ponto-turistico")
    .addEventListener("click", () => enviarFeedback("ponto-turistico"));
  document.getElementById("btn-copiar-pix").addEventListener("click", copiarChavePix);

  document
    .getElementById("btn-fechar-boas-vindas")
    .addEventListener("click", fecharBoasVindas);

  document
    .getElementById("btn-fechar-aviso-desenvolvimento")
    .addEventListener("click", fecharAvisoDesenvolvimento);

  // ---- Perfil público ----
  document.getElementById("btn-fechar-perfil").addEventListener("click", fecharPerfil);
  document.getElementById("modal-perfil").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-perfil") fecharPerfil();
  });

  // ---- História completa do município ----
  document
    .getElementById("btn-fechar-historia-municipio")
    .addEventListener("click", fecharHistoriaMunicipio);
  document.getElementById("modal-historia-municipio").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-historia-municipio") fecharHistoriaMunicipio();
  });
  document.getElementById("check-perfil-publico").addEventListener("change", (evento) => {
    window.raspadinhaAuth?.definirPerfilPublico(evento.target.checked);
  });

  // ---- Notificações locais ----
  document.getElementById("check-notificacoes").addEventListener("change", (evento) => {
    alternarNotificacoes(evento.target.checked);
  });

  // ---- Mapa do Brasil ----
  document.getElementById("btn-mapa-brasil").addEventListener("click", abrirMapaBrasil);
  document.getElementById("btn-fechar-brasil").addEventListener("click", fecharMapaBrasil);
  document.getElementById("modal-brasil").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-brasil") fecharMapaBrasil();
  });

  // ---- Botões flutuantes da lateral esquerda (janela suspensa) ----
  document.getElementById("btn-toggle-lateral").addEventListener("click", alternarBotoesLaterais);

  // ---- Busca de município/ponto turístico ----
  document.getElementById("btn-buscar-local").addEventListener("click", abrirBuscaLocal);
  document.getElementById("btn-fechar-busca-local").addEventListener("click", fecharBuscaLocal);
  document.getElementById("modal-busca-local").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-busca-local") fecharBuscaLocal();
  });
  document.getElementById("input-busca-local").addEventListener("input", filtrarBuscaLocal);

  // ---- "Onde estou": localizar no mapa via GPS ----
  document.getElementById("btn-onde-estou").addEventListener("click", mostrarOndeEstou);

  document.getElementById("btn-instalar-pwa").addEventListener("click", instalarPwa);
  document
    .getElementById("btn-como-instalar-pwa")
    .addEventListener("click", alternarInstrucoesInstalarPwa);
  document
    .getElementById("btn-fechar-aviso-pwa")
    .addEventListener("click", fecharAvisoInstalarPwa);

  // Pequeno atraso pra não competir com o resto da tela carregando.
  setTimeout(mostrarAvisoInstalarPwa, 1200);

  mostrarBoasVindasSeNecessario();
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
 * como alternativa no desktop/navegadores sem suporte). Se a pessoa
 * estiver logada, o link leva um "?convite=uid" -- se alguém criar
 * conta por esse link, quem convidou ganha uma raspadinha brilhante
 * garantida (ver decidirBrilhante/creditarConviteSeExistir).
 */
function compartilharApp() {
  const url = new URL(window.location.href);
  url.search = "";
  const uid = window.raspadinhaAuth?.usuarioAtual?.uid;
  if (uid) url.searchParams.set("convite", uid);

  const dados = {
    title: "Desbrava",
    text: "Desbrava — raspe o mapa do Rio de Janeiro conforme visita cada município!",
    url: url.toString(),
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
async function atualizarUiDeConta(detalhe) {
  const status = document.getElementById("conta-status");

  if (detalhe) {
    const { usuario, apelido } = detalhe;
    fecharTelaLogin();
    document.getElementById("modal-apelido").classList.add("oculto");
    document.getElementById("form-login").reset();

    status.textContent = `Conectado como ${apelido} (${usuario.email})`;
    document.getElementById("dados-email").textContent = `E-mail: ${usuario.email}`;
    document.getElementById("input-apelido-config").value = apelido;

    // IMPORTANTE: troca pro estado (município/região) DESSA conta —
    // e restaura do Firestore por cima — ANTES de sincronizar de
    // volta pro Firestore. Sem isso, se o navegador ainda tivesse o
    // estado de outra conta (ver carregarEstadoDoUsuario), essa
    // sincronização gravaria dado misturado por cima do certo.
    await carregarEstadoDoUsuario(usuario.uid);

    sincronizarProgressoOnline();
    window.raspadinhaAuth.registrarCheckinHoje();
    gerarSnapshotMapaSeNecessario();
    window.raspadinhaAuth.buscarPerfilPublico(usuario.uid).then((perfil) => {
      document.getElementById("check-perfil-publico").checked = perfil?.perfilPublico !== false;
    });
  } else {
    status.textContent = "Você não está conectado.";
    document.getElementById("dados-email").textContent = "";
    document.getElementById("input-apelido-config").value = "";
    voltarParaEstadoAnonimo();
    atualizarAvisoBrilhantePendente();
  }
}

/**
 * Envia pro Firestore quantos municípios já foram visitados —
 * alimenta o Ranking online (ver abrirRanking). Silencioso: se
 * falhar, não atrapalha nada no mapa (só fica sem contar no ranking
 * até a próxima sincronização).
 */
function sincronizarProgressoOnline() {
  if (!window.raspadinhaAuth?.usuarioAtual) return;
  const visitados = Object.keys(estadoMapa).filter((id) => estaVerificado(id)).length;
  window.raspadinhaAuth.sincronizarProgresso(visitados);
}

/**
 * Estado "público" de um município (o que aparece no perfil de quem
 * abrir e nas contagens globais de raridade) -- reflete só o que
 * está ATIVO agora: verificado conta só se ainda estiver marcado
 * (some se desmarcar), brilhante só conta enquanto o município
 * estiver visitado (a decisão em si é permanente localmente, mas o
 * selo só "aparece" publicamente enquanto coletado).
 */
function estadoPublicoMunicipio(id) {
  const dados = estadoMapa[id];
  return {
    visitado: !!dados?.visitado,
    verificado: estaVerificado(id),
    brilhante: !!(dados?.visitado && dados?.brilhante),
  };
}

function sincronizarMunicipioOnline(id) {
  if (!window.raspadinhaAuth?.usuarioAtual) return;
  window.raspadinhaAuth.sincronizarMunicipio(id, estadoPublicoMunicipio(id));
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
 * Fecha o popup de escolher apelido sem a pessoa confirmar nada — em
 * vez de deixar sem apelido (obrigatório pra aparecer no ranking e
 * na busca de amigos), gera um "userNNNNNN" aleatório e salva
 * sozinho. Tenta de novo com outro número no raro caso de colisão
 * com um apelido que já existe.
 */
async function fecharModalApelidoComAleatorio() {
  document.getElementById("modal-apelido").classList.add("oculto");

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const candidato = `user${Math.floor(100000 + Math.random() * 900000)}`;
    try {
      await window.raspadinhaAuth.salvarApelido(candidato);
      return;
    } catch (erro) {
      if (erro?.code !== "apelido/em-uso") {
        console.error("Falha ao gerar apelido aleatório:", erro);
        return;
      }
      // colidiu com um apelido existente -- tenta outro número
    }
  }
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
 * Carrega data/curiosidades.json (história/curiosidade de cada
 * município, liberada só depois de raspar o selo — ver
 * mostrarCuriosidade). Vazio até o usuário preencher.
 */
function carregarCuriosidades() {
  fetch("data/curiosidades.json")
    .then((resposta) => (resposta.ok ? resposta.json() : {}))
    .then((dados) => {
      curiosidadesPorMunicipio = dados;
    })
    .catch(() => {
      // Arquivo ainda nao existe/preenchido -- sem problema, so nao
      // mostra curiosidade nenhuma.
    });
}

/**
 * Carrega os limites geográficos reais dos 92 municípios
 * (data/rj-municipios.geojson, o mesmo arquivo usado pra gerar o
 * SVG) — usado só pra verificar se a pessoa está mesmo dentro do
 * município na hora de confirmar uma visita (ver
 * verificarPresencaNoMunicipio).
 */
function carregarGeoJsonMunicipios() {
  return fetch("data/rj-municipios.geojson")
    .then((resposta) => (resposta.ok ? resposta.json() : null))
    .then((geo) => {
      if (!geo?.features) return;
      geo.features.forEach((feature) => {
        geojsonMunicipios[feature.properties.id] = feature.geometry.coordinates;
      });
    })
    .catch((erro) => {
      console.error("Não foi possível carregar data/rj-municipios.geojson:", erro);
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

  /**
   * Interface exposta pra fora do fechamento (usada pela busca de
   * município/ponto turístico): anima o mapa até centralizar um
   * município na tela com o zoom aplicado. Ancora o zoom exatamente
   * no centro atual do município na tela (mesma matemática do zoom
   * por roda do mouse) e só depois desloca (pan) esse ponto fixo até
   * o centro do viewport -- assim não precisa converter unidades do
   * viewBox do SVG pra pixels de tela.
   */
  window.controleMapa = {
    focarEmMunicipio(id, escalaAlvo = 4) {
      const path = document.querySelector(`#mapa-rj [data-municipio="${id}"]`);
      if (!path) return;

      const rectMunicipio = path.getBoundingClientRect();
      const rectViewport = viewport.getBoundingClientRect();
      const ancoraX = rectMunicipio.left + rectMunicipio.width / 2 - rectViewport.left;
      const ancoraY = rectMunicipio.top + rectMunicipio.height / 2 - rectViewport.top;

      svg.style.transition = "transform 0.6s ease";
      aplicarZoomAncorado(escalaAlvo, ancoraX, ancoraY);
      deslocX += rectViewport.width / 2 - ancoraX;
      deslocY += rectViewport.height / 2 - ancoraY;
      aplicarTransform();

      setTimeout(() => {
        svg.style.transition = "";
      }, 650);
    },
  };
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
  // Sempre sincroniza a classe (nao so quando muda) pra garantir que
  // o estado visual inicial (contornos de regiao, bordas de
  // municipio escondidas) fique certo mesmo antes de qualquer zoom.
  svg.classList.toggle("modo-regioes", novoModoRegioes);
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
 * `brilhante` já vem decidido por decidirBrilhante() — essa função só
 * persiste o resultado, nunca sorteia nada sozinha.
 */
function marcarComoVisitado(id, nome, brilhante, verificado) {
  estadoMapa[id] = {
    ...estadoMapa[id],
    visitado: true,
    dataVisita: new Date().toISOString(),
    brilhante: !!brilhante,
    chanceDecidida: true,
    verificado: !!verificado,
    motivoNaoVerificado: verificado ? "" : "Verificando sua localização...",
  };

  salvarEstado();
  aplicarEstadoNoSVG();
  atualizarContador();
  sincronizarProgressoOnline();
  sincronizarMunicipioOnline(id);
  atualizarProgressoConquistas();
}

/**
 * Decide se a raspagem que está terminando agora é "brilhante"
 * (5% de chance), mas só na PRIMEIRA vez que a sorte desse município
 * é decidida:
 * - Se já tinha sido decidida antes (chanceDecidida=true), repete o
 *   mesmo resultado de sempre — desmarcar e raspar de novo não dá
 *   uma segunda chance.
 * - Municípios raspados ANTES dessa funcionalidade existir não têm
 *   chanceDecidida (undefined) — ganham a decisão na primeira vez que
 *   forem raspados de novo (por isso é preciso desmarcar pra tentar).
 * - Se houver uma raspadinha brilhante garantida por convite
 *   pendente (ver js/auth.js: consumirBoostBrilhante), ela tem
 *   prioridade sobre o sorteio aleatório.
 */
function decidirBrilhante(id) {
  const anterior = estadoMapa[id];
  if (anterior?.chanceDecidida) return !!anterior.brilhante;
  if (window.raspadinhaAuth?.consumirBoostBrilhante()) return true;
  return Math.random() < 0.05;
}

/**
 * Verdadeiro só quando o município foi raspado E a geolocalização já
 * confirmou que a pessoa estava mesmo lá. É essa checagem (não só
 * "visitado") que conta pro contador, ranking, conquistas e pra uma
 * região ser considerada completa -- raspar sem estar no local marca
 * o município de vermelho, não de verde.
 */
function estaVerificado(id) {
  const dados = estadoMapa[id];
  return !!dados?.visitado && !!dados?.verificado;
}

/**
 * Pega a localização atual do navegador (uma vez, não fica
 * observando). Rejeita com uma mensagem em português pronta pra
 * mostrar ao usuário se a permissão for negada, o navegador não
 * suportar, ou demorar demais.
 */
function obterLocalizacaoAtual() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Seu navegador não tem suporte a localização."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicao) => resolve({ lat: posicao.coords.latitude, lon: posicao.coords.longitude }),
      (erro) => {
        const mensagens = {
          1: "Permissão de localização negada.",
          2: "Não foi possível obter sua localização agora.",
          3: "A localização demorou demais para responder.",
        };
        reject(new Error(mensagens[erro.code] || "Não foi possível obter sua localização."));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

/**
 * Ray casting (par-ímpar) clássico: conta quantas vezes uma linha
 * horizontal partindo do ponto cruza as arestas do anel. Ímpar =
 * dentro, par = fora. Funciona pra qualquer polígono simples.
 */
function pontoDentroDoAnel(x, y, anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0];
    const yi = anel[i][1];
    const xj = anel[j][0];
    const yj = anel[j][1];
    const cruza = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/**
 * Testa um ponto (lon, lat) contra a geometria de um município. Os
 * municípios costeiros do RJ têm partes desconectadas (ilhas +
 * continente), gravadas como vários "anéis" dentro do mesmo Polygon
 * em vez de um MultiPolygon de verdade -- então cada anel aqui é um
 * pedaço separado do território (não um buraco): o ponto conta como
 * dentro do município se cair em QUALQUER um dos anéis.
 */
function pontoDentroDoPoligono(lon, lat, aneis) {
  if (!aneis?.length) return false;
  return aneis.some((anel) => pontoDentroDoAnel(lon, lat, anel));
}

/**
 * Confirma (ou não) que a pessoa está fisicamente dentro do
 * município `id` agora, usando a localização do navegador contra o
 * contorno geográfico real (data/rj-municipios.geojson). Nunca
 * lança erro -- sempre resolve com { verificado, motivo }, pronto
 * pra mostrar na tela quando verificado for false.
 */
async function verificarPresencaNoMunicipio(id) {
  try {
    const { lat, lon } = await obterLocalizacaoAtual();
    const poligono = geojsonMunicipios[id];
    if (!poligono) {
      return {
        verificado: false,
        motivo: "Não foi possível confirmar o limite geográfico deste município.",
      };
    }
    return pontoDentroDoPoligono(lon, lat, poligono)
      ? { verificado: true, motivo: "" }
      : { verificado: false, motivo: "Parece que você não está dentro deste município agora." };
  } catch (erro) {
    return { verificado: false, motivo: erro.message };
  }
}

/**
 * Grava o resultado da verificação de localização e atualiza tudo
 * que depende dela (cor no mapa, contador, ranking, conquistas).
 */
function atualizarVerificacaoMunicipio(id, verificado, motivo) {
  if (!estadoMapa[id]) return;
  estadoMapa[id].verificado = verificado;
  estadoMapa[id].motivoNaoVerificado = verificado ? "" : motivo || "";
  salvarEstado();
  aplicarEstadoNoSVG();
  atualizarContador();
  sincronizarProgressoOnline();
  sincronizarMunicipioOnline(id);
  atualizarProgressoConquistas();
}

/**
 * Descobre em qual município (id IBGE) uma coordenada cai, testando
 * contra o contorno geográfico real de cada um (mesmo dado usado na
 * verificação por GPS). Retorna null se não cair em nenhum -- ex:
 * fora do estado do Rio de Janeiro.
 */
function encontrarMunicipioPorCoordenada(lon, lat) {
  for (const id in geojsonMunicipios) {
    if (pontoDentroDoPoligono(lon, lat, geojsonMunicipios[id])) return id;
  }
  return null;
}

/**
 * Botão "🧭 Onde estou": pega a localização do navegador, descobre o
 * município correspondente, anima o mapa até lá (reaproveitando
 * `window.controleMapa.focarEmMunicipio`, o mesmo usado pela busca) e
 * marca o local com um ícone pulsante (ver `colocarMarcadorLocalAtual`).
 * Não abre o selo nem conta como visita -- é só um "você está aqui".
 */
async function mostrarOndeEstou() {
  const botao = document.getElementById("btn-onde-estou");
  botao.disabled = true;
  botao.classList.add("buscando");
  esconderToastOndeEstou();

  try {
    const { lat, lon } = await obterLocalizacaoAtual();
    const id = encontrarMunicipioPorCoordenada(lon, lat);

    if (!id) {
      colocarMarcadorLocalAtual(null);
      mostrarToastOndeEstou("Você parece estar fora do Rio de Janeiro.");
      return;
    }

    const path = document.querySelector(`#mapa-rj [data-municipio="${id}"]`);
    window.controleMapa?.focarEmMunicipio(id);
    setTimeout(() => colocarMarcadorLocalAtual(path), 650);
    mostrarToastOndeEstou(`Você está em ${path?.dataset.nome || "um município do RJ"}.`);
  } catch (erro) {
    mostrarToastOndeEstou(erro.message);
  } finally {
    botao.disabled = false;
    botao.classList.remove("buscando");
  }
}

/**
 * Desenha (ou reposiciona) o marcador "você está aqui" em cima do
 * centro do município `path`, como um <g> dentro do próprio SVG do
 * mapa -- assim ele acompanha o pan/zoom automaticamente, sem precisar
 * converter coordenadas de tela. Remove qualquer marcador anterior.
 */
function colocarMarcadorLocalAtual(path) {
  document.getElementById("marcador-local-atual")?.remove();
  if (!path) return;

  const svg = document.getElementById("mapa-rj");
  const caixa = path.getBBox();
  const cx = caixa.x + caixa.width / 2;
  const cy = caixa.y + caixa.height / 2;
  const ns = "http://www.w3.org/2000/svg";

  const grupo = document.createElementNS(ns, "g");
  grupo.id = "marcador-local-atual";

  const anel = document.createElementNS(ns, "circle");
  anel.setAttribute("class", "marcador-anel");
  anel.setAttribute("cx", cx);
  anel.setAttribute("cy", cy);
  anel.setAttribute("r", 6);

  const ponto = document.createElementNS(ns, "circle");
  ponto.setAttribute("class", "marcador-ponto");
  ponto.setAttribute("cx", cx);
  ponto.setAttribute("cy", cy);
  ponto.setAttribute("r", 5);

  grupo.append(anel, ponto);
  svg.appendChild(grupo);
}

/**
 * Aviso flutuante simples (sucesso/erro) pro botão "Onde estou".
 * Some sozinho depois de alguns segundos.
 */
let temporizadorToastOndeEstou = null;
function mostrarToastOndeEstou(mensagem) {
  const toast = document.getElementById("toast-onde-estou");
  document.getElementById("toast-onde-estou-texto").textContent = mensagem;
  toast.classList.remove("oculto");
  clearTimeout(temporizadorToastOndeEstou);
  temporizadorToastOndeEstou = setTimeout(esconderToastOndeEstou, 4000);
}

function esconderToastOndeEstou() {
  document.getElementById("toast-onde-estou").classList.add("oculto");
}

/* ============================================================
   Notificações locais: disparadas pelo próprio app enquanto ele
   está aberto (mesmo minimizado/em outra aba) -- via
   Notification API + Service Worker (sw.js), pra funcionar melhor
   no Android (Chrome no Android exige showNotification() por um
   Service Worker; `new Notification()` direto costuma falhar lá).
   NÃO é push de verdade: não chega com o app 100% fechado, porque
   isso exigiria um servidor disparando via Firebase Cloud Messaging.
   Ativado/desativado em Configurações → Notificações
   (#check-notificacoes), preferência puramente local (dispositivo).
   ============================================================ */

const CHAVE_NOTIFICACOES_ATIVADAS = "scratchMapRJ_notificacoes_ativadas_v1";

/**
 * true só quando o navegador concedeu a permissão E o usuário não
 * desativou manualmente o toggle em Configurações (o navegador não
 * deixa "revogar" a permissão via JS -- então a desativação local é
 * só uma preferência nossa que soma à checagem).
 */
function notificacoesPermitidas() {
  return (
    typeof Notification !== "undefined" &&
    Notification.permission === "granted" &&
    localStorage.getItem(CHAVE_NOTIFICACOES_ATIVADAS) !== "false"
  );
}

/**
 * Mostra uma notificação do sistema (fora da aba/app), se permitido.
 * Silenciosa se não tiver permissão -- nunca interrompe o uso normal
 * do app por causa disso.
 */
async function dispararNotificacaoLocal(titulo, opcoes = {}) {
  if (!notificacoesPermitidas()) return;
  try {
    if (navigator.serviceWorker) {
      const registro = await navigator.serviceWorker.ready;
      await registro.showNotification(titulo, {
        icon: "assets/icons/desbrava-icone.png",
        badge: "assets/icons/desbrava-icone.png",
        ...opcoes,
      });
    } else {
      new Notification(titulo, opcoes);
    }
  } catch (erro) {
    console.error("Falha ao mostrar notificação:", erro);
  }
}

/**
 * Reflete no checkbox de Configurações o estado real da permissão do
 * navegador -- chamada ao carregar a página e sempre que o modal de
 * Configurações é aberto (a permissão pode ter mudado nas
 * configurações do próprio navegador/site a qualquer momento).
 */
function sincronizarCheckboxNotificacoes() {
  const checkbox = document.getElementById("check-notificacoes");
  const status = document.getElementById("notificacoes-status");

  if (typeof Notification === "undefined") {
    checkbox.checked = false;
    checkbox.disabled = true;
    status.textContent = "Seu navegador não suporta notificações.";
    status.classList.remove("oculto");
    return;
  }

  if (Notification.permission === "denied") {
    checkbox.checked = false;
    checkbox.disabled = true;
    status.textContent = "Notificações bloqueadas nas configurações do navegador/site.";
    status.classList.remove("oculto");
    return;
  }

  checkbox.disabled = false;
  status.classList.add("oculto");
  checkbox.checked = notificacoesPermitidas();
}

/**
 * Clique no checkbox de Configurações: pede permissão na hora (se
 * ainda não foi decidida) ou só ativa/desativa a preferência local
 * (se a permissão já tinha sido concedida antes).
 */
async function alternarNotificacoes(ativar) {
  if (!ativar) {
    localStorage.setItem(CHAVE_NOTIFICACOES_ATIVADAS, "false");
    return;
  }

  if (Notification.permission === "default") {
    const resultado = await Notification.requestPermission();
    if (resultado !== "granted") {
      sincronizarCheckboxNotificacoes();
      return;
    }
  }

  localStorage.setItem(CHAVE_NOTIFICACOES_ATIVADAS, "true");
  sincronizarCheckboxNotificacoes();
}

const CHAVE_ULTIMA_VERIFICACAO_LOCAL = "scratchMapRJ_ultima_verificacao_local_v1";

/**
 * Confere, silenciosamente, se a pessoa está dentro de algum município
 * agora -- chamada ao abrir o app e sempre que ele volta a ficar
 * visível (ex: usuário minimizou/trocou de app no celular e voltou).
 *
 * IMPORTANTE (limitação real da plataforma web, não só deste app): não
 * existe geofencing em segundo plano pra PWA -- nenhum navegador
 * executa JS com o app totalmente fechado. Isso aqui NÃO detecta um
 * município por onde a pessoa passou horas atrás enquanto o app
 * estava fechado; só confere a localização atual no exato momento em
 * que o app é aberto/reaberto. Também só verifica SE a permissão de
 * localização já tinha sido concedida antes (por isso não pede
 * permissão sozinho, sem contexto, toda vez que o app abre).
 */
async function verificarLocalizacaoAoAbrirApp() {
  if (!navigator.permissions?.query) return;

  const agora = Date.now();
  const ultima = Number(localStorage.getItem(CHAVE_ULTIMA_VERIFICACAO_LOCAL) || 0);
  if (agora - ultima < 2 * 60 * 1000) return; // no máximo 1x a cada 2 minutos
  localStorage.setItem(CHAVE_ULTIMA_VERIFICACAO_LOCAL, String(agora));

  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    if (status.state !== "granted") return;

    const { lat, lon } = await obterLocalizacaoAtual();
    const id = encontrarMunicipioPorCoordenada(lon, lat);
    if (!id) return;

    const path = document.querySelector(`#mapa-rj [data-municipio="${id}"]`);
    const nome = path?.dataset.nome;
    if (!nome) return;

    // Já raspado (visitado) -- NUNCA convida a raspar de novo, só
    // ainda que raro, isso não pode reaparecer mostrando "raspagem
    // disponível" pra quem já tem o selo. Só falta confirmar o local
    // (se ainda não verificado), e isso é feito sozinho, sem exigir
    // ação nenhuma.
    const dados = estadoMapa[id];
    if (dados?.visitado) {
      if (!dados.verificado) {
        atualizarVerificacaoMunicipio(id, true, "");
        mostrarAvisoMunicipioDetectado(nome, null);
      }
      return;
    }

    // Só chega aqui se o município NUNCA foi raspado -- aí sim faz
    // sentido convidar a raspar.
    mostrarAvisoMunicipioDetectado(nome, () => {
      exigirLogin(() => {
        window.controleMapa?.focarEmMunicipio(id);
        setTimeout(() => abrirSeloPorId(id, nome), 650);
      });
    });
  } catch {
    // sem permissão/sinal/tempo esgotado -- silencioso, não interrompe o uso do app
  }
}

let temporizadorAvisoMunicipioDetectado = null;

/**
 * Aviso flutuante do "detectamos que você está em X" -- se `aoClicar`
 * for passado, mostra um botão de ação (ex: "Raspar selo"); se for
 * null, é só um aviso informativo (ex: visita que já tava pendente de
 * confirmação e acabou de ser confirmada sozinha).
 */
function mostrarAvisoMunicipioDetectado(nome, aoClicar) {
  const aviso = document.getElementById("aviso-municipio-detectado");
  const botao = document.getElementById("btn-aviso-municipio-detectado-acao");

  const mensagem = aoClicar
    ? `📍 Detectamos que você está em ${nome}!`
    : `📍 Confirmamos sua visita a ${nome}!`;
  document.getElementById("aviso-municipio-detectado-texto").textContent = mensagem;

  if (aoClicar) {
    botao.classList.remove("oculto");
    botao.onclick = () => {
      aviso.classList.add("oculto");
      aoClicar();
    };
  } else {
    botao.classList.add("oculto");
    botao.onclick = null;
  }

  aviso.classList.remove("oculto");
  clearTimeout(temporizadorAvisoMunicipioDetectado);
  temporizadorAvisoMunicipioDetectado = setTimeout(() => aviso.classList.add("oculto"), 10000);

  // Também dispara uma notificação do sistema, pra avisar mesmo se a
  // aba/app não estiver em primeiro plano no momento (ver seção de
  // notificações locais acima -- só funciona com o app ainda aberto,
  // não com ele fechado de verdade).
  dispararNotificacaoLocal(mensagem, {
    body: aoClicar ? "Toque pra raspar o selo." : "",
    tag: "municipio-detectado",
  });
}

/**
 * Botão "Verificar agora" na tela de um selo já raspado, mas ainda
 * não confirmado -- tenta de novo sem precisar raspar de novo.
 */
async function tentarVerificarLocalAgora() {
  if (!municipioSelecionadoId) return;
  const id = municipioSelecionadoId;
  const nome = document.getElementById("modal-municipio-nome").textContent;
  const botao = document.getElementById("btn-verificar-local");

  botao.disabled = true;
  botao.textContent = "Verificando...";

  const { verificado, motivo } = await verificarPresencaNoMunicipio(id);
  atualizarVerificacaoMunicipio(id, verificado, motivo);

  botao.disabled = false;
  botao.textContent = "📍 Verificar agora que estou aqui";

  if (municipioSelecionadoId === id) visualizarSeloRevelado(id, nome);
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
  document.getElementById("modal-selo-estatistica").textContent = "";
  // IMPORTANTE: limpa a curiosidade -- ela só é preenchida por
  // mostrarCuriosidade(), chamada só em visualizarSeloRevelado (selo
  // já raspado). Sem essa limpeza aqui, abrir um município AINDA NÃO
  // raspado depois de ter visto outro (já raspado, com curiosidade
  // de verdade) deixava o texto do município ANTERIOR "grudado" na
  // tela, por trás da raspadinha nova -- essa era a causa real do
  // "resumo/história de um município aparecendo em outro".
  document.getElementById("modal-curiosidade").innerHTML = "";
  mostrarDestinos(id);

  // Decide a sorte JÁ na abertura (não na conclusão): assim dá pra
  // carregar a arte dourada certa desde o início da raspagem, em vez
  // de trocar a imagem depois de já ter raspado a normal.
  const brilhante = decidirBrilhante(id);
  const caminhoCapa = `assets/img/selos/${id}fundo.png`;
  mostrarSpinnerGrande(document.getElementById("scratch-modal-body"), true);

  const iniciar = (imageUrl, imageUrlCapa) => {
    document.getElementById("scratch-modal-body").innerHTML = "";
    initScratchCard({
      containerId: "scratch-modal-body",
      imageUrl,
      imageUrlCapa,
      // Trava a sorte assim que a pessoa raspa a primeira vez, mesmo
      // que abandone sem terminar -- sem isso, dava pra "espiar"
      // (raspar uma pontinha, ver que não veio brilhante, fechar sem
      // completar) e tentar de novo depois (ver travarSorteNaPrimeiraRaspada).
      onPrimeiroToque: () => travarSorteNaPrimeiraRaspada(id, brilhante),
      onComplete: () => {
        // Marca como raspado na hora (selo revelado, sorte já
        // decidida), mas ainda "nao verificado" -- so conta de
        // verdade depois que a localizacao confirmar que a pessoa
        // esta no municipio.
        marcarComoVisitado(id, nome, brilhante, false);
        document.getElementById("modal-status").textContent = brilhante
          ? "✨ Raspadinha BRILHANTE! Confirmando sua localização..."
          : "📍 Confirmando sua localização...";

        verificarPresencaNoMunicipio(id).then(({ verificado, motivo }) => {
          atualizarVerificacaoMunicipio(id, verificado, motivo);
          const aindaAberto =
            municipioSelecionadoId === id &&
            !document.getElementById("modal-raspadinha").classList.contains("oculto");
          if (!aindaAberto) return;

          document.getElementById("modal-status").textContent = verificado
            ? `${brilhante ? "✨ Raspadinha BRILHANTE! " : ""}Visitado em: ${new Date().toLocaleString("pt-BR")} ✅`
            : `⚠️ Raspado, mas não verificado: ${motivo}`;
          setTimeout(fecharModalRaspadinha, verificado ? 1400 : 3200);
        });

        return brilhante;
      },
    });
  };

  resolverImagemColorida(`assets/img/selos/${id}`, brilhante, id, nome).then((caminhoColorido) => {
    if (!caminhoColorido.arteReal) {
      iniciar(caminhoColorido.url, null);
      return;
    }
    carregarImagem(caminhoCapa).then((existeCapa) => {
      iniciar(caminhoColorido.url, existeCapa ? caminhoCapa : null);
    });
  });
}

/**
 * Trava a sorte (brilhante ou não) assim que a pessoa raspa a
 * primeira vez, mesmo que abandone sem terminar de raspar. Sem isso,
 * dava pra "espiar" o resultado (raspar uma pontinha, ver que não
 * veio brilhante, fechar sem completar) e tentar de novo depois --
 * `chanceDecidida` só era gravado na conclusão (ver
 * marcarComoVisitado/decidirBrilhante), então nada impedia um novo
 * sorteio a cada reabertura enquanto não completasse de verdade.
 * Não mexe em `visitado`/`dataVisita`: só marcarComoVisitado (na
 * conclusão de verdade) conta como visita.
 */
function travarSorteNaPrimeiraRaspada(id, brilhante) {
  if (estadoMapa[id]?.chanceDecidida) return; // já travado, nada a fazer
  estadoMapa[id] = {
    ...estadoMapa[id],
    brilhante: !!brilhante,
    chanceDecidida: true,
  };
  salvarEstado();
}

/**
 * Resolve qual imagem colorida usar pra um selo (município, região ou
 * conquista): a versão "dourada" (`<prefixo>dourado.png`) quando
 * `brilhante` for true e ela existir, senão a normal
 * (`<prefixo>.png`), senão o placeholder gerado na hora. `arteReal`
 * diz se achou algum PNG de verdade (pra saber se vale a pena tentar
 * carregar uma capa raspável combinando com a arte).
 */
async function resolverImagemColorida(
  prefixo,
  brilhante,
  idParaPlaceholder,
  nomeParaPlaceholder,
  tamanhoPlaceholder
) {
  if (brilhante) {
    const caminhoDourado = `${prefixo}dourado.png`;
    if (await carregarImagem(caminhoDourado)) return { url: caminhoDourado, arteReal: true };
  }
  const caminhoNormal = `${prefixo}.png`;
  if (await carregarImagem(caminhoNormal)) return { url: caminhoNormal, arteReal: true };
  return {
    url: gerarSeloPlaceholder(idParaPlaceholder, nomeParaPlaceholder, tamanhoPlaceholder),
    arteReal: false,
  };
}

/**
 * Mostra de novo, dentro do mesmo popup, o selo de um município já
 * visitado — sem precisar raspar de novo, já revelado por completo,
 * junto com status/data e a opção de desmarcar (atrás do menu "⋮").
 */
function visualizarSeloRevelado(id, nome) {
  prepararModal(nome);

  const dados = estadoMapa[id];
  const verificado = estaVerificado(id);
  const botaoVerificar = document.getElementById("btn-verificar-local");

  if (verificado) {
    document.getElementById("modal-status").textContent = dados?.dataVisita
      ? `✅ Visitado em: ${new Date(dados.dataVisita).toLocaleString("pt-BR")}`
      : "✅ Visitado";
    botaoVerificar.classList.add("oculto");
  } else {
    document.getElementById("modal-status").textContent =
      `⚠️ Raspado, mas ainda não verificado. ${dados?.motivoNaoVerificado || "Você precisa estar no município para confirmar."}`;
    botaoVerificar.classList.remove("oculto");
  }

  document.getElementById("modal-instrucao").textContent = "";
  mostrarDestinos(id);
  mostrarCuriosidade(id, nome);
  mostrarEstatisticaSeloMunicipio(id);

  const corpo = document.getElementById("scratch-modal-body");
  mostrarSpinnerGrande(corpo, true);

  const brilhante = !!dados?.brilhante;
  resolverImagemColorida(`assets/img/selos/${id}`, brilhante, id, nome).then((resultado) => {
    corpo.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className =
      "selo-revelado-wrapper" + (verificado ? "" : " selo-nao-verificado-wrapper");
    const img = document.createElement("img");
    img.src = resultado.url;
    img.alt = nome;
    img.className = "selo-revelado";
    wrapper.appendChild(img);
    if (brilhante) adicionarBrilho(wrapper);
    corpo.appendChild(wrapper);
  });
}

// Texto padrão pros 91 municípios que ainda não têm curiosidade
// escrita -- vive de verdade em data/curiosidades.json (não só como
// fallback aqui), de propósito: assim TODO município sempre tem um
// `resumo` de verdade, não vazio/undefined, o que evita qualquer
// tela em branco ou comportamento estranho enquanto o JSON ainda tá
// carregando ou nalgum caso raro de falha de rede (ver também o
// conserto no fallback do Service Worker, em sw.js). O fallback aqui
// só cobre o caso do JSON não ter carregado ainda de jeito nenhum.
const CURIOSIDADE_TEXTO_PADRAO = "Em breve, uma curiosidade sobre este município.";

/**
 * Mostra a curiosidade/história do município (data/curiosidades.json)
 * -- só existe pra ver DEPOIS de raspar o selo (por isso só é chamada
 * daqui, na visualização de um município já visitado). Enquanto o
 * usuário não tiver enviado o texto de um município, mostra um
 * espaço reservado. Quando o município tem história mais longa
 * (`historiaCompleta`, uma lista de parágrafos), mostra também um
 * botão "📖 Saiba mais" que abre uma janela separada (ver
 * abrirHistoriaMunicipio) -- o resumo aqui é só o gancho rápido.
 */
function mostrarCuriosidade(id, nome) {
  const container = document.getElementById("modal-curiosidade");
  const dados = curiosidadesPorMunicipio[id];
  const resumo = dados?.resumo || CURIOSIDADE_TEXTO_PADRAO;
  const temResumoReal = resumo !== CURIOSIDADE_TEXTO_PADRAO;
  const temHistoriaCompleta = !!dados?.historiaCompleta?.length;

  container.innerHTML = temResumoReal
    ? `<h3>Curiosidade</h3><p>${escaparHtml(resumo)}</p>`
    : `<h3>Curiosidade</h3><p class="curiosidade-vazia">${escaparHtml(CURIOSIDADE_TEXTO_PADRAO)}</p>`;

  if (temHistoriaCompleta) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "btn-saiba-mais-municipio";
    botao.textContent = "📖 Saiba mais";
    botao.addEventListener("click", () => abrirHistoriaMunicipio(id, nome));
    container.appendChild(botao);
  }
}

/**
 * Janela separada (não a mesma do popup do selo) com a história
 * completa do município -- linha do tempo, curiosidades adicionais,
 * etc. -- em parágrafos, pra comportar texto bem mais longo que o
 * resumo curto de `mostrarCuriosidade`.
 */
function abrirHistoriaMunicipio(id, nome) {
  const paragrafos = curiosidadesPorMunicipio[id]?.historiaCompleta || [];
  document.getElementById("historia-municipio-titulo").textContent = `📖 ${nome}`;
  document.getElementById("historia-municipio-corpo").innerHTML = paragrafos
    .map((paragrafo) => `<p>${escaparHtml(paragrafo)}</p>`)
    .join("");
  document.getElementById("modal-historia-municipio").classList.remove("oculto");
}

function fecharHistoriaMunicipio() {
  document.getElementById("modal-historia-municipio").classList.add("oculto");
}

/**
 * Mostra quantas contas têm o selo de um município (e a % em relação
 * ao total de contas criadas) -- calculado na hora via
 * getCountFromServer, sem travar o resto do popup.
 */
async function mostrarEstatisticaSeloMunicipio(id) {
  const el = document.getElementById("modal-selo-estatistica");
  el.textContent = "Calculando quantas contas têm esse selo...";
  try {
    const [qtd, total] = await Promise.all([
      window.raspadinhaAuth.contarPessoasComMunicipioVerificado(id),
      window.raspadinhaAuth.contarTotalContas(),
    ]);
    if (!total) {
      el.textContent = "";
      return;
    }
    const pct = (qtd / total) * 100;
    el.textContent = `👥 ${qtd} conta${qtd === 1 ? "" : "s"} tem esse selo (${pct.toFixed(1)}% de ${total})`;
  } catch (erro) {
    console.error("Falha ao carregar estatística do selo:", erro);
    el.textContent = "";
  }
}

/**
 * Mesma ideia, pro mega-selo de região.
 */
async function mostrarEstatisticaSeloRegiao(regiaoId) {
  const el = document.getElementById("regiao-selo-estatistica");
  if (!el) return;
  el.textContent = "Calculando quantas contas têm esse selo...";
  try {
    const [qtd, total] = await Promise.all([
      window.raspadinhaAuth.contarPessoasComRegiao(regiaoId),
      window.raspadinhaAuth.contarTotalContas(),
    ]);
    if (!total) {
      el.textContent = "";
      return;
    }
    const pct = (qtd / total) * 100;
    el.textContent = `👥 ${qtd} conta${qtd === 1 ? "" : "s"} tem esse mega-selo (${pct.toFixed(1)}% de ${total})`;
  } catch (erro) {
    console.error("Falha ao carregar estatística do mega-selo:", erro);
    el.textContent = "";
  }
}

/**
 * Renderiza a lista de pontos turísticos do município (se existir em
 * data/destinos.json) dentro do popup. Cada item é clicável: abre um
 * espaço reservado para um texto histórico/curiosidade (a preencher
 * depois) e um botão "Abrir no Maps" — desabilitado até existir um
 * link de verdade (campo `linkMaps`, reservado, ainda não existe em
 * nenhum destino).
 */
/* ============================================================
   Busca de município/ponto turístico (canto inferior direito): ao
   escolher um resultado, anima o zoom até o local (ver
   window.controleMapa.focarEmMunicipio em inicializarPanZoomDoMapa)
   e abre o selo, como se tivesse clicado nele no mapa.
   ============================================================ */

function construirIndiceBusca() {
  const itens = [];
  document.querySelectorAll("#mapa-rj .municipio").forEach((path) => {
    const id = path.dataset.municipio;
    const nome = path.dataset.nome;
    itens.push({ tipo: "municipio", id, nomeMunicipio: nome, texto: nome });

    destinosPorMunicipio[id]?.destinos?.forEach((d) => {
      itens.push({
        tipo: "destino",
        id,
        nomeMunicipio: nome,
        nomeDestino: d.nome,
        texto: `${d.nome} ${nome}`,
      });
    });
  });
  return itens;
}

function abrirBuscaLocal() {
  document.getElementById("input-busca-local").value = "";
  document.getElementById("busca-local-resultados").innerHTML = "";
  document.getElementById("modal-busca-local").classList.remove("oculto");
  document.getElementById("input-busca-local").focus();
}

function fecharBuscaLocal() {
  document.getElementById("modal-busca-local").classList.add("oculto");
}

function filtrarBuscaLocal() {
  const termo = document.getElementById("input-busca-local").value.trim().toLowerCase();
  const container = document.getElementById("busca-local-resultados");

  if (!termo) {
    container.innerHTML = "";
    return;
  }

  const resultados = construirIndiceBusca()
    .filter((item) => item.texto.toLowerCase().includes(termo))
    .slice(0, 30);

  if (!resultados.length) {
    container.innerHTML = "<p>Nada encontrado.</p>";
    return;
  }

  container.innerHTML = "";
  resultados.forEach((item) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "busca-local-item";
    botao.innerHTML =
      item.tipo === "municipio"
        ? `📍 ${escaparHtml(item.nomeMunicipio)}`
        : `🎯 ${escaparHtml(item.nomeDestino)} <span class="busca-local-sub">${escaparHtml(item.nomeMunicipio)}</span>`;
    botao.addEventListener("click", () => selecionarResultadoBusca(item));
    container.appendChild(botao);
  });
}

/**
 * Fecha a busca, anima o mapa até o município (zoom + centralização)
 * e, quando a animação termina, abre o selo -- igual a clicar nele
 * direto no mapa.
 */
function selecionarResultadoBusca(item) {
  fecharBuscaLocal();
  exigirLogin(() => {
    window.controleMapa?.focarEmMunicipio(item.id);
    setTimeout(() => abrirSeloPorId(item.id, item.nomeMunicipio), 650);
  });
}

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
  document.querySelectorAll("#mapa-rj .municipio").forEach((path) => {
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

  const municipios = Array.from(document.querySelectorAll("#mapa-rj .municipio"))
    .map((path) => ({ id: path.dataset.municipio, nome: path.dataset.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const totalVisitados = municipios.filter((m) => estaVerificado(m.id)).length;
  document.getElementById("biblioteca-contador").textContent =
    `${totalVisitados} / ${municipios.length} selos coletados`;
  document.getElementById("biblioteca-barra-preenchida").style.width =
    `${(totalVisitados / municipios.length) * 100}%`;

  municipios.forEach(({ id, nome }) => {
    const visitado = !!estadoMapa[id]?.visitado;
    const verificado = estaVerificado(id);
    const brilhante = visitado && !!estadoMapa[id]?.brilhante;

    const item = document.createElement("button");
    item.type = "button";
    item.className =
      "selo-item" +
      (brilhante ? " selo-item-brilhante" : "") +
      (visitado && !verificado ? " selo-item-nao-verificado" : "");
    item.title = !verificado && visitado
      ? `${nome} ⚠️ (raspado, mas não verificado)`
      : brilhante
      ? `${nome} ✨ (raspadinha brilhante!)`
      : nome;
    item.addEventListener("click", () => {
      fecharBibliotecaSelos();
      abrirSeloPorId(id, nome);
    });

    const img = document.createElement("img");
    img.alt = nome;
    img.className = verificado ? "selo-colorido" : visitado ? "selo-nao-verificado" : "selo-cinza";

    resolverImagemColorida(`assets/img/selos/${id}`, brilhante, id, nome).then((resultado) => {
      img.src = resultado.url;
    });

    const legenda = document.createElement("span");
    legenda.textContent = nome;

    item.appendChild(img);
    if (visitado && !verificado) {
      const alerta = document.createElement("span");
      alerta.className = "selo-marca-alerta";
      alerta.textContent = "⚠️";
      item.appendChild(alerta);
    } else if (brilhante) {
      const marca = document.createElement("span");
      marca.className = "selo-marca-brilhante";
      marca.textContent = "✨";
      item.appendChild(marca);
    }
    item.appendChild(legenda);
    grade.appendChild(item);
  });

  renderizarGradeRegioesNaBiblioteca();
  renderizarGradeConquistasNaBiblioteca();

  document.getElementById("biblioteca-selos").classList.remove("oculto");
}

/**
 * Mega-selos de região dentro da biblioteca (mesma grade visual dos
 * municípios) — só clicáveis (abrem o popup da região) quando a
 * região já está completa, senão mostram cadeado.
 */
function renderizarGradeRegioesNaBiblioteca() {
  const grade = document.getElementById("biblioteca-grade-regioes");
  grade.innerHTML = "";

  const idsRegioes = Object.keys(municipiosPorRegiao).sort((a, b) =>
    (regioesInfo[a]?.nome || a).localeCompare(regioesInfo[b]?.nome || b, "pt-BR")
  );
  const completas = idsRegioes.filter((id) => regiaoEstaCompleta(id)).length;
  document.getElementById("biblioteca-titulo-regioes").textContent =
    `Selos de região (${completas} / ${idsRegioes.length})`;

  idsRegioes.forEach((id) => {
    const nome = regioesInfo[id]?.nome || id;
    const completa = regiaoEstaCompleta(id);
    const revelado = completa && !!estadoRegioes[id]?.revelado;
    const brilhante = revelado && !!estadoRegioes[id]?.brilhante;

    const item = document.createElement("button");
    item.type = "button";
    item.className = "selo-item" + (brilhante ? " selo-item-brilhante" : "");
    item.title = brilhante ? `${nome} ✨ (mega-selo brilhante!)` : nome;
    item.addEventListener("click", () => {
      fecharBibliotecaSelos();
      abrirPopupRegiao(id);
    });

    const img = document.createElement("img");
    img.alt = nome;
    img.className = revelado ? "selo-colorido" : "selo-cinza";

    if (revelado) {
      resolverImagemColorida(`assets/img/regioes/${id}`, brilhante, id, nome).then((resultado) => {
        img.src = resultado.url;
      });
    } else {
      img.src = gerarSeloPlaceholder(id, nome);
    }

    const legenda = document.createElement("span");
    legenda.textContent = completa ? nome : `🔒 ${nome}`;

    item.appendChild(img);
    if (brilhante) {
      const marca = document.createElement("span");
      marca.className = "selo-marca-brilhante";
      marca.textContent = "✨";
      item.appendChild(marca);
    }
    item.appendChild(legenda);
    grade.appendChild(item);
  });
}

/**
 * Selos de conquista dentro da biblioteca -- mesma ideia dos selos
 * de região: cadeado até desbloquear.
 */
function renderizarGradeConquistasNaBiblioteca() {
  const grade = document.getElementById("biblioteca-grade-conquistas");
  grade.innerHTML = "";

  const ctx = calcularContextoConquistas();
  const desbloqueadas = DEFINICOES_CONQUISTAS.filter((def) => {
    const { atual, meta } = progressoConquista(def, ctx);
    return atual >= meta;
  }).length;
  document.getElementById("biblioteca-titulo-conquistas").textContent =
    `Conquistas (${desbloqueadas} / ${DEFINICOES_CONQUISTAS.length})`;

  DEFINICOES_CONQUISTAS.forEach((def) => {
    const { chave, titulo, descricao } = def;
    const { atual, meta } = progressoConquista(def, ctx);
    const desbloqueada = atual >= meta;
    const revelado = desbloqueada && !!estadoConquistas[chave]?.revelado;

    const item = document.createElement("button");
    item.type = "button";
    item.className = "selo-item";
    item.title = `${titulo} — ${descricao}`;
    item.addEventListener("click", () => {
      fecharBibliotecaSelos();
      exigirLogin(abrirConquistas);
    });

    const img = document.createElement("img");
    img.alt = titulo;
    img.className = revelado ? "selo-colorido" : "selo-cinza";

    const caminhoColorido = `assets/img/conquistas/${chave}.png`;
    if (revelado) {
      carregarImagem(caminhoColorido).then((existeColorido) => {
        img.src = existeColorido ? caminhoColorido : gerarSeloPlaceholder(chave, titulo);
      });
    } else {
      img.src = gerarSeloPlaceholder(chave, titulo);
    }

    const legenda = document.createElement("span");
    legenda.textContent = desbloqueada ? titulo : `🔒 ${titulo}`;

    item.appendChild(img);
    item.appendChild(legenda);
    grade.appendChild(item);
  });
}

function fecharBibliotecaSelos() {
  document.getElementById("biblioteca-selos").classList.add("oculto");
}

function abrirConfiguracoes() {
  sincronizarCheckboxNotificacoes();
  document.getElementById("modal-configuracoes").classList.remove("oculto");
}

function fecharConfiguracoes() {
  document.getElementById("modal-configuracoes").classList.add("oculto");
}

/* ============================================================
   Conquistas: raspadinha própria pra cada marco. Vários TIPOS de
   meta (não só "X% dos municípios") -- ver progressoConquista().
   Percentuais são sempre arredondados pra CIMA (Math.ceil).
   ============================================================ */

// `raridade` é fixa/curada por dificuldade (não calculada por % de
// contas) -- da mais fácil (comum) pra mais difícil (farmador de
// aura), na ordem que faz sentido pra cada tipo de meta.
const DEFINICOES_CONQUISTAS = [
  { chave: "primeiros-passos", titulo: "Primeiros Passos", tipo: "municipios", meta: 3, raridade: "comum", descricao: "Visite e confirme 3 municípios." },
  { chave: "25pct", titulo: "Explorador Iniciante", tipo: "municipios-pct", meta: 0.25, raridade: "incomum", descricao: "Confirme 25% dos municípios do RJ." },
  { chave: "50pct", titulo: "Meio Caminho Andado", tipo: "municipios-pct", meta: 0.5, raridade: "raro", descricao: "Confirme 50% dos municípios do RJ." },
  { chave: "75pct", titulo: "Quase Lá", tipo: "municipios-pct", meta: 0.75, raridade: "muito-raro", descricao: "Confirme 75% dos municípios do RJ." },
  { chave: "100pct", titulo: "Desbravador", tipo: "municipios-pct", meta: 1, raridade: "lendario", descricao: "Confirme os 92 municípios do RJ." },

  { chave: "streak-7", titulo: "Semana Cheia", tipo: "streak", meta: 7, raridade: "incomum", descricao: "Abra o app 7 dias seguidos, sem pular nenhum." },

  { chave: "dia-3", titulo: "Dia Corrido", tipo: "municipios-no-dia", meta: 3, raridade: "incomum", descricao: "Confirme 3 municípios diferentes no mesmo dia." },
  { chave: "dia-5", titulo: "Maratona do Dia", tipo: "municipios-no-dia", meta: 5, raridade: "raro", descricao: "Confirme 5 municípios diferentes no mesmo dia." },
  { chave: "dia-8", titulo: "Turbo Turista", tipo: "municipios-no-dia", meta: 8, raridade: "muito-raro", descricao: "Confirme 8 municípios diferentes no mesmo dia." },

  { chave: "regiao-1", titulo: "Primeira Região", tipo: "regioes", meta: 1, raridade: "incomum", descricao: "Complete todos os municípios de 1 região e raspe o mega-selo." },
  { chave: "regiao-25pct", titulo: "Regiões em Dobro", tipo: "regioes-pct", meta: 0.25, raridade: "raro", descricao: "Complete 25% das 8 regiões do RJ." },
  { chave: "regiao-50pct", titulo: "Metade do Estado", tipo: "regioes-pct", meta: 0.5, raridade: "muito-raro", descricao: "Complete 50% das 8 regiões do RJ." },
  { chave: "regiao-100pct", titulo: "Senhor das Regiões", tipo: "regioes-pct", meta: 1, raridade: "lendario", descricao: "Complete as 8 regiões do RJ." },

  { chave: "brilhante-1", titulo: "Primeira Fagulha", tipo: "brilhantes", meta: 1, raridade: "raro", descricao: "Consiga 1 selo de município brilhante (5% de chance por raspagem)." },
  { chave: "brilhante-3", titulo: "Coleção Dourada", tipo: "brilhantes", meta: 3, raridade: "muito-raro", descricao: "Consiga 3 selos de município brilhantes." },
  { chave: "brilhante-5", titulo: "Mão de Ouro", tipo: "brilhantes", meta: 5, raridade: "muito-raro", descricao: "Consiga 5 selos de município brilhantes." },
  { chave: "brilhante-10", titulo: "Sortudo", tipo: "brilhantes", meta: 10, raridade: "lendario", descricao: "Consiga 10 selos de município brilhantes." },
  { chave: "brilhante-25", titulo: "Ímã de Sorte", tipo: "brilhantes", meta: 25, raridade: "lendario", descricao: "Consiga 25 selos de município brilhantes." },
  { chave: "brilhante-50", titulo: "Rei do Brilho", tipo: "brilhantes", meta: 50, raridade: "farmador", descricao: "Consiga 50 selos de município brilhantes." },
  { chave: "brilhante-100pct", titulo: "Tudo Reluz", tipo: "brilhantes-pct", meta: 1, raridade: "farmador", descricao: "Deixe os 92 selos de município brilhantes." },

  { chave: "regiao-brilhante-1", titulo: "Região Radiante", tipo: "regioes-brilhantes", meta: 1, raridade: "muito-raro", descricao: "Consiga 1 mega-selo de região brilhante (10% de chance)." },
  { chave: "regiao-brilhante-25pct", titulo: "Constelação Regional", tipo: "regioes-brilhantes-pct", meta: 0.25, raridade: "lendario", descricao: "Consiga mega-selos brilhantes em 25% das regiões." },
  { chave: "regiao-brilhante-50pct", titulo: "Metade em Ouro", tipo: "regioes-brilhantes-pct", meta: 0.5, raridade: "farmador", descricao: "Consiga mega-selos brilhantes em 50% das regiões." },
  { chave: "regiao-brilhante-100pct", titulo: "Reino Dourado", tipo: "regioes-brilhantes-pct", meta: 1, raridade: "farmador", descricao: "Consiga mega-selos brilhantes nas 8 regiões." },
];

/**
 * Maior quantidade de municípios verificados no MESMO dia de
 * calendário (agrupando por `dataVisita`) -- alimenta as conquistas
 * "municipios-no-dia" (visitar 3/5/8 num único dia).
 */
function maiorQuantidadeMunicipiosNoMesmoDia() {
  const contagemPorDia = {};
  Object.keys(estadoMapa).forEach((id) => {
    if (!estaVerificado(id)) return;
    const data = estadoMapa[id].dataVisita;
    if (!data) return;
    const diaChave = new Date(data).toDateString();
    contagemPorDia[diaChave] = (contagemPorDia[diaChave] || 0) + 1;
  });
  const valores = Object.values(contagemPorDia);
  return valores.length ? Math.max(...valores) : 0;
}

/**
 * Junta todos os números que as conquistas precisam, calculados uma
 * vez por abertura/atualização (evita recalcular tudo pra cada
 * conquista da lista).
 */
function calcularContextoConquistas() {
  const totalMunicipios = document.querySelectorAll("#mapa-rj .municipio").length;
  const totalRegioes = Object.keys(municipiosPorRegiao).length;
  return {
    totalMunicipios,
    totalRegioes,
    municipiosVerificados: Object.keys(estadoMapa).filter((id) => estaVerificado(id)).length,
    regioesCompletas: Object.keys(municipiosPorRegiao).filter((id) => regiaoEstaCompleta(id)).length,
    municipiosBrilhantes: Object.keys(estadoMapa).filter(
      (id) => estadoMapa[id]?.visitado && estadoMapa[id]?.brilhante
    ).length,
    regioesBrilhantes: Object.keys(estadoRegioes).filter(
      (id) => estadoRegioes[id]?.revelado && estadoRegioes[id]?.brilhante
    ).length,
    maiorNoDia: maiorQuantidadeMunicipiosNoMesmoDia(),
    streakAtual: estadoStreak.contagem,
  };
}

/**
 * Progresso atual/meta de UMA conquista, de acordo com o `tipo`
 * dela, usando o contexto já calculado (ver calcularContextoConquistas).
 */
function progressoConquista(def, ctx) {
  switch (def.tipo) {
    case "municipios":
      return { atual: Math.min(ctx.municipiosVerificados, def.meta), meta: def.meta };
    case "municipios-pct": {
      const meta = Math.ceil(ctx.totalMunicipios * def.meta);
      return { atual: Math.min(ctx.municipiosVerificados, meta), meta };
    }
    case "streak":
      return { atual: Math.min(ctx.streakAtual, def.meta), meta: def.meta };
    case "municipios-no-dia":
      return { atual: Math.min(ctx.maiorNoDia, def.meta), meta: def.meta };
    case "regioes":
      return { atual: Math.min(ctx.regioesCompletas, def.meta), meta: def.meta };
    case "regioes-pct": {
      const meta = Math.max(1, Math.ceil(ctx.totalRegioes * def.meta));
      return { atual: Math.min(ctx.regioesCompletas, meta), meta };
    }
    case "brilhantes":
      return { atual: Math.min(ctx.municipiosBrilhantes, def.meta), meta: def.meta };
    case "brilhantes-pct":
      return { atual: Math.min(ctx.municipiosBrilhantes, ctx.totalMunicipios), meta: ctx.totalMunicipios };
    case "regioes-brilhantes":
      return { atual: Math.min(ctx.regioesBrilhantes, def.meta), meta: def.meta };
    case "regioes-brilhantes-pct": {
      const meta = Math.max(1, Math.ceil(ctx.totalRegioes * def.meta));
      return { atual: Math.min(ctx.regioesBrilhantes, meta), meta };
    }
    default:
      return { atual: 0, meta: def.meta || 1 };
  }
}

// Rótulo exibido pra cada nível de raridade (a raridade em si é fixa
// por conquista, ver campo `raridade` em DEFINICOES_CONQUISTAS --
// classificada por dificuldade, não por quantas contas já têm).
const NOMES_RARIDADE = {
  comum: "Comum",
  incomum: "Incomum",
  raro: "Raro",
  "muito-raro": "Muito raro",
  lendario: "Lendário",
  farmador: "Farmador de Aura",
};

function abrirConquistas() {
  const container = document.getElementById("conquistas-lista");
  container.innerHTML = "";

  const ctx = calcularContextoConquistas();

  DEFINICOES_CONQUISTAS.forEach((def) => {
    const { atual, meta } = progressoConquista(def, ctx);
    const desbloqueada = atual >= meta;

    const item = document.createElement("div");
    item.className = "conquista-item";
    item.innerHTML = `
      <h3>${escaparHtml(def.titulo)}</h3>
      <span class="conquista-raridade raridade-${def.raridade}">${NOMES_RARIDADE[def.raridade]}</span>
      <p class="conquista-descricao">${escaparHtml(def.descricao)}</p>
      <p class="conquista-progresso-texto">${atual} / ${meta}</p>
      <div class="conquista-barra"><div class="conquista-barra-preenchida" style="width:${(atual / meta) * 100}%"></div></div>
      <div class="conquista-selo-body" id="conquista-selo-${def.chave}"></div>
      <p class="conquista-instrucao" id="conquista-instrucao-${def.chave}"></p>
    `;
    container.appendChild(item);

    renderizarSeloConquista(def.chave, def.titulo, desbloqueada);
  });

  document.getElementById("modal-conquistas").classList.remove("oculto");
}

function renderizarSeloConquista(chave, titulo, desbloqueada) {
  const corpo = document.getElementById(`conquista-selo-${chave}`);
  const instrucao = document.getElementById(`conquista-instrucao-${chave}`);

  if (!desbloqueada) {
    instrucao.textContent = "Continue jogando para desbloquear.";
    corpo.innerHTML = `<div class="selo-bloqueado">🔒</div>`;
    return;
  }

  if (estadoConquistas[chave]?.revelado) {
    instrucao.textContent = "";
    const caminhoColorido = `assets/img/conquistas/${chave}.png`;
    carregarImagem(caminhoColorido).then((existeColorido) => {
      corpo.innerHTML = "";
      const wrapper = document.createElement("div");
      wrapper.className = "selo-revelado-wrapper";
      const img = document.createElement("img");
      img.src = existeColorido ? caminhoColorido : gerarSeloPlaceholder(chave, titulo, 200);
      img.alt = titulo;
      img.className = "selo-revelado";
      wrapper.appendChild(img);
      corpo.appendChild(wrapper);
    });
    return;
  }

  instrucao.textContent = "Conquista desbloqueada! Raspe o selo.";
  mostrarSpinnerGrande(corpo, true);
  const caminhoColorido = `assets/img/conquistas/${chave}.png`;
  const caminhoCapa = `assets/img/conquistas/${chave}fundo.png`;
  carregarImagem(caminhoColorido).then((existeColorido) => {
    const imageUrl = existeColorido ? caminhoColorido : gerarSeloPlaceholder(chave, titulo, 200);
    const usarCapa = existeColorido
      ? carregarImagem(caminhoCapa).then((existeCapa) => (existeCapa ? caminhoCapa : null))
      : Promise.resolve(null);
    usarCapa.then((imageUrlCapa) => {
      corpo.innerHTML = "";
      initScratchCard({
        containerId: `conquista-selo-${chave}`,
        imageUrl,
        imageUrlCapa,
        tamanho: 200,
        onComplete: () => {
          marcarConquistaComoRevelada(chave);
          return false; // conquistas nao entram no sorteio de brilhante
        },
      });
    });
  });
}

function marcarConquistaComoRevelada(chave) {
  estadoConquistas[chave] = { revelado: true, dataRevelado: new Date().toISOString() };
  salvarEstadoConquistas();
  window.raspadinhaAuth?.usuarioAtual && window.raspadinhaAuth.sincronizarConquista(chave, true);
}

/**
 * Chamada sempre que o progresso muda (marcarComoVisitado). Se o
 * modal de conquistas estiver aberto, re-renderiza pra barra de
 * progresso e o desbloqueio aparecerem na hora. Independente disso,
 * também confere se alguma conquista acabou de ser desbloqueada (ver
 * verificarNovasConquistasDesbloqueadas), pra poder notificar mesmo
 * com o modal fechado.
 */
function atualizarProgressoConquistas() {
  verificarNovasConquistasDesbloqueadas();
  if (!document.getElementById("modal-conquistas").classList.contains("oculto")) {
    abrirConquistas();
  }
}

const CHAVE_CONQUISTAS_NOTIFICADAS = "scratchMapRJ_conquistas_notificadas_v1";

/**
 * Compara o progresso atual de cada conquista contra a meta e
 * notifica (uma única vez por conquista, controlado por uma lista no
 * localStorage) as que acabaram de ser desbloqueadas -- mesmo que o
 * modal de Conquistas nunca tenha sido aberto pra "ver" a mudança.
 */
function verificarNovasConquistasDesbloqueadas() {
  const ctx = calcularContextoConquistas();
  const jaNotificadas = new Set(
    JSON.parse(localStorage.getItem(chaveComUid(CHAVE_CONQUISTAS_NOTIFICADAS)) || "[]")
  );
  let mudou = false;

  DEFINICOES_CONQUISTAS.forEach((def) => {
    const { atual, meta } = progressoConquista(def, ctx);
    if (atual >= meta && !jaNotificadas.has(def.chave)) {
      jaNotificadas.add(def.chave);
      mudou = true;
      dispararNotificacaoLocal("🏆 Conquista desbloqueada!", {
        body: `${def.titulo} — raspe o selo pra revelar.`,
        tag: `conquista-${def.chave}`,
      });
    }
  });

  if (mudou) {
    localStorage.setItem(chaveComUid(CHAVE_CONQUISTAS_NOTIFICADAS), JSON.stringify([...jaNotificadas]));
  }
}

function fecharConquistas() {
  document.getElementById("modal-conquistas").classList.add("oculto");
}

/* ============================================================
   Ranking online: quem visitou mais municípios, por apelido.
   ============================================================ */

let abaRankingAtual = "global";

function abrirRanking() {
  document.getElementById("modal-ranking").classList.remove("oculto");
  carregarRanking();
}

function alternarAbaRanking(aba) {
  abaRankingAtual = aba;
  document.getElementById("btn-ranking-global").classList.toggle("ranking-aba-ativa", aba === "global");
  document.getElementById("btn-ranking-amigos").classList.toggle("ranking-aba-ativa", aba === "amigos");
  carregarRanking();
}

function renderizarLinhaRanking(lista, item, indice, meuUid) {
  const linha = document.createElement("div");
  linha.className = "ranking-linha" + (item.uid === meuUid ? " ranking-linha-atual" : "");
  linha.innerHTML = `
    <span class="ranking-posicao">#${indice + 1}</span>
    <span class="ranking-apelido">${escaparHtml(item.apelido)}${item.ehPro ? '<span class="badge-pro" title="Conta PRO">PRO</span>' : ""}</span>
    <span class="ranking-count">${item.count}</span>
  `;
  linha.style.cursor = "pointer";
  linha.addEventListener("click", () => {
    fecharRanking();
    abrirPerfil(item.uid);
  });
  lista.appendChild(linha);
}

async function carregarRanking() {
  const lista = document.getElementById("ranking-lista");
  const minhaPosicaoEl = document.getElementById("ranking-minha-posicao");
  lista.innerHTML = '<div class="spinner spinner-grande"></div>';
  minhaPosicaoEl.textContent = "";

  try {
    const meuUid = window.raspadinhaAuth.usuarioAtual.uid;
    const meuCount = Object.keys(estadoMapa).filter((id) => estaVerificado(id)).length;

    if (abaRankingAtual === "amigos") {
      const amigos = await window.raspadinhaAuth.listarAmigos();
      const ranking = [
        ...amigos,
        {
          uid: meuUid,
          apelido: window.raspadinhaAuth.apelido,
          count: meuCount,
          ehPro: window.raspadinhaAuth.contaEhPro,
        },
      ].sort((a, b) => b.count - a.count);

      lista.innerHTML = "";
      if (ranking.length <= 1) {
        lista.innerHTML = "<p>Adicione amigos pra ver o ranking entre vocês.</p>";
      } else {
        ranking.forEach((item, indice) => renderizarLinhaRanking(lista, item, indice, meuUid));
      }
      minhaPosicaoEl.textContent = "";
      return;
    }

    const [ranking, minhaPosicao] = await Promise.all([
      window.raspadinhaAuth.buscarRanking(50),
      window.raspadinhaAuth.buscarMinhaPosicao(meuCount),
    ]);

    lista.innerHTML = "";
    if (!ranking.length) {
      lista.innerHTML = "<p>Ninguém no ranking ainda. Seja o primeiro a raspar!</p>";
    } else {
      ranking.forEach((item, indice) => renderizarLinhaRanking(lista, item, indice, meuUid));
    }

    minhaPosicaoEl.textContent = `Sua posição: #${minhaPosicao} (${meuCount} municípios)`;
  } catch (erro) {
    console.error("Falha ao carregar ranking:", erro);
    lista.innerHTML = "<p>Não foi possível carregar o ranking agora. Tente de novo mais tarde.</p>";
  }
}

function fecharRanking() {
  document.getElementById("modal-ranking").classList.add("oculto");
}

/* ============================================================
   Amigos: buscar por e-mail/apelido, pedidos e lista de amigos.
   ============================================================ */

function abrirAmigos() {
  document.getElementById("input-busca-amigo").value = "";
  document.getElementById("amigos-resultado-busca").innerHTML = "";
  document.getElementById("modal-amigos").classList.remove("oculto");
  carregarPedidosAmizade();
  carregarListaAmigos();
}

function fecharAmigos() {
  document.getElementById("modal-amigos").classList.add("oculto");
}

async function buscarAmigoPorTexto() {
  const texto = document.getElementById("input-busca-amigo").value.trim();
  const resultado = document.getElementById("amigos-resultado-busca");
  if (!texto) return;

  resultado.innerHTML = '<div class="spinner spinner-grande"></div>';
  try {
    const encontrado = await window.raspadinhaAuth.buscarUsuario(texto);
    if (!encontrado) {
      resultado.innerHTML = "<p>Ninguém encontrado com esse e-mail/apelido.</p>";
      return;
    }
    const souEu = encontrado.uid === window.raspadinhaAuth.usuarioAtual?.uid;
    resultado.innerHTML = `
      <div class="amigo-resultado-item">
        <span>${escaparHtml(encontrado.apelido)}</span>
        <button type="button" class="btn-adicionar-amigo" data-uid="${encontrado.uid}" ${souEu ? "disabled" : ""}>
          ${souEu ? "Esse é você" : "Adicionar amigo"}
        </button>
      </div>`;
    resultado.querySelector(".btn-adicionar-amigo")?.addEventListener("click", async (evento) => {
      const botao = evento.currentTarget;
      botao.disabled = true;
      botao.textContent = "Enviando...";
      try {
        await window.raspadinhaAuth.enviarPedidoAmizade(botao.dataset.uid);
        botao.textContent = "Pedido enviado!";
      } catch (erro) {
        botao.disabled = false;
        botao.textContent = "Adicionar amigo";
        alert(erro?.message || "Não foi possível enviar o pedido.");
      }
    });
  } catch (erro) {
    console.error("Falha ao buscar usuário:", erro);
    resultado.innerHTML = "<p>Não foi possível buscar agora. Tente de novo.</p>";
  }
}

async function carregarPedidosAmizade() {
  const lista = document.getElementById("amigos-pedidos-lista");
  lista.innerHTML = '<div class="spinner spinner-grande"></div>';
  try {
    const pedidos = await window.raspadinhaAuth.listarPedidosRecebidos();
    if (!pedidos.length) {
      lista.innerHTML = "<p>Nenhum pedido de amizade pendente.</p>";
      return;
    }
    lista.innerHTML = "";
    pedidos.forEach((pedido) => {
      const item = document.createElement("div");
      item.className = "amigo-pedido-item";
      item.innerHTML = `
        <span>${escaparHtml(pedido.apelido)}</span>
        <button type="button" class="btn-aceitar-pedido">Aceitar</button>
        <button type="button" class="btn-recusar-pedido">Recusar</button>
      `;
      item.querySelector(".btn-aceitar-pedido").addEventListener("click", async () => {
        await window.raspadinhaAuth.aceitarPedidoAmizade(pedido.uid);
        carregarPedidosAmizade();
        carregarListaAmigos();
      });
      item.querySelector(".btn-recusar-pedido").addEventListener("click", async () => {
        await window.raspadinhaAuth.recusarPedidoAmizade(pedido.uid);
        carregarPedidosAmizade();
      });
      lista.appendChild(item);
    });
  } catch (erro) {
    console.error("Falha ao carregar pedidos de amizade:", erro);
    lista.innerHTML = "<p>Não foi possível carregar os pedidos agora.</p>";
  }
}

async function carregarListaAmigos() {
  const lista = document.getElementById("amigos-lista");
  lista.innerHTML = '<div class="spinner spinner-grande"></div>';
  try {
    const amigos = await window.raspadinhaAuth.listarAmigos();
    if (!amigos.length) {
      lista.innerHTML = "<p>Você ainda não tem amigos adicionados.</p>";
      return;
    }
    lista.innerHTML = "";
    amigos
      .sort((a, b) => b.count - a.count)
      .forEach((amigo) => {
        const item = document.createElement("div");
        item.className = "amigo-item";
        item.innerHTML = `
          <span class="amigo-apelido">${escaparHtml(amigo.apelido)}</span>
          <span class="amigo-count">${amigo.count} municípios</span>
          <button type="button" class="btn-remover-amigo">Remover</button>
        `;
        item.querySelector(".amigo-apelido").style.cursor = "pointer";
        item.querySelector(".amigo-apelido").addEventListener("click", () => {
          fecharAmigos();
          abrirPerfil(amigo.uid);
        });
        item.querySelector(".btn-remover-amigo").addEventListener("click", async () => {
          if (!confirm(`Remover ${amigo.apelido} da sua lista de amigos?`)) return;
          await window.raspadinhaAuth.removerAmigo(amigo.uid);
          carregarListaAmigos();
        });
        lista.appendChild(item);
      });
  } catch (erro) {
    console.error("Falha ao carregar lista de amigos:", erro);
    lista.innerHTML = "<p>Não foi possível carregar seus amigos agora.</p>";
  }
}

/* ============================================================
   Check-in semanal: marca os dias da semana (dom-sáb) em que o app
   foi aberto. Semanal (não mensal) porque é um app de viagem -- os
   acessos são poucos e espaçados, então uma semana é uma unidade de
   progresso mais realista que um mês inteiro.
   ============================================================ */

const NOMES_DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const NOMES_MESES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

async function abrirCheckin() {
  const modal = document.getElementById("modal-checkin");
  const calendario = document.getElementById("checkin-calendario");
  const hoje = new Date();
  const diaDaSemanaHoje = hoje.getDay();

  const domingo = new Date(hoje);
  domingo.setDate(hoje.getDate() - diaDaSemanaHoje);
  const sabado = new Date(domingo);
  sabado.setDate(domingo.getDate() + 6);

  document.getElementById("checkin-semana-label").textContent =
    `Semana de ${domingo.getDate()} ${NOMES_MESES_ABREV[domingo.getMonth()]} a ${sabado.getDate()} ${NOMES_MESES_ABREV[sabado.getMonth()]}`;
  calendario.innerHTML = '<div class="spinner spinner-grande"></div>';
  modal.classList.remove("oculto");

  try {
    const dias = await window.raspadinhaAuth.buscarCheckinsDaSemana();

    calendario.innerHTML = "";
    NOMES_DIAS_SEMANA.forEach((nomeDia, indiceDia) => {
      const celula = document.createElement("div");
      celula.className = "checkin-dia";
      if (dias.includes(indiceDia)) celula.classList.add("checkin-feito");
      if (indiceDia === diaDaSemanaHoje) celula.classList.add("checkin-hoje");
      celula.textContent = nomeDia;
      calendario.appendChild(celula);
    });
  } catch (erro) {
    console.error("Falha ao carregar check-in:", erro);
    calendario.innerHTML = "<p>Não foi possível carregar o check-in agora.</p>";
  }
}

function fecharCheckin() {
  document.getElementById("modal-checkin").classList.add("oculto");
}

/* ============================================================
   Feedback e colaboração: relatar bug, dar sugestão, ou colaborar
   (opcionalmente, via PIX). Bug/sugestão exigem login (mesma regra
   de qualquer outra interação de verdade no app -- ver exigirLogin);
   ver a chave PIX já mostra sem precisar logar.
   ============================================================ */

function abrirFeedback() {
  document.getElementById("modal-feedback").classList.remove("oculto");
  document.getElementById("pix-chave-texto").textContent = CHAVE_PIX_COLABORACAO;
}

function fecharFeedback() {
  document.getElementById("modal-feedback").classList.add("oculto");
  document.querySelectorAll(".feedback-painel").forEach((painel) => painel.classList.add("oculto"));
  document
    .querySelectorAll(".feedback-opcao")
    .forEach((botao) => botao.classList.remove("feedback-opcao-ativa"));
}

function mostrarPainelFeedback(painel) {
  document.querySelectorAll(".feedback-painel").forEach((el) => {
    el.classList.toggle("oculto", el.id !== `feedback-painel-${painel}`);
  });
  document.querySelectorAll(".feedback-opcao").forEach((botao) => {
    botao.classList.toggle("feedback-opcao-ativa", botao.dataset.painel === painel);
  });
}

/**
 * Envia um relato de bug, sugestão ou ponto turístico (coleção
 * "feedback" no Firestore) -- exige login, igual qualquer outra
 * interação de verdade no app. A regra do Firestore só aceita `tipo`
 * "bug"/"sugestao"/"ponto-turistico" e um texto não vazio (ver
 * README.md). Ponto turístico também exige o nome do município.
 */
function enviarFeedback(tipo) {
  exigirLogin(async () => {
    const textarea = document.getElementById(`input-feedback-${tipo}`);
    const botao = document.getElementById(`btn-enviar-feedback-${tipo}`);
    const status = document.getElementById(`feedback-status-${tipo}`);
    const texto = textarea.value.trim();

    const inputMunicipio =
      tipo === "ponto-turistico" ? document.getElementById("input-ponto-turistico-municipio") : null;
    const municipio = inputMunicipio?.value.trim() || "";

    if (!texto) return;
    if (inputMunicipio && !municipio) return;

    botao.disabled = true;
    botao.querySelector(".btn-texto").classList.add("oculto");
    botao.querySelector(".spinner").classList.remove("oculto");
    status.classList.add("oculto");

    try {
      await window.raspadinhaAuth.enviarFeedback(tipo, texto, municipio ? { municipio } : {});
      textarea.value = "";
      if (inputMunicipio) inputMunicipio.value = "";
      status.textContent = "🎉 Recebemos o seu relato! Muito obrigado por ajudar a melhorar o Desbrava.";
      status.className = "feedback-status status-sucesso";
      const rect = botao.getBoundingClientRect();
      dispararConfete(rect.left + rect.width / 2, rect.top);
    } catch (erro) {
      console.error("Falha ao enviar feedback:", erro);
      status.textContent = "Não foi possível enviar agora -- tenta de novo em instantes?";
      status.className = "feedback-status status-erro";
    } finally {
      botao.disabled = false;
      botao.querySelector(".btn-texto").classList.remove("oculto");
      botao.querySelector(".spinner").classList.add("oculto");
    }
  });
}

/**
 * Copia a chave PIX pra área de transferência (com um retorno visual
 * rápido); se a Clipboard API não estiver disponível, mostra a chave
 * pra copiar manualmente.
 */
async function copiarChavePix() {
  const status = document.getElementById("feedback-status-pix");
  try {
    await navigator.clipboard.writeText(CHAVE_PIX_COLABORACAO);
    status.textContent = "Chave copiada! 💙";
    status.className = "feedback-status status-sucesso";
  } catch {
    status.textContent = "Não deu pra copiar sozinho -- selecione a chave acima manualmente.";
    status.className = "feedback-status status-erro";
  }
}

const CHAVE_BOAS_VINDAS_VISTAS = "scratchMapRJ_boasvindas_vistas_v1";

/**
 * Mostra, só na primeira vez (controlado por localStorage), um
 * tutorial curto explicando a ideia do app (incentivar a sair de casa
 * e conhecer municípios de verdade) e os conceitos principais: selos,
 * pontos turísticos, conquistas e selo brilhante. Ao fechar, encadeia
 * o aviso de "em desenvolvimento" (ver fecharBoasVindas) -- assim os
 * dois nunca aparecem sobrepostos ao mesmo tempo.
 */
function mostrarBoasVindasSeNecessario() {
  if (localStorage.getItem(CHAVE_BOAS_VINDAS_VISTAS)) {
    mostrarAvisoDesenvolvimentoSeNecessario();
    return;
  }
  document.getElementById("modal-boas-vindas").classList.remove("oculto");
}

function fecharBoasVindas() {
  localStorage.setItem(CHAVE_BOAS_VINDAS_VISTAS, "true");
  document.getElementById("modal-boas-vindas").classList.add("oculto");
  mostrarAvisoDesenvolvimentoSeNecessario();
}

const CHAVE_AVISO_DESENVOLVIMENTO_VISTO = "scratchMapRJ_aviso_dev_visto_v1";

/**
 * Mostra, só na primeira vez (controlado por localStorage), um aviso
 * de que o app ainda está em desenvolvimento -- não é a versão final,
 * ainda não está na Play Store, é e sempre vai ser gratuito, e dá pra
 * colaborar (nunca obrigatório) pelo botão 💬 no topo. Chamada depois
 * das boas-vindas (ver mostrarBoasVindasSeNecessario/fecharBoasVindas).
 */
function mostrarAvisoDesenvolvimentoSeNecessario() {
  if (localStorage.getItem(CHAVE_AVISO_DESENVOLVIMENTO_VISTO)) return;
  document.getElementById("modal-aviso-desenvolvimento").classList.remove("oculto");
}

function fecharAvisoDesenvolvimento() {
  localStorage.setItem(CHAVE_AVISO_DESENVOLVIMENTO_VISTO, "true");
  document.getElementById("modal-aviso-desenvolvimento").classList.add("oculto");
}

/* ============================================================
   Perfil público: outras pessoas podem abrir (via Ranking/Amigos) e
   ver os selos e um mini-mapa, se a pessoa não tiver marcado
   "privado" em Configurações.

   IMPORTANTE (limitação conhecida): a privacidade aqui é só de
   EXIBIÇÃO no app -- o documento do usuário já é legível por
   qualquer autenticado (regra do Firestore, necessária pro
   ranking/busca de amigos), então sem um Cloud Function não dá pra
   esconder o campo no nível do servidor. Suficiente pra um app
   hobby, mas vale saber.
   ============================================================ */

async function abrirPerfil(uid) {
  const modal = document.getElementById("modal-perfil");
  const corpo = document.getElementById("perfil-corpo");
  document.getElementById("perfil-apelido").textContent = "Carregando...";
  corpo.innerHTML = '<div class="spinner spinner-grande"></div>';
  modal.classList.remove("oculto");

  try {
    const perfil = await window.raspadinhaAuth.buscarPerfilPublico(uid);
    if (!perfil) {
      document.getElementById("perfil-apelido").textContent = "Perfil não encontrado";
      corpo.innerHTML = "";
      return;
    }

    document.getElementById("perfil-apelido").textContent = perfil.apelido;

    const ehOProprioPerfil = uid === window.raspadinhaAuth?.usuarioAtual?.uid;
    if (!perfil.perfilPublico && !ehOProprioPerfil) {
      corpo.innerHTML = "<p>🔒 Esse perfil é privado.</p>";
      return;
    }

    corpo.innerHTML = `
      <p id="perfil-contador">${perfil.municipiosVisitadosCount} municípios visitados</p>
      <div id="perfil-mapa-mini"></div>
      <div id="perfil-selos-grade"></div>
    `;
    renderizarMiniMapaPerfil(perfil.mapaSnapshot);
    renderizarSelosPerfil(perfil.estadoMunicipios);
  } catch (erro) {
    console.error("Falha ao carregar perfil:", erro);
    corpo.innerHTML = "<p>Não foi possível carregar esse perfil agora.</p>";
  }
}

function fecharPerfil() {
  document.getElementById("modal-perfil").classList.add("oculto");
}

/**
 * Gera e grava no Firestore um snapshot estático (imagem) do mapa do
 * usuário logado -- é essa imagem que alimenta o mini-mapa do perfil
 * público (ver renderizarMiniMapaPerfil e salvarSnapshotMapa em
 * js/auth.js). Roda toda vez que a conta loga (ver atualizarUiDeConta),
 * pra sempre refletir o progresso mais recente -- antes só regravava
 * 1x por dia (controlado por localStorage), o que deixava o mini-mapa
 * "parado" no perfil por até 24h depois de raspar um selo novo.
 */
function gerarSnapshotMapaSeNecessario() {
  const hoje = new Date().toDateString();
  gerarSnapshotMapaComoDataUrl()
    .then((dataUrl) => {
      if (!dataUrl) return;
      window.raspadinhaAuth?.salvarSnapshotMapa(dataUrl, hoje);
    })
    .catch((erro) => console.error("Falha ao gerar snapshot do mapa:", erro));
}

/**
 * Monta uma cópia standalone do SVG do mapa com as cores do estado
 * ATUAL do usuário logado gravadas como atributos `fill`/`stroke` (não
 * como classes CSS -- uma vez serializado fora do documento, o SVG
 * perde acesso à folha de estilo da página) e converte pra PNG via
 * <canvas>, devolvendo uma Promise com o data URL resultante.
 */
function gerarSnapshotMapaComoDataUrl() {
  return new Promise((resolve) => {
    const original = document.getElementById("mapa-rj");
    const clone = original.cloneNode(true);
    clone.removeAttribute("id");
    clone.removeAttribute("style");
    clone.querySelectorAll(".rotulo-municipio").forEach((el) => el.remove());
    clone.querySelector("#contornos-regioes")?.remove();
    clone.querySelector("#marcador-local-atual")?.remove();

    clone.querySelectorAll(".municipio").forEach((path) => {
      const id = path.dataset.municipio;
      const cor = estaVerificado(id) ? "#22c55e" : estadoMapa[id]?.visitado ? "#ef4444" : "#9ca3af";
      path.setAttribute("fill", cor);
      path.setAttribute("stroke", "#0f172a");
      path.setAttribute("stroke-width", "2");
      path.removeAttribute("class");
      path.onclick = null;
    });

    const largura = 400;
    const altura = 286; // mantém a proporção do viewBox (800 x 571.70)
    clone.setAttribute("width", largura);
    clone.setAttribute("height", altura);

    const svgTexto = new XMLSerializer().serializeToString(clone);
    const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgTexto)))}`;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, largura, altura);
      ctx.drawImage(img, 0, 0, largura, altura);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = svgDataUrl;
  });
}

/**
 * Mini-mapa do perfil: mostra o snapshot estático (gerado 1x por dia,
 * ver gerarSnapshotMapaSeNecessario) em vez de clonar o SVG ao vivo --
 * evita ficar deslocado/com zoom errado dependendo de como o mapa
 * grande estava no momento e não recalcula nada ao abrir o perfil.
 */
function renderizarMiniMapaPerfil(snapshotUrl) {
  const container = document.getElementById("perfil-mapa-mini");
  if (!container) return;
  container.innerHTML = "";

  if (!snapshotUrl) {
    const aviso = document.createElement("p");
    aviso.className = "mini-mapa-vazio";
    aviso.textContent = "Mapa ainda não disponível.";
    container.appendChild(aviso);
    return;
  }

  const img = document.createElement("img");
  img.className = "mini-mapa-imagem";
  img.alt = "Mini-mapa de progresso";
  img.src = snapshotUrl;
  container.appendChild(img);
}

/**
 * Grade (só leitura) dos selos de município de quem está sendo
 * visto, com a arte dourada quando o selo brilhante daquele
 * município estiver ativo.
 */
function renderizarSelosPerfil(estadoMunicipios) {
  const grade = document.getElementById("perfil-selos-grade");
  if (!grade) return;
  grade.innerHTML = "";

  const municipios = Array.from(document.querySelectorAll("#mapa-rj .municipio"))
    .map((path) => ({ id: path.dataset.municipio, nome: path.dataset.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  municipios.forEach(({ id, nome }) => {
    const estado = estadoMunicipios[id] || {};
    const item = document.createElement("div");
    item.className = "selo-item" + (estado.brilhante ? " selo-item-brilhante" : "");
    item.title = nome;

    const img = document.createElement("img");
    img.alt = nome;
    img.className = estado.verificado ? "selo-colorido" : "selo-cinza";
    resolverImagemColorida(`assets/img/selos/${id}`, !!estado.brilhante, id, nome).then((resultado) => {
      img.src = resultado.url;
    });

    const legenda = document.createElement("span");
    legenda.textContent = nome;

    item.appendChild(img);
    item.appendChild(legenda);
    grade.appendChild(item);
  });
}

/* ============================================================
   Aviso flutuante: raspadinha brilhante garantida (por convite de
   amigo) esperando pra ser usada na próxima raspagem.
   ============================================================ */

function atualizarAvisoBrilhantePendente() {
  const aviso = document.getElementById("aviso-brilhante-pendente");
  const pendentes = window.raspadinhaAuth?.boostsBrilhantesPendentes || 0;

  if (pendentes > 0) {
    document.getElementById("aviso-brilhante-texto").textContent =
      pendentes === 1
        ? "✨ Você tem uma raspadinha brilhante garantida te esperando!"
        : `✨ Você tem ${pendentes} raspadinhas brilhantes garantidas te esperando!`;
    aviso.classList.remove("oculto");
  } else {
    aviso.classList.add("oculto");
  }
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
  // So conta municipio VERIFICADO (confirmado por localizacao) --
  // raspar sem estar no local nao libera o mega-selo da regiao (ver
  // estaVerificado/regiaoEstaCompleta).
  const visitados = idsDaRegiao.filter((id) => estaVerificado(id)).length;
  const completa = visitados === idsDaRegiao.length && idsDaRegiao.length > 0;

  document.getElementById("regiao-nome").textContent = nomeRegiao;
  document.getElementById("regiao-status").textContent =
    `${visitados} / ${idsDaRegiao.length} municípios verificados`;
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
    document.getElementById("regiao-selo-estatistica").textContent = "";
    document.getElementById("modal-regiao").classList.remove("oculto");
    return;
  }

  if (estadoRegioes[regiaoId]?.revelado) {
    instrucao.textContent = "";
    exibirMegaSeloRevelado(regiaoId, corpo);
  } else {
    instrucao.textContent = "Região completa! Raspe o selo especial.";
    document.getElementById("regiao-selo-estatistica").textContent = "";
    mostrarSpinnerGrande(corpo, true);
    const nomeRegiaoSelo = regioesInfo[regiaoId]?.nome || regiaoId;
    // Selo de região brilhante: 10% de chance (o dobro do de
    // município), decidida na abertura -- mesma ideia de
    // decidirBrilhante, mas com sorteio próprio (ver
    // decidirBrilhanteRegiao).
    const brilhante = decidirBrilhanteRegiao(regiaoId);
    const caminhoCapa = `assets/img/regioes/${regiaoId}fundo.png`;
    resolverImagemColorida(`assets/img/regioes/${regiaoId}`, brilhante, regiaoId, nomeRegiaoSelo, 400).then(
      (resultado) => {
        const usarCapa = resultado.arteReal
          ? carregarImagem(caminhoCapa).then((existeCapa) => (existeCapa ? caminhoCapa : null))
          : Promise.resolve(null);
        usarCapa.then((imageUrlCapa) => {
          corpo.innerHTML = "";
          initScratchCard({
            containerId: "regiao-selo-body",
            imageUrl: resultado.url,
            imageUrlCapa,
            tamanho: 400,
            onPrimeiroToque: () => travarSorteRegiaoNaPrimeiraRaspada(regiaoId, brilhante),
            onComplete: () => {
              marcarRegiaoComoRevelada(regiaoId, brilhante);
              return brilhante;
            },
          });
        });
      }
    );
  }

  document.getElementById("modal-regiao").classList.remove("oculto");
}

function exibirMegaSeloRevelado(regiaoId, corpo) {
  const nomeRegiao = regioesInfo[regiaoId]?.nome || regiaoId;
  const brilhante = !!estadoRegioes[regiaoId]?.brilhante;
  resolverImagemColorida(`assets/img/regioes/${regiaoId}`, brilhante, regiaoId, nomeRegiao, 400).then(
    (resultado) => {
      const wrapper = document.createElement("div");
      wrapper.className = "selo-revelado-wrapper";
      const img = document.createElement("img");
      img.src = resultado.url;
      img.alt = nomeRegiao;
      img.className = "selo-revelado selo-revelado-grande";
      wrapper.appendChild(img);
      if (brilhante) adicionarBrilho(wrapper);
      corpo.appendChild(wrapper);
    }
  );
  mostrarEstatisticaSeloRegiao(regiaoId);
}

/**
 * Decide se o mega-selo de uma região é "brilhante" -- mesma lógica
 * de decidirBrilhante, mas com 10% de chance (o dobro do de
 * município) e sem consumir o boost de convite (esse só vale pra
 * selos de município).
 */
function decidirBrilhanteRegiao(regiaoId) {
  const anterior = estadoRegioes[regiaoId];
  if (anterior?.chanceDecidida) return !!anterior.brilhante;
  return Math.random() < 0.1;
}

/**
 * Mesma trava de travarSorteNaPrimeiraRaspada, mas pro mega-selo de
 * região: assim que a pessoa raspa a primeira vez, a sorte fica
 * fixada, mesmo que abandone sem terminar de raspar.
 */
function travarSorteRegiaoNaPrimeiraRaspada(regiaoId, brilhante) {
  if (estadoRegioes[regiaoId]?.chanceDecidida) return;
  estadoRegioes[regiaoId] = {
    ...estadoRegioes[regiaoId],
    brilhante: !!brilhante,
    chanceDecidida: true,
  };
  salvarEstadoRegioes();
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

function marcarRegiaoComoRevelada(regiaoId, brilhante) {
  estadoRegioes[regiaoId] = {
    revelado: true,
    dataRevelado: new Date().toISOString(),
    brilhante: !!brilhante,
    chanceDecidida: true,
  };
  salvarEstadoRegioes();
  if (window.raspadinhaAuth?.usuarioAtual) {
    window.raspadinhaAuth.sincronizarRegiao(regiaoId, { revelado: true, brilhante: !!brilhante });
  }
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
  document.querySelectorAll("#mapa-rj .municipio").forEach((path) => {
    const id = path.dataset.municipio;
    if (modoRegioes) {
      // Na visao de regioes, cor por regiao completa (todos os
      // municipios dela verificados) -- nao tem estado "vermelho"
      // aqui, so cinza ou verde.
      path.classList.toggle("visitado", regiaoEstaCompleta(path.dataset.regiao));
      path.classList.remove("nao-verificado");
    } else {
      const dados = estadoMapa[id];
      path.classList.toggle("visitado", estaVerificado(id));
      path.classList.toggle("nao-verificado", !!dados?.visitado && !dados?.verificado);
      // Selo brilhante também vale no mapa (dourado), não só no popup
      path.classList.toggle("brilhante", !!dados?.visitado && !!dados?.brilhante);
    }
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
  document.querySelectorAll("#mapa-rj .municipio").forEach((path) => {
    const regiaoId = path.dataset.regiao;
    (municipiosPorRegiao[regiaoId] ??= []).push(path.dataset.municipio);
  });
}

/**
 * Extrai os vértices de cada anel (subpath) de um `d` de path gerado
 * por tools/geojson-to-svg.js -- formato sempre "M x y L x y L x y
 * ... Z" (só retas, sem curvas), então basta ler os números na
 * ordem. Um município pode ter mais de um anel (ex: ilhas), daí o
 * split em "M".
 */
function extrairAneisDoPath(d) {
  const subpaths = d.trim().split(/(?=M)/).filter(Boolean);
  return subpaths.map((sub) => {
    const numeros = (sub.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    const pontos = [];
    for (let i = 0; i + 1 < numeros.length; i += 2) {
      pontos.push([numeros[i], numeros[i + 1]]);
    }
    return pontos;
  });
}

// Distância máxima (em unidades do viewBox, que tem 800 de largura)
// pra considerar dois vértices "o mesmo ponto" -- os municípios
// vizinhos nem sempre têm vértices EXATAMENTE coincidentes na
// fronteira comum (a base tbrugz/geodata-br não é perfeitamente
// topológica), então usa uma tolerância pequena em vez de igualdade
// exata.
const TOLERANCIA_VERTICE = 0.35;
const TAMANHO_CELULA_GRADE = TOLERANCIA_VERTICE * 2;

function chaveCelulaGrade(x, y) {
  return `${Math.round(x / TAMANHO_CELULA_GRADE)},${Math.round(y / TAMANHO_CELULA_GRADE)}`;
}

/**
 * Desenha, por cima dos municípios, o contorno real de cada uma das
 * 8 regiões -- só fica visível no modo "regiões" (zoom afastado, ver
 * CSS `svg.modo-regioes`), quando as bordas individuais de cada
 * município ficam escondidas.
 *
 * Em vez de um fecho convexo (que "estourava" pra fora da forma real
 * da região em formatos côncavos/alongados, cruzando o mapa todo),
 * detecta as arestas de fronteira de verdade: uma aresta (par de
 * vértices consecutivos de um município) fica ESCONDIDA só se outro
 * município da MESMA região tiver vértices bem próximos dos dois
 * extremos dela (ou seja, ele também "passa" por ali -- fronteira
 * interna compartilhada). Usa um índice espacial (grade) pra achar
 * vértices próximos rapidamente, em vez de comparar todos com todos.
 */
function construirContornosDeRegiao() {
  const svg = document.getElementById("mapa-rj");
  document.getElementById("contornos-regioes")?.remove();

  const paths = Array.from(document.querySelectorAll("#mapa-rj .municipio"));
  const municipios = paths.map((path) => ({
    regiao: path.dataset.regiao,
    aneis: extrairAneisDoPath(path.getAttribute("d")),
  }));

  // Indice espacial de vertices: celula -> [{x, y, indiceMunicipio}]
  const grade = new Map();
  municipios.forEach((municipio, indiceMunicipio) => {
    municipio.aneis.forEach((anel) => {
      anel.forEach(([x, y]) => {
        const chave = chaveCelulaGrade(x, y);
        if (!grade.has(chave)) grade.set(chave, []);
        grade.get(chave).push({ x, y, indiceMunicipio });
      });
    });
  });

  function municipiosPertoDoPonto(x, y, ignorarIndice) {
    const cx = Math.round(x / TAMANHO_CELULA_GRADE);
    const cy = Math.round(y / TAMANHO_CELULA_GRADE);
    const encontrados = new Set();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const lista = grade.get(`${cx + dx},${cy + dy}`);
        if (!lista) continue;
        for (const v of lista) {
          if (v.indiceMunicipio === ignorarIndice) continue;
          if (Math.hypot(v.x - x, v.y - y) <= TOLERANCIA_VERTICE) encontrados.add(v.indiceMunicipio);
        }
      }
    }
    return encontrados;
  }

  const grupo = document.createElementNS("http://www.w3.org/2000/svg", "g");
  grupo.id = "contornos-regioes";

  municipios.forEach((municipio, indiceMunicipio) => {
    municipio.aneis.forEach((anel) => {
      for (let i = 0; i < anel.length; i++) {
        const p1 = anel[i];
        const p2 = anel[(i + 1) % anel.length];

        const vizinhosP1 = municipiosPertoDoPonto(p1[0], p1[1], indiceMunicipio);
        const vizinhosP2 = municipiosPertoDoPonto(p2[0], p2[1], indiceMunicipio);

        // "Interna" se algum OUTRO municipio da MESMA regiao tem
        // vertices perto dos DOIS extremos dessa aresta -- ele
        // tambem faz essa fronteira, entao e uma divisa interna.
        let interna = false;
        for (const j of vizinhosP1) {
          if (vizinhosP2.has(j) && municipios[j].regiao === municipio.regiao) {
            interna = true;
            break;
          }
        }
        if (interna) continue;

        const linha = document.createElementNS("http://www.w3.org/2000/svg", "line");
        linha.setAttribute("x1", p1[0]);
        linha.setAttribute("y1", p1[1]);
        linha.setAttribute("x2", p2[0]);
        linha.setAttribute("y2", p2[1]);
        linha.setAttribute("class", "contorno-regiao-segmento");
        grupo.appendChild(linha);
      }
    });
  });

  svg.appendChild(grupo);
}

function regiaoEstaCompleta(regiaoId) {
  const idsDaRegiao = municipiosPorRegiao[regiaoId] || [];
  return idsDaRegiao.length > 0 && idsDaRegiao.every((id) => estaVerificado(id));
}

/**
 * Atualiza o contador "Visitados: X / Y" -- só conta município
 * verificado por localização (ver estaVerificado).
 */
function atualizarContador() {
  const total = document.querySelectorAll("#mapa-rj .municipio").length;
  const visitados = Object.keys(estadoMapa).filter((id) => estaVerificado(id)).length;

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

  // Mantem brilhante/chanceDecidida (nao apaga o registro inteiro):
  // uma vez decidida, a sorte da raspadinha brilhante desse
  // municipio nunca muda, mesmo desmarcando e raspando de novo.
  const anterior = estadoMapa[municipioSelecionadoId];
  estadoMapa[municipioSelecionadoId] = anterior
    ? { ...anterior, visitado: false }
    : undefined;
  if (!estadoMapa[municipioSelecionadoId]) delete estadoMapa[municipioSelecionadoId];

  salvarEstado();
  aplicarEstadoNoSVG();
  atualizarContador();
  sincronizarProgressoOnline();
  sincronizarMunicipioOnline(municipioSelecionadoId);
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
  estadoConquistas = {};
  salvarEstado();
  salvarEstadoRegioes();
  salvarEstadoConquistas();
  aplicarEstadoNoSVG();
  atualizarContador();
  sincronizarProgressoOnline();
  window.raspadinhaAuth?.resetarEstadoPublico?.();
  fecharConfiguracoes();
}

/* ---------- LocalStorage ---------- */

function salvarEstado() {
  localStorage.setItem(chaveComUid(STORAGE_KEY), JSON.stringify(estadoMapa));
}

function carregarEstado() {
  try {
    const dados = localStorage.getItem(chaveComUid(STORAGE_KEY));
    return dados ? JSON.parse(dados) : {};
  } catch (erro) {
    console.error("Erro ao carregar estado do LocalStorage:", erro);
    return {};
  }
}

function salvarEstadoRegioes() {
  localStorage.setItem(chaveComUid(STORAGE_KEY_REGIOES), JSON.stringify(estadoRegioes));
}

function carregarEstadoRegioes() {
  try {
    const dados = localStorage.getItem(chaveComUid(STORAGE_KEY_REGIOES));
    return dados ? JSON.parse(dados) : {};
  } catch (erro) {
    console.error("Erro ao carregar estado das regiões do LocalStorage:", erro);
    return {};
  }
}

function salvarEstadoConquistas() {
  localStorage.setItem(chaveComUid(STORAGE_KEY_CONQUISTAS), JSON.stringify(estadoConquistas));
}

function carregarEstadoConquistas() {
  try {
    const dados = localStorage.getItem(chaveComUid(STORAGE_KEY_CONQUISTAS));
    return dados ? JSON.parse(dados) : {};
  } catch (erro) {
    console.error("Erro ao carregar estado das conquistas do LocalStorage:", erro);
    return {};
  }
}

function carregarEstadoStreak() {
  try {
    const dados = localStorage.getItem(chaveComUid(STORAGE_KEY_STREAK));
    return dados ? JSON.parse(dados) : { ultimoDia: null, contagem: 0 };
  } catch (erro) {
    console.error("Erro ao carregar streak do LocalStorage:", erro);
    return { ultimoDia: null, contagem: 0 };
  }
}

function salvarEstadoStreak() {
  localStorage.setItem(chaveComUid(STORAGE_KEY_STREAK), JSON.stringify(estadoStreak));
}

/**
 * Migração 1x: contas que já usavam o app antes desta correção têm o
 * progresso guardado na chave FIXA antiga (sem uid nenhum -- a causa
 * da mistura de dados entre contas no mesmo navegador). Se a conta
 * que está logando ainda não tem uma chave própria, herda o que
 * estiver na chave antiga (não apaga a antiga, só copia).
 */
function migrarEstadoAntigoSeNecessario(uid) {
  [STORAGE_KEY, STORAGE_KEY_REGIOES, STORAGE_KEY_CONQUISTAS, STORAGE_KEY_STREAK].forEach(
    (chaveBase) => {
      const chaveNova = `${chaveBase}_${uid}`;
      if (localStorage.getItem(chaveNova) !== null) return; // já migrado antes
      const dadosAntigos = localStorage.getItem(chaveBase);
      if (dadosAntigos !== null) localStorage.setItem(chaveNova, dadosAntigos);
    }
  );
}

/**
 * Chamada sempre que alguém loga (ver atualizarUiDeConta): troca o
 * "dono" das chaves de localStorage pro uid de quem acabou de logar,
 * migra dados antigos (contas de antes desta correção) se for a
 * primeira vez, recarrega os 4 estados da chave certa, e por cima
 * disso ainda restaura município/região a partir do Firestore (fonte
 * de verdade por conta, já que fica isolado por uid nas regras de
 * segurança) -- isso corrige sozinho qualquer mistura que ainda
 * exista no navegador local. Só depois disso é seguro sincronizar de
 * volta pro Firestore (sincronizarProgressoOnline etc.), pra não
 * gravar dado misturado por cima do dado certo da conta.
 */
async function carregarEstadoDoUsuario(uid) {
  migrarEstadoAntigoSeNecessario(uid);
  uidStorageAtual = uid;

  estadoMapa = carregarEstado();
  estadoRegioes = carregarEstadoRegioes();
  estadoConquistas = carregarEstadoConquistas();
  estadoStreak = carregarEstadoStreak();
  // registrarAcessoDeHoje() já rodou no DOMContentLoaded, mas contra o
  // bucket "anon" (uid ainda não era conhecido nesse momento) -- chama
  // de novo aqui, agora contra o streak de VERDADE dessa conta, senão
  // a conquista "Semana Cheia" nunca contaria acesso nenhum pra quem
  // está logado (só pra sessões anônimas, que nem chegam a ver
  // conquistas).
  registrarAcessoDeHoje();

  try {
    const estadoNuvem = await window.raspadinhaAuth?.buscarMeuEstadoCompleto();
    if (estadoNuvem) {
      Object.entries(estadoNuvem.estadoMunicipios || {}).forEach(([id, dados]) => {
        estadoMapa[id] = {
          ...estadoMapa[id],
          visitado: !!dados.visitado,
          verificado: !!dados.verificado,
          // O Firestore só reflete o "brilhante" de verdade enquanto o
          // município está visitado (ver estadoPublicoMunicipio em
          // sincronizarMunicipioOnline) -- desmarcado, ele sempre manda
          // false por design, mesmo que a decisão real (guardada só
          // localmente) tenha sido brilhante. Sem esse cuidado, restaurar
          // do Firestore apagaria esse resultado quando o município
          // estivesse desmarcado no momento do login.
          brilhante: dados.visitado ? !!dados.brilhante : !!estadoMapa[id]?.brilhante,
          chanceDecidida: estadoMapa[id]?.chanceDecidida || !!dados.visitado,
        };
      });
      Object.entries(estadoNuvem.estadoRegioes || {}).forEach(([id, dados]) => {
        estadoRegioes[id] = {
          ...estadoRegioes[id],
          revelado: !!dados.revelado,
          brilhante: !!dados.brilhante,
          chanceDecidida: estadoRegioes[id]?.chanceDecidida || !!dados.revelado,
        };
      });
      salvarEstado();
      salvarEstadoRegioes();
    }
  } catch (erro) {
    console.error("Falha ao restaurar estado do Firestore no login:", erro);
    // sem nuvem acessível, segue só com o que tinha local mesmo
  }

  aplicarEstadoNoSVG();
  atualizarContador();
}

/**
 * Chamada ao deslogar: volta as chaves de localStorage pro dono
 * "anon" (navegação sem login) -- sem isso, o estado da conta que
 * acabou de sair continuaria em memória/repintado no mapa até um
 * reload manual.
 */
function voltarParaEstadoAnonimo() {
  uidStorageAtual = "anon";
  estadoMapa = carregarEstado();
  estadoRegioes = carregarEstadoRegioes();
  estadoConquistas = carregarEstadoConquistas();
  estadoStreak = carregarEstadoStreak();
  aplicarEstadoNoSVG();
  atualizarContador();
}

/**
 * Conta 1 dia de streak por dia de calendário em que o app é aberto
 * (uma vez por dia, não importa quantas vezes abre no mesmo dia). Se
 * pular um dia, a sequência reseta pra 1.
 */
function registrarAcessoDeHoje() {
  const hojeChave = new Date().toDateString();
  if (estadoStreak.ultimoDia === hojeChave) return;

  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const ontemChave = ontem.toDateString();

  estadoStreak.contagem = estadoStreak.ultimoDia === ontemChave ? estadoStreak.contagem + 1 : 1;
  estadoStreak.ultimoDia = hojeChave;
  salvarEstadoStreak();
}

/* ============================================================
   Mapa do Brasil: contorno de cada estado, todos "em breve" (cinza +
   borrado) exceto o RJ, que já é o app principal -- clicar nele fecha
   essa visão e volta pro mapa detalhado. Botão 🇧🇷 vive dentro da
   janela suspensa da lateral esquerda (ver alternarBotoesLaterais),
   sempre disponível. Ver tools/br-estados-to-svg.js pra como o SVG é
   gerado a partir de data/br-estados.geojson (malha oficial do IBGE)
   + data/estados.json.
   ============================================================ */

// Cache do SVG buscado (só faz o fetch uma vez por sessão, já que o
// arquivo não muda em runtime).
let svgMapaBrasilCache = null;

/**
 * Abre a visão do Brasil, buscando e injetando o SVG na primeira vez
 * (fica em cache depois). Clicar num estado "em breve" só mostra um
 * aviso; clicar no RJ (o único liberado) fecha essa tela, já que o
 * app principal É o mapa detalhado do RJ.
 */
async function abrirMapaBrasil() {
  document.getElementById("modal-brasil").classList.remove("oculto");
  document.getElementById("brasil-status").textContent = "";
  const container = document.getElementById("brasil-mapa-container");

  if (!svgMapaBrasilCache) {
    container.innerHTML = '<div class="spinner spinner-grande"></div>';
    try {
      const resposta = await fetch("assets/svg/br-estados.svg");
      svgMapaBrasilCache = await resposta.text();
    } catch (erro) {
      console.error("Falha ao carregar o mapa do Brasil:", erro);
      container.innerHTML = "<p>Não foi possível carregar o mapa agora.</p>";
      return;
    }
  }

  container.innerHTML = svgMapaBrasilCache;
  container.querySelectorAll(".estado").forEach((path) => {
    path.addEventListener("click", () => {
      const nome = path.dataset.nome;
      if (path.classList.contains("estado-liberado")) {
        fecharMapaBrasil();
        return;
      }
      document.getElementById("brasil-status").textContent = `${nome} chega em breve!`;
    });
  });
}

function fecharMapaBrasil() {
  document.getElementById("modal-brasil").classList.add("oculto");
}

/**
 * Abre/fecha a "janela suspensa" com os botões da lateral esquerda
 * (perfil, ranking, amigos, conquistas, check-in, mapa do Brasil) --
 * antes ficavam todos soltos e sempre visíveis; agora só a setinha
 * fica sempre à mostra, e apertar ela expande/recolhe o resto, pra
 * não lotar a tela com muitos botões flutuantes de uma vez.
 */
function alternarBotoesLaterais() {
  const lista = document.getElementById("botoes-lateral-lista");
  const botao = document.getElementById("btn-toggle-lateral");
  const abrindo = lista.classList.contains("recolhido");

  lista.classList.toggle("recolhido", !abrindo);
  botao.textContent = abrindo ? "◂" : "▸";
  botao.setAttribute("aria-expanded", abrindo ? "true" : "false");
}
