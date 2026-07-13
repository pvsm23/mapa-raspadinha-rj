/**
 * Login com e-mail e senha via Firebase Authentication + Google
 * Analytics (medir acessos) + Firestore (apelido, progresso online
 * pro ranking, amigos, check-in mensal e convites de raspadinha
 * brilhante).
 *
 * Este arquivo é um módulo ES (por isso o <script type="module"> no
 * index.html) porque o SDK do Firebase é distribuído assim. Como
 * script.js é um script "normal" (não módulo), a ponte entre os dois
 * é o objeto global `window.raspadinhaAuth` e eventos customizados
 * ("auth-mudou", "precisa-apelido", "boosts-brilhantes-mudou").
 *
 * Login com e-mail/senha (em vez de Google): não depende da lista
 * de "domínios autorizados" do Firebase, que é o que provavelmente
 * travava o login com Google no site publicado no GitHub Pages
 * (esse domínio provavelmente não estava naquela lista).
 *
 * Enquanto js/firebase-config.js não tiver as chaves reais (ver
 * SUBSTITUA_AQUI nesse arquivo), o login fica desativado sem quebrar
 * o resto do app.
 */
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-analytics.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  arrayUnion,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getCountFromServer,
  onSnapshot,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const CONFIGURADO = firebaseConfig.apiKey !== "SUBSTITUA_AQUI";

// Sessão dura 30 dias de INATIVIDADE (não 30 dias corridos): toda
// vez que o app abre com uma sessão válida, o prazo é renovado. Só
// desloga de verdade se passar 30 dias sem abrir o app nenhuma vez.
const CHAVE_ULTIMA_ATIVIDADE = "raspadinha_ultima_atividade";
const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

// Guardado quando alguém chega pelo link de convite (?convite=uid),
// até o momento em que a conta é criada de verdade (ver
// creditarConviteSeExistir), pra dar a raspadinha brilhante garantida
// pra quem convidou.
const CHAVE_CONVITE_PENDENTE = "desbrava_convite_pendente";

const AVISO_NAO_CONFIGURADO =
  "Login ainda não configurado. Preencha js/firebase-config.js com as chaves do seu projeto Firebase.";

/**
 * Nunca deixa o apelido ter formato de e-mail (pra não confundir com
 * o e-mail de login, e não vazar sem querer o e-mail de alguém pelo
 * ranking/busca de amigos, que mostram o apelido publicamente).
 */
function pareceEmail(texto) {
  return /\S+@\S+\.\S+/.test(texto);
}

window.raspadinhaAuth = {
  configurado: CONFIGURADO,
  usuarioAtual: null,
  apelido: null,
  ehPro: false,
  db: null,
  boostsBrilhantesPendentes: 0,
  entrarComEmail: async () => {
    throw new Error(AVISO_NAO_CONFIGURADO);
  },
  criarContaComEmail: async () => {
    throw new Error(AVISO_NAO_CONFIGURADO);
  },
  enviarEmailProprio: async () => {},
  sair: () => {},
  salvarApelido: async () => {},
  sincronizarProgresso: async () => {},
  buscarRanking: async () => [],
  buscarMinhaPosicao: async () => null,
  buscarUsuario: async () => null,
  enviarPedidoAmizade: async () => {},
  listarPedidosRecebidos: async () => [],
  aceitarPedidoAmizade: async () => {},
  recusarPedidoAmizade: async () => {},
  listarAmigos: async () => [],
  removerAmigo: async () => {},
  registrarCheckinHoje: async () => {},
  buscarCheckinsDaSemana: async () => [],
  consumirBoostBrilhante: () => false,
  sincronizarMunicipio: async () => {},
  sincronizarRegiao: async () => {},
  sincronizarConquista: async () => {},
  definirPerfilPublico: async () => {},
  buscarPerfilPublico: async () => null,
  salvarSnapshotMapa: async () => {},
  contarPessoasComMunicipioVerificado: async () => 0,
  contarPessoasComRegiao: async () => 0,
  contarTotalContas: async () => 0,
  resetarEstadoPublico: async () => {},
  // TODO(PRO): trocar por uma verificação real (ex: campo no
  // Firestore ligado ao usuário logado) quando o controle de
  // assinatura PRO existir.
  ehPro: () => false,
};

if (CONFIGURADO) {
  const app = initializeApp(firebaseConfig);
  getAnalytics(app); // conta acessos automaticamente (ver Firebase Console > Analytics)
  const auth = getAuth(app);
  const db = getFirestore(app);
  window.raspadinhaAuth.db = db;

  window.raspadinhaAuth.entrarComEmail = (email, senha) =>
    signInWithEmailAndPassword(auth, email, senha);

  window.raspadinhaAuth.criarContaComEmail = async (email, senha) => {
    const resultado = await createUserWithEmailAndPassword(auth, email, senha);
    await creditarConviteSeExistir(resultado.user.uid);
    window.raspadinhaAuth.enviarEmailProprio(
      "Bem-vindo(a) ao Desbrava! 🗺️",
      "<p>Oi! Sua conta no Desbrava foi criada com sucesso.</p>" +
        "<p>Agora é só explorar o mapa do Rio de Janeiro e raspar os municípios conforme for visitando cada um.</p>"
    );
    return resultado;
  };

  /**
   * Enfileira um e-mail pro Firebase Extension "Trigger Email"
   * (firestore-send-email) processar e enviar de verdade -- exige a
   * extensão instalada + projeto no plano Blaze (ver README.md).
   * Enquanto isso não estiver configurado, o documento só fica
   * parado na coleção "mail" sem efeito nenhum (não quebra o app).
   *
   * Só manda pro PRÓPRIO e-mail do usuário logado -- a regra do
   * Firestore exige isso (compara com `request.auth.token.email`),
   * pra essa coleção não virar um jeito de mandar spam pra terceiros
   * usando a conta de qualquer um.
   */
  window.raspadinhaAuth.enviarEmailProprio = (assunto, corpoHtml) => {
    const usuario = auth.currentUser;
    if (!usuario?.email) return Promise.resolve();
    return addDoc(collection(db, "mail"), {
      to: [usuario.email],
      message: { subject: assunto, html: corpoHtml },
    }).catch((erro) => console.error("Falha ao enfileirar e-mail:", erro));
  };

  window.raspadinhaAuth.sair = () => signOut(auth);

  window.raspadinhaAuth.salvarApelido = async (apelido) => {
    const usuario = auth.currentUser;
    if (!usuario) return;

    if (pareceEmail(apelido)) {
      throw Object.assign(new Error("O apelido não pode ter formato de e-mail."), {
        code: "apelido/formato-invalido",
      });
    }

    const disponivel = await apelidoEstaDisponivel(apelido, usuario.uid);
    if (!disponivel) {
      throw Object.assign(new Error("Esse nome de usuário já está em uso."), {
        code: "apelido/em-uso",
      });
    }

    await setDoc(
      doc(db, "usuarios", usuario.uid),
      { apelido, email: usuario.email, atualizadoEm: serverTimestamp() },
      { merge: true }
    );
    window.raspadinhaAuth.apelido = apelido;
    document.dispatchEvent(
      new CustomEvent("auth-mudou", { detail: { usuario, apelido } })
    );
  };

  /**
   * Verdadeiro se nenhum OUTRO usuário já estiver usando esse
   * apelido (o próprio usuário pode "reescolher" o mesmo apelido que
   * já tinha, sem problema). Exige a regra de segurança do Firestore
   * permitir leitura da coleção "usuarios" pra qualquer autenticado
   * (ver README) — só assim dá pra checar apelidos de outros perfis.
   */
  async function apelidoEstaDisponivel(apelido, uidAtual) {
    const consulta = query(collection(db, "usuarios"), where("apelido", "==", apelido));
    const resultado = await getDocs(consulta);
    return resultado.docs.every((documento) => documento.id === uidAtual);
  }

  /**
   * Grava a contagem de municípios visitados no perfil do usuário —
   * é essa contagem que alimenta o Ranking online (ver
   * buscarRanking/buscarMinhaPosicao). Silenciosa (não trava nada no
   * mapa se falhar; só loga no console).
   */
  window.raspadinhaAuth.sincronizarProgresso = (count) => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.resolve();
    return setDoc(
      doc(db, "usuarios", usuario.uid),
      { municipiosVisitadosCount: count, atualizadoEm: serverTimestamp() },
      { merge: true }
    ).catch((erro) => console.error("Falha ao sincronizar progresso:", erro));
  };

  /**
   * Sincroniza o estado detalhado de UM município/região/conquista no
   * perfil do usuário (merge recursivo -- só toca essa chave, o resto
   * do mapa fica intacto). É esse estado detalhado que alimenta o
   * perfil público (ver buscarPerfilPublico) e as contagens de "quantas
   * pessoas têm esse selo" (ver contarPessoasCom*).
   */
  window.raspadinhaAuth.sincronizarMunicipio = (id, dados) => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.resolve();
    return setDoc(
      doc(db, "usuarios", usuario.uid),
      { estadoMunicipios: { [id]: dados } },
      { merge: true }
    ).catch((erro) => console.error("Falha ao sincronizar município (perfil):", erro));
  };

  window.raspadinhaAuth.sincronizarRegiao = (id, dados) => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.resolve();
    return setDoc(
      doc(db, "usuarios", usuario.uid),
      { estadoRegioes: { [id]: dados } },
      { merge: true }
    ).catch((erro) => console.error("Falha ao sincronizar região (perfil):", erro));
  };

  window.raspadinhaAuth.sincronizarConquista = (chave, revelado) => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.resolve();
    return setDoc(
      doc(db, "usuarios", usuario.uid),
      { estadoConquistas: { [chave]: revelado } },
      { merge: true }
    ).catch((erro) => console.error("Falha ao sincronizar conquista (perfil):", erro));
  };

  /**
   * Liga/desliga a visibilidade do perfil público (padrão: público,
   * já que é opt-out, não opt-in -- ver README).
   */
  window.raspadinhaAuth.definirPerfilPublico = (publico) => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.resolve();
    return setDoc(
      doc(db, "usuarios", usuario.uid),
      { perfilPublico: !!publico },
      { merge: true }
    ).catch((erro) => console.error("Falha ao salvar privacidade do perfil:", erro));
  };

  /**
   * Busca o perfil público de OUTRO usuário (ranking, amigos). O
   * documento inteiro já é legível por qualquer autenticado (regra do
   * Firestore), então a privacidade aqui é só de EXIBIÇÃO -- ver nota
   * no README sobre essa limitação (sem Cloud Functions, não dá pra
   * esconder o campo no nível do servidor).
   */
  window.raspadinhaAuth.buscarPerfilPublico = async (uidAlvo) => {
    const snap = await getDoc(doc(db, "usuarios", uidAlvo));
    if (!snap.exists()) return null;
    const dados = snap.data();
    return {
      apelido: dados.apelido || "?",
      perfilPublico: dados.perfilPublico !== false,
      municipiosVisitadosCount: dados.municipiosVisitadosCount || 0,
      estadoMunicipios: dados.estadoMunicipios || {},
      estadoRegioes: dados.estadoRegioes || {},
      mapaSnapshot: dados.mapaSnapshot || null,
      mapaSnapshotData: dados.mapaSnapshotData || null,
    };
  };

  /**
   * Grava o snapshot estático (imagem, gerada 1x por dia em
   * js/script.js: gerarSnapshotMapaSeNecessario) que alimenta o
   * mini-mapa do perfil público -- em vez de clonar o SVG ao vivo, que
   * ficava com zoom/posição errados dependendo de como o mapa grande
   * estava no momento (ver renderizarMiniMapaPerfil).
   */
  window.raspadinhaAuth.salvarSnapshotMapa = (dataUrl, dataDoSnapshot) => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.resolve();
    return setDoc(
      doc(db, "usuarios", usuario.uid),
      { mapaSnapshot: dataUrl, mapaSnapshotData: dataDoSnapshot },
      { merge: true }
    ).catch((erro) => console.error("Falha ao salvar snapshot do mapa:", erro));
  };

  /**
   * Contagens agregadas ("quantas contas têm esse selo") calculadas
   * na hora via consulta ao Firestore (getCountFromServer), sem
   * manter contadores separados -- mais simples e sem risco de ficar
   * dessincronizado. Usadas com moderação (uma consulta por selo
   * aberto, não pra grade inteira de uma vez).
   */
  window.raspadinhaAuth.contarPessoasComMunicipioVerificado = async (id) => {
    const consulta = query(
      collection(db, "usuarios"),
      where(`estadoMunicipios.${id}.verificado`, "==", true)
    );
    const agregada = await getCountFromServer(consulta);
    return agregada.data().count;
  };

  window.raspadinhaAuth.contarPessoasComRegiao = async (id) => {
    const consulta = query(
      collection(db, "usuarios"),
      where(`estadoRegioes.${id}.revelado`, "==", true)
    );
    const agregada = await getCountFromServer(consulta);
    return agregada.data().count;
  };

  window.raspadinhaAuth.contarTotalContas = async () => {
    const agregada = await getCountFromServer(collection(db, "usuarios"));
    return agregada.data().count;
  };

  /**
   * Zera o estado público (perfil) inteiro -- chamado junto do
   * "resetar mapa" local, senão o perfil público continuaria
   * mostrando o progresso antigo.
   */
  window.raspadinhaAuth.resetarEstadoPublico = () => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.resolve();
    return setDoc(
      doc(db, "usuarios", usuario.uid),
      { estadoMunicipios: {}, estadoRegioes: {}, estadoConquistas: {}, municipiosVisitadosCount: 0 },
      { merge: true }
    ).catch((erro) => console.error("Falha ao resetar estado público:", erro));
  };

  /**
   * Top N do ranking (mais municípios visitados primeiro). Usuários
   * que ainda não sincronizaram nenhum progresso (campo inexistente)
   * simplesmente não aparecem — normal pra quem acabou de criar
   * conta e ainda não raspou nada.
   */
  window.raspadinhaAuth.buscarRanking = async (limiteN = 50) => {
    const consulta = query(
      collection(db, "usuarios"),
      orderBy("municipiosVisitadosCount", "desc"),
      limit(limiteN)
    );
    const resultado = await getDocs(consulta);
    return resultado.docs.map((d) => ({
      uid: d.id,
      apelido: d.data().apelido || "?",
      count: d.data().municipiosVisitadosCount || 0,
      ehPro: !!d.data().ehPro,
    }));
  };

  /**
   * Posição do usuário atual no ranking geral (mesmo que fora do
   * topo N exibido), contando quantos têm uma contagem maior.
   */
  window.raspadinhaAuth.buscarMinhaPosicao = async (meuCount) => {
    const consulta = query(
      collection(db, "usuarios"),
      where("municipiosVisitadosCount", ">", meuCount)
    );
    const agregada = await getCountFromServer(consulta);
    return agregada.data().count + 1;
  };

  /**
   * Busca um usuário por e-mail exato (se o texto tiver "@") ou por
   * apelido exato, pra aba de Amigos.
   */
  window.raspadinhaAuth.buscarUsuario = async (texto) => {
    const valor = texto.trim();
    if (!valor) return null;
    const campo = valor.includes("@") ? "email" : "apelido";
    const consulta = query(collection(db, "usuarios"), where(campo, "==", valor));
    const resultado = await getDocs(consulta);
    if (resultado.empty) return null;
    const encontrado = resultado.docs[0];
    return {
      uid: encontrado.id,
      apelido: encontrado.data().apelido || "?",
      email: encontrado.data().email || "",
    };
  };

  window.raspadinhaAuth.enviarPedidoAmizade = (destinatarioUid) => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.reject(new Error("Faça login primeiro."));
    if (usuario.uid === destinatarioUid) {
      return Promise.reject(new Error("Você não pode adicionar a si mesmo."));
    }
    return setDoc(doc(db, "usuarios", destinatarioUid, "pedidosAmizade", usuario.uid), {
      apelido: window.raspadinhaAuth.apelido,
      criadoEm: serverTimestamp(),
    });
  };

  window.raspadinhaAuth.listarPedidosRecebidos = async () => {
    const usuario = auth.currentUser;
    if (!usuario) return [];
    const resultado = await getDocs(collection(db, "usuarios", usuario.uid, "pedidosAmizade"));
    return resultado.docs.map((d) => ({ uid: d.id, apelido: d.data().apelido || "?" }));
  };

  window.raspadinhaAuth.aceitarPedidoAmizade = (remetenteUid) => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.reject(new Error("Faça login primeiro."));
    const lote = writeBatch(db);
    lote.set(doc(db, "usuarios", usuario.uid, "amigos", remetenteUid), {
      desde: serverTimestamp(),
    });
    lote.set(doc(db, "usuarios", remetenteUid, "amigos", usuario.uid), {
      desde: serverTimestamp(),
    });
    lote.delete(doc(db, "usuarios", usuario.uid, "pedidosAmizade", remetenteUid));
    return lote.commit();
  };

  window.raspadinhaAuth.recusarPedidoAmizade = (remetenteUid) => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.reject(new Error("Faça login primeiro."));
    return deleteDoc(doc(db, "usuarios", usuario.uid, "pedidosAmizade", remetenteUid));
  };

  window.raspadinhaAuth.listarAmigos = async () => {
    const usuario = auth.currentUser;
    if (!usuario) return [];
    const resultado = await getDocs(collection(db, "usuarios", usuario.uid, "amigos"));
    return Promise.all(
      resultado.docs.map(async (d) => {
        const perfil = await getDoc(doc(db, "usuarios", d.id));
        return {
          uid: d.id,
          apelido: perfil.data()?.apelido || "?",
          count: perfil.data()?.municipiosVisitadosCount || 0,
          ehPro: !!perfil.data()?.ehPro,
        };
      })
    );
  };

  window.raspadinhaAuth.removerAmigo = (amigoUid) => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.reject(new Error("Faça login primeiro."));
    const lote = writeBatch(db);
    lote.delete(doc(db, "usuarios", usuario.uid, "amigos", amigoUid));
    lote.delete(doc(db, "usuarios", amigoUid, "amigos", usuario.uid));
    return lote.commit();
  };

  /* ---------- Check-in semanal ----------
     App de viagem tem poucos acessos por mês (não é um app de uso
     diário), então o check-in é por SEMANA (domingo a sábado), não
     por mês -- mais fácil de "completar" e faz mais sentido pro
     ritmo real de uso. */

  /**
   * Id da semana atual = data do domingo daquela semana
   * (AAAA-MM-DD). Assim cada semana tem uma chave própria e estável,
   * sem precisar calcular número de semana ISO.
   */
  function chaveSemanaAtual() {
    const agora = new Date();
    const domingo = new Date(agora);
    domingo.setDate(agora.getDate() - agora.getDay());
    const ano = domingo.getFullYear();
    const mes = String(domingo.getMonth() + 1).padStart(2, "0");
    const dia = String(domingo.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  window.raspadinhaAuth.registrarCheckinHoje = () => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.resolve();
    const diaDaSemana = new Date().getDay(); // 0 (domingo) a 6 (sábado)
    return setDoc(
      doc(db, "usuarios", usuario.uid, "checkins", chaveSemanaAtual()),
      { dias: arrayUnion(diaDaSemana) },
      { merge: true }
    ).catch((erro) => console.error("Falha ao registrar check-in:", erro));
  };

  window.raspadinhaAuth.buscarCheckinsDaSemana = async (semanaId) => {
    const usuario = auth.currentUser;
    if (!usuario) return [];
    const snap = await getDoc(
      doc(db, "usuarios", usuario.uid, "checkins", semanaId || chaveSemanaAtual())
    );
    return snap.exists() ? snap.data().dias || [] : [];
  };

  /* ---------- Convite de amigo -> raspadinha brilhante garantida ---------- */

  let convitesPendentes = []; // refs dos convites ainda não resgatados
  let pararDeObservarConvites = null;

  function observarConvites(uid) {
    pararDeObservarConvites?.();
    const consulta = query(
      collection(db, "usuarios", uid, "convites"),
      where("resgatado", "==", false)
    );
    pararDeObservarConvites = onSnapshot(
      consulta,
      (snap) => {
        convitesPendentes = snap.docs.map((d) => d.ref);
        window.raspadinhaAuth.boostsBrilhantesPendentes = convitesPendentes.length;
        document.dispatchEvent(new CustomEvent("boosts-brilhantes-mudou"));
      },
      (erro) => console.error("Falha ao observar convites:", erro)
    );
  }

  /**
   * Consome (sincronamente, do lado do cliente) uma raspadinha
   * brilhante garantida, se houver alguma pendente. A confirmação no
   * Firestore (marcar resgatado=true) roda em segundo plano — a
   * decisão de brilhante/não-brilhante não pode esperar uma
   * ida-e-volta de rede no meio da animação de raspar.
   */
  window.raspadinhaAuth.consumirBoostBrilhante = () => {
    if (convitesPendentes.length === 0) return false;
    const ref = convitesPendentes.shift();
    window.raspadinhaAuth.boostsBrilhantesPendentes = convitesPendentes.length;
    document.dispatchEvent(new CustomEvent("boosts-brilhantes-mudou"));
    updateDoc(ref, { resgatado: true, resgatadoEm: serverTimestamp() }).catch((erro) => {
      console.error("Falha ao consumir convite:", erro);
    });
    return true;
  };

  /**
   * Se essa conta acabou de ser criada por um link de convite
   * (?convite=uid, guardado em localStorage por script.js), credita
   * uma raspadinha brilhante garantida pra quem convidou. Cada nova
   * conta só pode criar UM documento de convite por convidante (o id
   * do documento é o próprio uid da conta nova), então não dá pra
   * "farmar" créditos repetidos pra um mesmo convidante com a mesma
   * conta.
   */
  async function creditarConviteSeExistir(novoUid) {
    const conviteDeUid = localStorage.getItem(CHAVE_CONVITE_PENDENTE);
    localStorage.removeItem(CHAVE_CONVITE_PENDENTE);
    if (!conviteDeUid || conviteDeUid === novoUid) return;
    try {
      await setDoc(doc(db, "usuarios", conviteDeUid, "convites", novoUid), {
        criadoEm: serverTimestamp(),
        resgatado: false,
      });
    } catch (erro) {
      console.error("Não foi possível creditar o convite:", erro);
    }
  }

  onAuthStateChanged(auth, async (usuario) => {
    if (usuario) {
      const ultimaAtividade = Number(localStorage.getItem(CHAVE_ULTIMA_ATIVIDADE) || 0);
      if (ultimaAtividade && Date.now() - ultimaAtividade > TRINTA_DIAS_MS) {
        // Mais de 30 dias sem abrir o app: desloga de verdade.
        // onAuthStateChanged dispara de novo com usuario=null.
        await signOut(auth);
        return;
      }
      localStorage.setItem(CHAVE_ULTIMA_ATIVIDADE, String(Date.now()));
      observarConvites(usuario.uid);
    } else {
      localStorage.removeItem(CHAVE_ULTIMA_ATIVIDADE);
      pararDeObservarConvites?.();
      convitesPendentes = [];
      window.raspadinhaAuth.boostsBrilhantesPendentes = 0;
      document.dispatchEvent(new CustomEvent("boosts-brilhantes-mudou"));
    }

    window.raspadinhaAuth.usuarioAtual = usuario;

    if (!usuario) {
      window.raspadinhaAuth.apelido = null;
      window.raspadinhaAuth.ehPro = false;
      document.dispatchEvent(new CustomEvent("auth-mudou", { detail: null }));
      return;
    }

    try {
      const snap = await getDoc(doc(db, "usuarios", usuario.uid));
      const apelido = snap.exists() ? snap.data().apelido : null;
      window.raspadinhaAuth.apelido = apelido || null;
      window.raspadinhaAuth.ehPro = !!snap.data()?.ehPro;

      if (apelido) {
        document.dispatchEvent(
          new CustomEvent("auth-mudou", { detail: { usuario, apelido } })
        );
      } else {
        document.dispatchEvent(new CustomEvent("precisa-apelido", { detail: usuario }));
      }
    } catch (erro) {
      console.error("Falha ao ler o perfil no Firestore:", erro);
      // Sem Firestore acessivel, segue com o e-mail mesmo (nao
      // trava o usuario fora do app por causa disso).
      document.dispatchEvent(
        new CustomEvent("auth-mudou", { detail: { usuario, apelido: usuario.email } })
      );
    }
  });
} else {
  console.warn(
    "Firebase ainda não configurado (js/firebase-config.js). Login desativado por enquanto."
  );
}
