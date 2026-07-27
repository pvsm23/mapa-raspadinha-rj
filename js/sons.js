/* =========================================================
   sons.js
   Efeitos sonoros sintetizados via Web Audio API -- sem arquivos de
   áudio (menor no APK, sem licenciamento pra gerenciar). Cada som é
   gerado na hora com osciladores/ruído filtrado.

   O AudioContext só é criado no primeiro gesto do usuário (exigência
   dos navegadores/WebView contra autoplay) -- ver iniciarAudioSeNecessario,
   chamada no primeiro toque em qualquer lugar do app.

   Preferência "som ligado/desligado" fica em Configurações, mesma ideia
   do toggle de notificações (localStorage, ver alternarSom).
   ========================================================= */

const CHAVE_SOM_ATIVADO = "scratchMapRJ_som_ativado_v1";

function somAtivado() {
  return localStorage.getItem(CHAVE_SOM_ATIVADO) !== "false";
}

function alternarSom(ativar) {
  localStorage.setItem(CHAVE_SOM_ATIVADO, ativar ? "true" : "false");
}

let ctxAudio = null;
let ultimoRasparEm = 0;

function iniciarAudioSeNecessario() {
  if (ctxAudio) return ctxAudio;
  try {
    ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
  } catch (erro) {
    console.error("Web Audio não disponível:", erro);
  }
  return ctxAudio;
}

// Primeiro toque em qualquer lugar do app "desbloqueia" o áudio.
document.addEventListener("pointerdown", () => iniciarAudioSeNecessario(), {
  once: true,
  passive: true,
});

/** Toca um tom simples (seno/triângulo) com envelope de volume. */
function tocarTom(freq, duracao, { tipo = "sine", volume = 0.15, atraso = 0 } = {}) {
  if (!somAtivado() || !ctxAudio) return;
  const t0 = ctxAudio.currentTime + atraso;
  const osc = ctxAudio.createOscillator();
  const ganho = ctxAudio.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(freq, t0);
  ganho.gain.setValueAtTime(0, t0);
  ganho.gain.linearRampToValueAtTime(volume, t0 + 0.012);
  ganho.gain.exponentialRampToValueAtTime(0.001, t0 + duracao);
  osc.connect(ganho).connect(ctxAudio.destination);
  osc.start(t0);
  osc.stop(t0 + duracao + 0.02);
}

/** Toca um breve borrão de ruído filtrado -- usado pro som de "raspar". */
function tocarRuido(duracao, { volume = 0.06, freqFiltro = 2200 } = {}) {
  if (!somAtivado() || !ctxAudio) return;
  const amostras = Math.floor(ctxAudio.sampleRate * duracao);
  const buffer = ctxAudio.createBuffer(1, amostras, ctxAudio.sampleRate);
  const dados = buffer.getChannelData(0);
  for (let i = 0; i < amostras; i++) dados[i] = Math.random() * 2 - 1;

  const fonte = ctxAudio.createBufferSource();
  fonte.buffer = buffer;
  const filtro = ctxAudio.createBiquadFilter();
  filtro.type = "bandpass";
  filtro.frequency.value = freqFiltro;
  filtro.Q.value = 0.8;
  const ganho = ctxAudio.createGain();
  const t0 = ctxAudio.currentTime;
  ganho.gain.setValueAtTime(volume, t0);
  ganho.gain.exponentialRampToValueAtTime(0.001, t0 + duracao);

  fonte.connect(filtro).connect(ganho).connect(ctxAudio.destination);
  fonte.start(t0);
}

/**
 * Som de "raspar" -- chamado a cada movimento do dedo/mouse durante a
 * raspagem (ver raspar() em scratch-card.js). Throttled (a cada ~55ms)
 * pra não virar um ruído contínuo estourado com muitos disparos por
 * segundo.
 */
function tocarSomRaspar() {
  const agora = Date.now();
  if (agora - ultimoRasparEm < 55) return;
  ultimoRasparEm = agora;
  tocarRuido(0.09, { volume: 0.05, freqFiltro: 1800 + Math.random() * 800 });
}

/** Selo revelado (raspagem normal concluída) -- "ding" de dois tons. */
function tocarSomRevelar() {
  tocarTom(660, 0.16, { tipo: "triangle", volume: 0.14 });
  tocarTom(880, 0.22, { tipo: "triangle", volume: 0.12, atraso: 0.07 });
}

/** Selo DOURADO (raspagem brilhante) -- arpejo ascendente mais "mágico". */
function tocarSomBrilhante() {
  const notas = [523, 659, 784, 1047, 1319]; // arpejo maior, C-E-G-C-E
  notas.forEach((freq, i) => {
    tocarTom(freq, 0.28, { tipo: "sine", volume: 0.12, atraso: i * 0.06 });
  });
}

/** Curtir um post/sugestão -- "pop" curto e agudo. */
function tocarSomCurtir() {
  tocarTom(520, 0.09, { tipo: "sine", volume: 0.1 });
  tocarTom(780, 0.1, { tipo: "sine", volume: 0.08, atraso: 0.03 });
}

/** Conquista desbloqueada -- fanfarra curta de 3 notas. */
function tocarSomConquista() {
  [523, 659, 1047].forEach((freq, i) => {
    tocarTom(freq, 0.3, { tipo: "square", volume: 0.09, atraso: i * 0.1 });
  });
}
