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
      onComplete() e revela tudo de vez.
   5. Zoom: roda do mouse (desktop) ou pinça de 2 dedos (celular).
      1 dedo/clique arrastando sempre é o gesto de raspar; só com
      2 dedos entra em modo zoom/mover, sem conflito entre os dois.
   ========================================================= */

function initScratchCard({
  containerId,
  imageUrl,
  imageUrlCapa,
  onComplete,
  tamanho = 300,
  raioPincel = 24,
  limiarConclusao = 0.92, // quase tudo raspado = considera concluído
  escalaMaxima = 3,
}) {
  const container = document.getElementById(containerId);
  container.innerHTML = ""; // limpa raspadinha anterior, se houver

  // viewport: janela fixa que recorta o conteudo; o zoom/pan mexe
  // no wrapper por dentro, sem alterar o tamanho real do canvas
  // (assim o gesto de raspar com 1 dedo continua funcionando igual).
  const viewport = document.createElement("div");
  viewport.style.position = "relative";
  viewport.style.width = `${tamanho}px`;
  viewport.style.height = `${tamanho}px`;
  viewport.style.margin = "0 auto";
  viewport.style.overflow = "hidden";
  viewport.style.borderRadius = "50%";
  viewport.style.touchAction = "none"; // evita rolar/dar zoom nativo da pagina

  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = `${tamanho}px`;
  wrapper.style.height = `${tamanho}px`;
  wrapper.style.transformOrigin = "center center";

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
  viewport.appendChild(wrapper);
  container.appendChild(viewport);

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
      if (typeof onComplete === "function") onComplete();
    }
  }

  // Eventos de mouse (1 clique arrastando = raspar)
  canvasRaspagem.addEventListener("mousedown", (e) => {
    raspando = true;
    aoMover(e);
  });
  canvasRaspagem.addEventListener("mousemove", aoMover);
  window.addEventListener("mouseup", () => (raspando = false));

  // Eventos de toque (celular): 1 dedo raspa; 2 dedos vira pinça de zoom/mover
  canvasRaspagem.addEventListener("touchstart", (e) => {
    if (e.touches.length > 1) {
      raspando = false;
      return;
    }
    raspando = true;
    aoMover(e);
  });
  canvasRaspagem.addEventListener("touchmove", (e) => {
    if (e.touches.length > 1) {
      raspando = false;
      return;
    }
    aoMover(e);
  });
  window.addEventListener("touchend", () => (raspando = false));

  /* ---------- Zoom (roda do mouse) e pinça de 2 dedos (zoom + mover) ---------- */

  let escala = 1;
  let deslocX = 0;
  let deslocY = 0;

  function aplicarTransform() {
    wrapper.style.transform =
      `translate(${deslocX}px, ${deslocY}px) scale(${escala})`;
  }

  function distanciaEMeio(touches) {
    const [a, b] = touches;
    return {
      distancia: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
      meioX: (a.clientX + b.clientX) / 2,
      meioY: (a.clientY + b.clientY) / 2,
    };
  }

  // Roda do mouse (desktop): zoom centralizado
  viewport.addEventListener(
    "wheel",
    (evento) => {
      evento.preventDefault();
      const fator = evento.deltaY < 0 ? 1.15 : 1 / 1.15;
      escala = Math.min(escalaMaxima, Math.max(1, escala * fator));
      if (escala === 1) {
        deslocX = 0;
        deslocY = 0;
      }
      aplicarTransform();
    },
    { passive: false }
  );

  // Pinça de 2 dedos (celular): zoom + mover a imagem
  let pinca = null;

  viewport.addEventListener(
    "touchstart",
    (evento) => {
      if (evento.touches.length !== 2) return;
      const inicio = distanciaEMeio(evento.touches);
      pinca = { ...inicio, escalaInicial: escala, deslocXInicial: deslocX, deslocYInicial: deslocY };
    },
    { passive: true }
  );

  viewport.addEventListener(
    "touchmove",
    (evento) => {
      if (evento.touches.length !== 2 || !pinca) return;
      evento.preventDefault();
      const atual = distanciaEMeio(evento.touches);
      const fatorEscala = atual.distancia / pinca.distancia;
      escala = Math.min(escalaMaxima, Math.max(1, pinca.escalaInicial * fatorEscala));
      deslocX = pinca.deslocXInicial + (atual.meioX - pinca.meioX);
      deslocY = pinca.deslocYInicial + (atual.meioY - pinca.meioY);
      aplicarTransform();
    },
    { passive: false }
  );

  viewport.addEventListener("touchend", (evento) => {
    if (evento.touches.length < 2) pinca = null;
  });

  // Duplo clique/toque: reseta o zoom
  viewport.addEventListener("dblclick", () => {
    escala = 1;
    deslocX = 0;
    deslocY = 0;
    aplicarTransform();
  });
}
