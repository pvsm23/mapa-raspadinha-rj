/* =========================================================
   scratch-card.js
   Motor genérico de "raspadinha" via Canvas.
   Uso:
     initScratchCard({
       containerId: "scratch-modal-body",
       imageUrl: "selos/3303302.png",
       onComplete: () => marcarComoVisitado("3303302")
     });

   Como funciona:
   1. Desenha a imagem colorida (selo) num <canvas> de fundo.
   2. Desenha uma camada cinza por cima, num <canvas> de "raspagem".
   3. Ao arrastar o dedo/mouse, apaga pixels da camada cinza
      (destination-out), revelando a imagem de baixo.
   4. A cada movimento, amostra os pixels da camada cinza para
      calcular quanto já foi raspado. Ao passar do limiar
      (ex: 55%), dispara onComplete() e revela tudo de vez.
   ========================================================= */

function initScratchCard({
  containerId,
  imageUrl,
  onComplete,
  raioPincel = 22,
  limiarConclusao = 0.55, // 55% raspado = considera concluído
}) {
  const container = document.getElementById(containerId);
  container.innerHTML = ""; // limpa raspadinha anterior, se houver

  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = "260px";
  wrapper.style.height = "260px";
  wrapper.style.margin = "0 auto";
  wrapper.style.touchAction = "none"; // evita rolar a página ao raspar no celular

  const canvasImagem = document.createElement("canvas");
  const canvasRaspagem = document.createElement("canvas");

  [canvasImagem, canvasRaspagem].forEach((c) => {
    c.width = 260;
    c.height = 260;
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
  img.src = imageUrl;
  img.onload = () => {
    ctxImagem.drawImage(img, 0, 0, 260, 260);
  };

  // 2. Pinta a camada cinza (a "raspa" em si)
  ctxRaspagem.fillStyle = "#9ca3af";
  ctxRaspagem.fillRect(0, 0, 260, 260);
  ctxRaspagem.fillStyle = "#6b7280";
  ctxRaspagem.font = "14px sans-serif";
  ctxRaspagem.textAlign = "center";
  ctxRaspagem.fillText("raspe aqui", 130, 134);

  let raspando = false;
  let concluido = false;

  function coordenadasEvento(evento) {
    const rect = canvasRaspagem.getBoundingClientRect();
    const ponto = evento.touches ? evento.touches[0] : evento;
    return {
      x: ponto.clientX - rect.left,
      y: ponto.clientY - rect.top,
    };
  }

  function raspar(x, y) {
    ctxRaspagem.globalCompositeOperation = "destination-out";
    ctxRaspagem.beginPath();
    ctxRaspagem.arc(x, y, raioPincel, 0, Math.PI * 2);
    ctxRaspagem.fill();
  }

  function calcularPorcentagemRaspada() {
    const dados = ctxRaspagem.getImageData(0, 0, 260, 260).data;
    let transparentes = 0;
    const totalPixels = dados.length / 4;

    // Amostragem a cada 4 pixels para performance
    for (let i = 3; i < dados.length; i += 16) {
      if (dados[i] === 0) transparentes++;
    }
    return transparentes / (totalPixels / 4);
  }

  function revelarTudo() {
    ctxRaspagem.clearRect(0, 0, 260, 260);
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
