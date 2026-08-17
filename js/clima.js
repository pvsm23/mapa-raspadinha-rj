/**
 * Clima do Desbrava -- Open-Meteo.
 *
 * Módulo isolado de propósito: nada aqui toca no DOM do app. Ele só
 * busca, traduz e devolve dado pronto; quem desenha é o js/script.js.
 *
 * POR QUE OPEN-METEO: é gratuito, não pede chave de API e não exige
 * cadastro -- ou seja, não coloca segredo nenhum num repositório
 * público (ver a regra do Plano PRO no CLAUDE.md, mesma preocupação).
 *
 * TRÊS CUIDADOS QUE MOLDARAM ESTE ARQUIVO:
 *
 * 1. UMA REQUISIÇÃO PRA VÁRIAS CIDADES. O endpoint aceita latitude e
 *    longitude separadas por vírgula e devolve um ARRAY na mesma ordem.
 *    O "Modo Clima" do mapa mostra dezenas de chips ao mesmo tempo --
 *    sem isso seriam dezenas de chamadas por vez, e a API tem limite
 *    diário de uso justo.
 *
 * 2. CACHE COM VALIDADE. Clima não muda de minuto em minuto, e o mesmo
 *    município é reaberto o tempo todo. Guarda em memória e em
 *    sessionStorage (não localStorage: não faz sentido servir o tempo
 *    de ontem para quem abre o app hoje).
 *
 * 3. FALHA É SILENCIOSA. Sem rede, com a API fora do ar ou em modo
 *    offline, tudo devolve null e a interface some com o widget. Clima
 *    é enfeite -- não pode derrubar o mapa nem o modal.
 */
(function () {
  "use strict";

  const BASE = "https://api.open-meteo.com/v1/forecast";
  const VALIDADE_MS = 30 * 60 * 1000; // 30 min
  const CHAVE_CACHE = "desbrava_clima_v1";
  const TEMPO_LIMITE_MS = 8000;

  /* Quantas cidades cabem numa chamada. O limite real da API é bem
     maior, mas URL gigante começa a esbarrar em proxy e em log; 40 dá
     conta do mapa inteiro em duas chamadas. */
  const POR_LOTE = 40;

  /* ---------------- Códigos WMO ----------------
   * A API devolve um número (weathercode). A tabela oficial tem ~28
   * valores que se agrupam em poucas FAMÍLIAS visuais -- não faz
   * sentido um ícone diferente pra "chuva leve" e "chuva moderada"
   * num chip de 60px.
   *
   * Os ícones são SVG de CONTORNO (stroke), sem preenchimento e sem
   * cor fixa: herdam currentColor, então funcionam igual no tema claro
   * e no escuro. Nada de emoji nem PNG datado. */
  const SOL =
    '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>';
  const LUA = '<path d="M20 14.2A8.4 8.4 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z"/>';
  const NUVEM = '<path d="M6.8 18.5h10.4a3.7 3.7 0 0 0 .3-7.4 5.6 5.6 0 0 0-10.8-1.3 4.3 4.3 0 0 0 .1 8.7z"/>';
  const SOL_NUVEM =
    '<path d="M7.6 12.2A4.4 4.4 0 0 1 15 9.4"/><path d="M12 3.4v1.7M4.6 10.8H2.9M6.3 5.1 5.1 3.9M17.7 5.1l1.2-1.2"/>' +
    '<path d="M8.4 19.6h9a3.3 3.3 0 0 0 .2-6.6 5 5 0 0 0-9.6-1.1 3.9 3.9 0 0 0 .4 7.7z"/>';
  const CHUVA = NUVEM + '<path d="M8.6 20.4l-.9 2M12 20.4l-.9 2M15.4 20.4l-.9 2"/>';
  const PANCADA = NUVEM + '<path d="M9.2 20.2l-.7 1.6M12.6 20.2l-.7 1.6M16 20.2l-.7 1.6"/>';
  const NEVE = NUVEM + '<path d="M9 21h.01M12 21h.01M15 21h.01M10.5 22.6h.01M13.5 22.6h.01"/>';
  const TROVOADA = NUVEM + '<path d="M13 19.6l-2.6 3.4h2.4l-1 2.4"/>';
  const NEVOA =
    '<path d="M3.5 8.5h17M5.5 12h13M3.5 15.5h17M7.5 19h9"/>';
  const GAROA = NUVEM + '<path d="M9.4 20.6l-.5 1.4M12.8 20.6l-.5 1.4"/>';

  /* Cada faixa: [ícone, rótulo curto]. O rótulo entra no aria-label e
     no title -- quem usa leitor de tela não fica sem a informação. */
  const TABELA_WMO = {
    0: [SOL, "Céu limpo"],
    1: [SOL, "Predomínio de sol"],
    2: [SOL_NUVEM, "Parcialmente nublado"],
    3: [NUVEM, "Nublado"],
    45: [NEVOA, "Névoa"],
    48: [NEVOA, "Névoa com geada"],
    51: [GAROA, "Garoa fraca"],
    53: [GAROA, "Garoa"],
    55: [GAROA, "Garoa forte"],
    56: [GAROA, "Garoa congelante"],
    57: [GAROA, "Garoa congelante forte"],
    61: [CHUVA, "Chuva fraca"],
    63: [CHUVA, "Chuva"],
    65: [CHUVA, "Chuva forte"],
    66: [CHUVA, "Chuva congelante"],
    67: [CHUVA, "Chuva congelante forte"],
    71: [NEVE, "Neve fraca"],
    73: [NEVE, "Neve"],
    75: [NEVE, "Neve forte"],
    77: [NEVE, "Grãos de neve"],
    80: [PANCADA, "Pancadas isoladas"],
    81: [PANCADA, "Pancadas de chuva"],
    82: [PANCADA, "Pancadas fortes"],
    85: [NEVE, "Pancadas de neve"],
    86: [NEVE, "Pancadas de neve fortes"],
    95: [TROVOADA, "Trovoada"],
    96: [TROVOADA, "Trovoada com granizo"],
    99: [TROVOADA, "Trovoada com granizo forte"],
  };

  /**
   * SVG pronto pro código WMO.
   *
   * `ehNoite` troca sol por lua SÓ no céu limpo e no predomínio de sol
   * -- "nublado" de noite continua sendo uma nuvem, e desenhar lua
   * atrás de chuva só polui.
   */
  function iconeDoTempo(codigo, ehNoite) {
    const [caminho, rotulo] = TABELA_WMO[codigo] || [NUVEM, "Sem informação"];
    const corpo = ehNoite && (codigo === 0 || codigo === 1) ? LUA : caminho;
    return {
      svg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        corpo +
        "</svg>",
      rotulo,
    };
  }

  /** "2026-08-17T18:32" -> "18:32". Devolve "" se vier qualquer outra coisa. */
  function soAHora(iso) {
    const encontrado = String(iso || "").match(/T(\d{2}:\d{2})/);
    return encontrado ? encontrado[1] : "";
  }

  /** Nome curto do dia ("hoje", "qua", "qui") a partir do AAAA-MM-DD. */
  function diaCurto(iso, indice) {
    if (indice === 0) return "hoje";
    const partes = String(iso || "").split("-").map(Number);
    if (partes.length !== 3) return "";
    // Meio-dia evita o dia "voltar" por fuso na conversão.
    const data = new Date(partes[0], partes[1] - 1, partes[2], 12);
    return data.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  }

  // ---------------- Cache ----------------
  const memoria = new Map(); // chave -> { quando, dados }
  const emVoo = new Map(); // chave -> Promise (evita pedir 2x o mesmo)

  function lerDoDisco() {
    try {
      const cru = sessionStorage.getItem(CHAVE_CACHE);
      if (!cru) return;
      const guardado = JSON.parse(cru);
      const agora = Date.now();
      for (const [chave, valor] of Object.entries(guardado)) {
        if (agora - valor.quando < VALIDADE_MS) memoria.set(chave, valor);
      }
    } catch {
      /* storage bloqueado ou lixo gravado: começa do zero */
    }
  }

  let gravacaoAgendada = null;
  function gravarNoDisco() {
    // Agrupa gravações: o Modo Clima preenche dezenas de chaves de uma
    // vez, e serializar a cada uma seria trabalho jogado fora.
    clearTimeout(gravacaoAgendada);
    gravacaoAgendada = setTimeout(() => {
      try {
        sessionStorage.setItem(CHAVE_CACHE, JSON.stringify(Object.fromEntries(memoria)));
      } catch {
        /* cota cheia: o cache em memória continua valendo nesta sessão */
      }
    }, 400);
  }

  const chaveDe = (lat, lon) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

  function doCache(lat, lon) {
    const item = memoria.get(chaveDe(lat, lon));
    if (!item) return null;
    if (Date.now() - item.quando > VALIDADE_MS) return null;
    return item.dados;
  }

  // ---------------- Rede ----------------
  async function pedir(url) {
    const cancelador = new AbortController();
    const relogio = setTimeout(() => cancelador.abort(), TEMPO_LIMITE_MS);
    try {
      const resposta = await fetch(url, { signal: cancelador.signal });
      if (!resposta.ok) return null;
      return await resposta.json();
    } catch {
      return null; // offline, timeout, API fora: o app segue sem clima
    } finally {
      clearTimeout(relogio);
    }
  }

  /** Normaliza a resposta crua da API pro formato que a interface usa. */
  function arrumar(cru) {
    if (!cru || !cru.current_weather) return null;
    const diario = cru.daily || {};
    const dias = (diario.time || []).map((data, i) => ({
      data,
      rotulo: diaCurto(data, i),
      codigo: diario.weathercode?.[i],
      max: Math.round(diario.temperature_2m_max?.[i]),
      min: Math.round(diario.temperature_2m_min?.[i]),
    }));
    return {
      temperatura: Math.round(cru.current_weather.temperature),
      vento: Math.round(cru.current_weather.windspeed),
      codigo: cru.current_weather.weathercode,
      // is_day vem 1/0; o ícone usa isso pra escolher sol ou lua.
      ehNoite: cru.current_weather.is_day === 0,
      altitude: typeof cru.elevation === "number" ? Math.round(cru.elevation) : null,
      nascer: soAHora(diario.sunrise?.[0]),
      porDoSol: soAHora(diario.sunset?.[0]),
      dias,
    };
  }

  function montarUrl(lats, lons) {
    const p = new URLSearchParams({
      latitude: lats.join(","),
      longitude: lons.join(","),
      current_weather: "true",
      daily: "weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset",
      timezone: "America/Sao_Paulo",
      forecast_days: "4",
    });
    return `${BASE}?${p}`;
  }

  /**
   * Clima de UM lugar. Usa cache, e duas chamadas simultâneas pro mesmo
   * lugar viram uma só (`emVoo`).
   */
  async function doLugar(lat, lon) {
    const chave = chaveDe(lat, lon);
    const guardado = doCache(lat, lon);
    if (guardado) return guardado;
    if (emVoo.has(chave)) return emVoo.get(chave);

    const promessa = (async () => {
      const cru = await pedir(montarUrl([lat.toFixed(4)], [lon.toFixed(4)]));
      // Com UMA coordenada a API devolve objeto; com várias, array.
      const dados = arrumar(Array.isArray(cru) ? cru[0] : cru);
      if (dados) {
        memoria.set(chave, { quando: Date.now(), dados });
        gravarNoDisco();
      }
      emVoo.delete(chave);
      return dados;
    })();

    emVoo.set(chave, promessa);
    return promessa;
  }

  /**
   * Clima de VÁRIOS lugares numa tacada.
   *
   * Recebe [{ id, lat, lon }] e devolve um Map de id -> dados. O que já
   * está em cache nem entra na chamada; o resto vai em lotes de
   * POR_LOTE. É o que sustenta o Modo Clima sem estourar a API.
   */
  async function deVarios(lugares) {
    const saida = new Map();
    const faltando = [];

    for (const lugar of lugares) {
      const guardado = doCache(lugar.lat, lugar.lon);
      if (guardado) saida.set(lugar.id, guardado);
      else faltando.push(lugar);
    }
    if (!faltando.length) return saida;

    for (let i = 0; i < faltando.length; i += POR_LOTE) {
      const lote = faltando.slice(i, i + POR_LOTE);
      const cru = await pedir(
        montarUrl(
          lote.map((l) => l.lat.toFixed(4)),
          lote.map((l) => l.lon.toFixed(4))
        )
      );
      if (!cru) continue;
      // Um lote de 1 volta como objeto, não como array.
      const lista = Array.isArray(cru) ? cru : [cru];
      lote.forEach((lugar, indice) => {
        const dados = arrumar(lista[indice]);
        if (!dados) return;
        saida.set(lugar.id, dados);
        memoria.set(chaveDe(lugar.lat, lugar.lon), { quando: Date.now(), dados });
      });
      gravarNoDisco();
    }
    return saida;
  }

  lerDoDisco();

  window.desbravaClima = {
    doLugar,
    deVarios,
    iconeDoTempo,
    soAHora,
    doCache,
  };
})();
