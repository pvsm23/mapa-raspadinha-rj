/* =========================================================
   scratch-card.js
   Motor genérico de "raspadinha" via Canvas.
   Uso:
     initScratchCard({
       containerId: "scratch-modal-body",
       imageUrl: "assets/img/selos/3303302.webp",
       imageUrlCapa: "assets/img/selos/3303302fundo.webp", // opcional
       onPrimeiroToque: () => travarSorteNaPrimeiraRaspada("3303302", brilhante), // opcional
       onComplete: () => marcarComoVisitado("3303302")
     });

   Como funciona:
   1. Desenha a imagem colorida (selo) num <canvas> de fundo -- já é
      a arte final (colorida ou dourada, decidida por quem chama
      initScratchCard antes de montar a raspadinha).
   2. Desenha a "capa" por cima, num <canvas> de "raspagem": se
      imageUrlCapa for passada, usa essa imagem (ex: a mesma arte
      em preto e branco); senão, cai numa camada cinza lisa.
   3. Ao arrastar o dedo/mouse, apaga pixels da capa
      (destination-out), revelando a imagem colorida de baixo.
   4. Na primeira raspada de verdade (primeiro `raspar()` que
      acontece), dispara onPrimeiroToque() uma única vez -- serve pra
      quem chama travar a sorte (brilhante ou não) permanentemente
      naquele instante, mesmo que a pessoa abandone sem terminar de
      raspar (ver travarSorteNaPrimeiraRaspada/decidirBrilhante em
      script.js).
   5. A cada movimento, amostra os pixels da capa para calcular
      quanto já foi raspado. Ao passar do limiar (perto de 100%,
      já que o pincel redondo nunca cobre 100% exato), dispara
      onComplete() e revela tudo de vez, com um pulo do selo (CSS)
      e confete (celebrarConclusao/dispararConfete).
   ========================================================= */

function initScratchCard({
  containerId,
  imageUrl,
  imageUrlCapa,
  onPrimeiroToque,
  onComplete,
  tamanho = 300,
  raioPincel = 24,
  limiarConclusao = 0.92, // quase tudo raspado = considera concluído
}) {
  const container = document.getElementById(containerId);
  container.innerHTML = ""; // limpa raspadinha anterior, se houver

  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  // Quadrado que ENCOLHE se a tela for estreita (o selo de região/rota
  // pede 400px, mais que a largura útil de um celular). Antes era
  // width/height fixos: o wrapper estourava o modal e o canvas era
  // espremido pelo CSS, então o desenho e o dedo paravam de coincidir.
  wrapper.style.width = `min(${tamanho}px, 100%)`;
  wrapper.style.aspectRatio = "1 / 1";
  wrapper.style.margin = "0 auto";
  wrapper.style.borderRadius = "50%";
  wrapper.style.touchAction = "none"; // evita rolar a página ao raspar no celular

  const canvasImagem = document.createElement("canvas");
  const canvasRaspagem = document.createElement("canvas");

  [canvasImagem, canvasRaspagem].forEach((c) => {
    // Tamanho VISUAL: sempre o wrapper inteiro, nos dois canvases. É o
    // que garante que a área raspável e o selo por baixo tenham
    // exatamente as mesmas dimensões.
    c.style.position = "absolute";
    c.style.inset = "0";
    c.style.width = "100%";
    c.style.height = "100%";
    c.style.borderRadius = "50%";
    // Sem isso, arrastar o dedo pra raspar dentro de um painel que
    // rola (a folha deslizante do popup) vira ROLAGEM em vez de
    // raspagem no celular -- era o que fazia "raspar não funcionar".
    c.style.touchAction = "none";
  });

  wrapper.appendChild(canvasImagem);
  wrapper.appendChild(canvasRaspagem);
  container.appendChild(wrapper);

  /* ---- Resolução real (devicePixelRatio) ----
     O buffer interno do canvas precisa ter os pixels FÍSICOS da tela,
     não os lógicos do CSS: num celular com DPR 3, um canvas de 190
     pixels internos esticado pra 190px de CSS é ampliado 3x pela GPU e
     sai borrado. Teto de 3 porque acima disso o ganho é imperceptível
     e o getImageData (que roda a cada movimento do dedo) fica caro.

     A medição vem do wrapper JÁ NO DOM, não do parâmetro `tamanho`:
     com o min() acima, o lado real pode ser menor que o pedido. O
     fallback cobre o caso de o container estar oculto na hora (rect 0).

     Depois disso, todo o resto do arquivo continua desenhando em
     unidades de `tamanho` -- o setTransform faz a conversão. */
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const ladoCss = Math.round(wrapper.getBoundingClientRect().width) || tamanho;
  const ladoBuffer = Math.round(ladoCss * dpr);

  const ctxImagem = canvasImagem.getContext("2d");
  const ctxRaspagem = canvasRaspagem.getContext("2d");

  [canvasImagem, canvasRaspagem].forEach((c) => {
    c.width = ladoBuffer;
    c.height = ladoBuffer;
    const ctx = c.getContext("2d");
    ctx.setTransform(ladoBuffer / tamanho, 0, 0, ladoBuffer / tamanho, 0, 0);
    // As artes são 768x768 e aparecem a ~190px: sem interpolação boa, o
    // downscale come os detalhes finos do selo.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  });

  /** Recorta o que já está pintado no contexto num círculo perfeito.
   *  Usado na capa: o canvas é quadrado e só o círculo aparece
   *  (border-radius), mas os cantos continuavam OPACOS no bitmap --
   *  contavam como "por raspar" numa área que o dedo nem alcança. */
  function recortarEmCirculo(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.arc(tamanho / 2, tamanho / 2, tamanho / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 1. Carrega e desenha o selo colorido
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    ctxImagem.drawImage(img, 0, 0, tamanho, tamanho);
  };
  img.src = imageUrl;

  // Quantos pixels a capa tinha ANTES de qualquer raspagem. Precisa
  // estar declarado ACIMA do bloco que pinta a capa: no ramo sem
  // imagem, medirCapaInicial() roda de imediato (não espera onload) e
  // esbarraria na temporal dead zone do `let`.
  let pixelsCapaInicial = 0;

  // 2. Pinta a "capa" que sera raspada
  if (imageUrlCapa) {
    const imgCapa = new Image();
    imgCapa.crossOrigin = "anonymous";
    imgCapa.onload = () => {
      ctxRaspagem.drawImage(imgCapa, 0, 0, tamanho, tamanho);
      recortarEmCirculo(ctxRaspagem);
      medirCapaInicial();
    };
    imgCapa.src = imageUrlCapa;
  } else {
    // Fundo metálico (gradiente radial) em vez de cinza chapado --
    // fica melhor tanto no selo grande quanto no medalhão pequeno das
    // Conquistas (ver initScratchCard com tamanho: 76).
    const gradiente = ctxRaspagem.createRadialGradient(
      tamanho * 0.32, tamanho * 0.28, tamanho * 0.05,
      tamanho * 0.5, tamanho * 0.5, tamanho * 0.7
    );
    gradiente.addColorStop(0, "#c7ccd4");
    gradiente.addColorStop(0.5, "#8b929c");
    gradiente.addColorStop(1, "#4a4f57");
    ctxRaspagem.fillStyle = gradiente;
    ctxRaspagem.fillRect(0, 0, tamanho, tamanho);
    ctxRaspagem.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctxRaspagem.font = `${Math.max(9, Math.round(tamanho * 0.07))}px sans-serif`;
    ctxRaspagem.textAlign = "center";
    ctxRaspagem.fillText("raspe aqui", tamanho / 2, tamanho / 2 + 4);
    recortarEmCirculo(ctxRaspagem);
    medirCapaInicial();
  }

  let raspando = false;
  let concluido = false;
  let primeiroToqueDisparado = false;

  function contarPixelsOpacos() {
    // getImageData trabalha em pixels FÍSICOS: ignora o setTransform.
    const dados = ctxRaspagem.getImageData(0, 0, canvasRaspagem.width, canvasRaspagem.height).data;
    let opacos = 0;
    // Amostragem: 1 pixel a cada 4 (i += 16 bytes) -- roda a cada
    // movimento do dedo, precisa ser barato.
    for (let i = 3; i < dados.length; i += 16) {
      if (dados[i] !== 0) opacos++;
    }
    return opacos;
  }

  function medirCapaInicial() {
    pixelsCapaInicial = contarPixelsOpacos();
  }

  function coordenadasEvento(evento) {
    const rect = canvasRaspagem.getBoundingClientRect();
    const ponto = evento.touches ? evento.touches[0] : evento;
    // rect vem em px de CSS; o desenho acontece em unidades de
    // `tamanho`. Essa razão é o que mantém o pincel exatamente debaixo
    // do dedo mesmo quando o wrapper encolheu pelo min() (celular
    // estreito) -- e vale 1 quando não encolheu.
    const escala = tamanho / (rect.width || tamanho);
    return {
      x: (ponto.clientX - rect.left) * escala,
      y: (ponto.clientY - rect.top) * escala,
    };
  }

  function raspar(x, y) {
    ctxRaspagem.globalCompositeOperation = "destination-out";
    ctxRaspagem.beginPath();
    ctxRaspagem.arc(x, y, raioPincel, 0, Math.PI * 2);
    ctxRaspagem.fill();
    if (typeof tocarSomRaspar === "function") tocarSomRaspar();
  }

  /* Progresso relativo à CAPA, não ao quadrado do canvas.
     Antes o cálculo era "pixels transparentes / área total do
     quadrado", e isso quebrava de dois jeitos:
     - os cantos fora do círculo nunca podiam ser raspados (o
       border-radius não deixa o dedo chegar lá), mas contavam como
       área a raspar -- são ~21% do quadrado, então com o limiar em
       0.92 a capa cinza lisa era IMPOSSÍVEL de concluir;
     - a moldura transparente do webp já entrava como "raspado" de
       graça, então cada arte terminava numa hora diferente.
     Medindo contra a capa real, 100% quer dizer "a capa acabou",
     qualquer que seja o formato dela. */
  function calcularPorcentagemRaspada() {
    if (!pixelsCapaInicial) return 0;
    const restantes = contarPixelsOpacos();
    return 1 - restantes / pixelsCapaInicial;
  }

  function revelarTudo() {
    ctxRaspagem.clearRect(0, 0, tamanho, tamanho);
  }

  function aoMover(evento) {
    if (!raspando || concluido) return;
    evento.preventDefault();
    const { x, y } = coordenadasEvento(evento);
    raspar(x, y);

    if (!primeiroToqueDisparado) {
      primeiroToqueDisparado = true;
      if (typeof onPrimeiroToque === "function") onPrimeiroToque();
    }

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

  if (brilhante) {
    adicionarBrilho(wrapper);
    if (typeof tocarSomBrilhante === "function") tocarSomBrilhante();
  } else if (typeof tocarSomRevelar === "function") {
    tocarSomRevelar();
  }

  const rect = wrapper.getBoundingClientRect();
  dispararConfete(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

/**
 * Acrescenta o efeito visual de "raspadinha brilhante": luz
 * irradiando do selo pra fora, tipo um sol (raios girando + brilho
 * pulsante) — tudo via CSS (ver `.selo-brilhante::before/::after` em
 * css/styles.css), sem precisar criar partícula nenhuma por JS.
 * Reaproveitado tanto na hora de completar a raspagem quanto ao
 * reabrir um selo que já foi decidido como brilhante antes (ver
 * visualizarSeloRevelado em script.js).
 */
function adicionarBrilho(elemento) {
  elemento.classList.add("selo-brilhante");
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
