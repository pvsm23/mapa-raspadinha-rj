/* =========================================================
   scratch-card.js
   Motor genérico de "raspadinha" via Canvas.
   Uso:
     initScratchCard({
       containerId: "scratch-modal-body",
       imageUrl: "assets/img/selos/3303302.png",
       imageUrlCapa: "assets/img/selos/3303302fundo.png", // opcional
       onComplete: () => marcarComoVisitado("3303302")
     });

   Como funciona:
   1. Desenha a imagem colorida (selo) num <canvas> de fundo.
   2. Desenha a "capa" por cima, num <canvas> de "raspagem": se
      imageUrlCapa for passada, usa essa imagem (ex: a mesma arte
      em preto e branco); senão, cai numa camada cinza lisa.
   3. Ao arrastar o dedo/mouse, apaga pixels da capa
      (destination-out), revelando a imagem colorida de baixo.
   4. A cada movimento, amostra os pixels da capa para calcular
      quanto já foi raspado. Ao passar do limiar (perto de 100%,
      já que o pincel redondo nunca cobre 100% exato), dispara
      onComplete() e revela tudo de vez, com um pulo do selo (CSS)
      e confete (celebrarConclusao/dispararConfete).
   ========================================================= */

function initScratchCard({
  containerId,
  imageUrl,
  imageUrlCapa,
  onComplete,
  tamanho = 300,
  raioPincel = 24,
  limiarConclusao = 0.92, // quase tudo raspado = considera concluído
}) {
  const container = document.getElementById(containerId);
  container.innerHTML = ""; // limpa raspadinha anterior, se houver

  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = `${tamanho}px`;
  wrapper.style.height = `${tamanho}px`;
  wrapper.style.margin = "0 auto";
  wrapper.style.touchAction = "none"; // evita rolar a página ao raspar no celular

  const canvasImagem = document.createElement("canvas");
  const canvasRaspagem = document.createElement("canvas");

  [canvasImagem, canvasRaspagem].forEach((c) => {
    c.width = tamanho;
    c.height = tamanho;
    c.style.position = "absolute";
    c.style.top = "0";
    c.style.left = "0";
    c.style.borderRadius = "50%";
  });

  wrapper.appendChild(canvasImagem);
  wrapper.appendChild(canvasRaspagem);
  container.appendChild(wrapper);

  const ctxImagem = canvasImagem.getContext("2d");
  const ctxRaspagem = canvasRaspagem.getContext("2d");

  // 1. Carrega e desenha o selo colorido
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    ctxImagem.drawImage(img, 0, 0, tamanho, tamanho);
  };
  img.src = imageUrl;

  // 2. Pinta a "capa" que sera raspada
  if (imageUrlCapa) {
    const imgCapa = new Image();
    imgCapa.crossOrigin = "anonymous";
    imgCapa.onload = () => {
      ctxRaspagem.drawImage(imgCapa, 0, 0, tamanho, tamanho);
    };
    imgCapa.src = imageUrlCapa;
  } else {
    ctxRaspagem.fillStyle = "#9ca3af";
    ctxRaspagem.fillRect(0, 0, tamanho, tamanho);
    ctxRaspagem.fillStyle = "#6b7280";
    ctxRaspagem.font = "14px sans-serif";
    ctxRaspagem.textAlign = "center";
    ctxRaspagem.fillText("raspe aqui", tamanho / 2, tamanho / 2 + 4);
  }

  let raspando = false;
  let concluido = false;

  function coordenadasEvento(evento) {
    const rect = canvasRaspagem.getBoundingClientRect();
    const ponto = evento.touches ? evento.touches[0] : evento;
    // considera a escala entre o tamanho real do canvas e o
    // tamanho exibido na tela (importante se o CSS redimensionar)
    const escalaX = canvasRaspagem.width / rect.width;
    const escalaY = canvasRaspagem.height / rect.height;
    return {
      x: (ponto.clientX - rect.left) * escalaX,
      y: (ponto.clientY - rect.top) * escalaY,
    };
  }

  function raspar(x, y) {
    ctxRaspagem.globalCompositeOperation = "destination-out";
    ctxRaspagem.beginPath();
    ctxRaspagem.arc(x, y, raioPincel, 0, Math.PI * 2);
    ctxRaspagem.fill();
  }

  function calcularPorcentagemRaspada() {
    const dados = ctxRaspagem.getImageData(0, 0, tamanho, tamanho).data;
    let transparentes = 0;
    const totalPixels = dados.length / 4;

    // Amostragem a cada 4 pixels para performance
    for (let i = 3; i < dados.length; i += 16) {
      if (dados[i] === 0) transparentes++;
    }
    return transparentes / (totalPixels / 4);
  }

  function revelarTudo() {
    ctxRaspagem.clearRect(0, 0, tamanho, tamanho);
  }

  function aoMover(evento) {
    if (!raspando || concluido) return;
    evento.preventDefault();
    const { x, y } = coordenadasEvento(evento);
    raspar(x, y);

    const porcentagem = calcularPorcentagemRaspada();
    if (porcentagem >= limiarConclusao) {
      concluido = true;
      revelarTudo();
      // onComplete decide (e persiste) se essa raspagem foi
      // "brilhante" e devolve true/false — só depois disso a
      // celebração sabe se deve mostrar o efeito de brilho.
      const brilhante = typeof onComplete === "function" ? onComplete() : false;
      celebrarConclusao(wrapper, !!brilhante);
    }
  }

  // Eventos de mouse
  canvasRaspagem.addEventListener("mousedown", (e) => {
    raspando = true;
    aoMover(e);
  });
  canvasRaspagem.addEventListener("mousemove", aoMover);
  window.addEventListener("mouseup", () => (raspando = false));

  // Eventos de toque (celular)
  canvasRaspagem.addEventListener("touchstart", (e) => {
    raspando = true;
    aoMover(e);
  });
  canvasRaspagem.addEventListener("touchmove", aoMover);
  window.addEventListener("touchend", () => (raspando = false));
}

/**
 * Efeito de "recompensa" ao completar a raspadinha: o selo dá um
 * pulo pra frente e volta (CSS), e uma chuva de confete sai de trás
 * dele. Usado tanto pro selo de município quanto pro mega-selo de
 * região (initScratchCard não sabe qual é — só celebra). Se
 * `brilhante` for true, também acrescenta o anel de brilhos girando
 * (ver adicionarBrilho) — reservado pra raspadinhas brilhantes (5%
 * de chance na primeira raspagem de cada município, ver script.js).
 */
function celebrarConclusao(wrapper, brilhante) {
  wrapper.classList.remove("selo-completo");
  // força o navegador a "esquecer" a classe antes de reaplicar, pra
  // animação rodar de novo mesmo raspando o mesmo elemento 2x seguidas
  void wrapper.offsetWidth;
  wrapper.classList.add("selo-completo");

  if (brilhante) adicionarBrilho(wrapper);

  const rect = wrapper.getBoundingClientRect();
  dispararConfete(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

/**
 * Acrescenta o efeito visual de "raspadinha brilhante": um anel de
 * partículas girando ao redor do elemento (que precisa ter
 * position:relative — os selos/wrappers já têm). Reaproveitado tanto
 * na hora de completar a raspagem quanto ao reabrir um selo que já
 * foi decidido como brilhante antes (ver visualizarSeloRevelado em
 * script.js).
 */
function adicionarBrilho(elemento, quantidadeParticulas = 10) {
  elemento.classList.add("selo-brilhante");

  const anel = document.createElement("div");
  anel.className = "brilho-anel";

  const tamanho = elemento.getBoundingClientRect().width || elemento.offsetWidth || 300;
  const raioPx = tamanho * 0.62;

  for (let i = 0; i < quantidadeParticulas; i++) {
    const angulo = (360 / quantidadeParticulas) * i;
    const particula = document.createElement("span");
    particula.className = "brilho-particula";
    // truque do "ponteiro de relógio": translateY afasta do centro
    // (no eixo local), rotate gira esse ponto já afastado ao redor
    // do centro -- cada partícula cai numa posição diferente do anel
    particula.style.transform = `rotate(${angulo}deg) translateY(-${raioPx}px)`;
    anel.appendChild(particula);
  }

  elemento.appendChild(anel);
}

function dispararConfete(origemX, origemY) {
  const cores = ["#22c55e", "#facc15", "#3b82f6", "#ef4444", "#a855f7", "#f97316"];
  const quantidade = 32;

  for (let i = 0; i < quantidade; i++) {
    const particula = document.createElement("div");
    particula.className = "confete";

    const angulo = Math.random() * Math.PI * 2;
    const distancia = 90 + Math.random() * 130;
    const dx = Math.cos(angulo) * distancia;
    const dy = Math.sin(angulo) * distancia - 60; // puxa um pouco pra cima

    particula.style.left = `${origemX}px`;
    particula.style.top = `${origemY}px`;
    particula.style.background = cores[Math.floor(Math.random() * cores.length)];
    particula.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    particula.style.setProperty("--dx", `${dx}px`);
    particula.style.setProperty("--dy", `${dy}px`);
    particula.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);

    document.body.appendChild(particula);
    setTimeout(() => particula.remove(), 1200);
  }
}
