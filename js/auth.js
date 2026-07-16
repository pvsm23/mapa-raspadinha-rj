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
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
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
  arrayRemove,
  increment,
  collection,
  collectionGroup,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getCountFromServer,
  onSnapshot,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getStorage,
  ref as refStorage,
  uploadBytes,
  getBytes,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

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

// URL do Google Apps Script Web App que grava os relatos de bug/
// sugestão (botão 💬) numa planilha do Google Sheets, além do
// Firestore -- ver enviarFeedbackParaPlanilha() e PENDENCIAS.md pra
// o passo a passo de deploy (o app da própria conta do Paulo). O
// mesmo Web App também recebe os registros de atividade suspeita e o
// espelho de status de conta (ver enviarParaPlanilha), cada um numa
// aba própria da planilha (ver tools/apps-script-feedback.gs).
const URL_PLANILHA_FEEDBACK =
  "https://script.google.com/macros/s/AKfycbyYHIrhBjxGBRmUEXxrSairtxPaQVEuazj0vKvmNWYLEBiNnpr5ftc8DuW2brcoLyBj/exec";

// Uid da conta "dona" do projeto -- só ela consegue mudar o status
// (ativo/suspenso/banido) de QUALQUER outra conta (ver painel de
// moderação em Configurações e a regra do Firestore em README.md).
// PASSO PENDENTE: substituir pelo uid real (Firebase Console >
// Authentication > coluna "UID" da sua própria conta).
const UID_DONO = "c9vv4d4bPSVgbYoJYU8XF1lHKWv1";

const AVISO_NAO_CONFIGURADO =
  "Login ainda não configurado. Preencha js/firebase-config.js com as chaves do seu projeto Firebase.";

// O SDK do Firebase Storage tenta de novo sozinho (com backoff) numa
// conexão instável, o que pode parecer "carregando pra sempre" numa
// rede de celular ruim -- essa função garante que qualquer operação
// falha com uma mensagem clara depois de um tempo, em vez de travar
// o spinner indefinidamente (ver uso em criarPost).
function comTimeout(promessa, ms, mensagemErro) {
  return Promise.race([
    promessa,
    new Promise((_, reject) => setTimeout(() => reject(new Error(mensagemErro)), ms)),
  ]);
}

/**
 * Nunca deixa o apelido ter formato de e-mail (pra não confundir com
 * o e-mail de login, e não vazar sem querer o e-mail de alguém pelo
 * ranking/busca de amigos, que mostram o apelido publicamente).
 */
function pareceEmail(texto) {
  return /\S+@\S+\.\S+/.test(texto);
}

/**
 * "municipio" é prefixo reservado pras menções @municipioNomeDoLugar
 * da rede social (ver slugMunicipio em js/script.js) -- se alguém
 * pudesse ter um apelido "municipioSaoGoncalo", a menção @municipio-
 * SaoGoncalo ficaria ambígua entre "marcou o município" e "marcou essa
 * pessoa". Só vale pra apelidos salvos daqui pra frente (mesmo
 * critério já usado quando a checagem de e-mail-como-apelido foi
 * adicionada -- não afeta retroativamente quem já tinha um apelido
 * assim).
 */
function comecaComPrefixoReservado(texto) {
  return /^municipio/i.test(texto);
}

window.raspadinhaAuth = {
  configurado: CONFIGURADO,
  usuarioAtual: null,
  apelido: null,
  // Distintivo "PRO" no ranking (ver README.md, seção Plano PRO) --
  // booleano, não confundir com a função `ehPro()` mais abaixo neste
  // mesmo objeto (stub antigo do recurso de download offline, um
  // propósito totalmente diferente). Nomes parecidos de propósito
  // (ambos ligados a "ser PRO"), mas ESTE aqui precisa de um nome
  // próprio, senão a atribuição booleana em onAuthStateChanged
  // sobrescreveria a função e quebraria ehUsuarioPro() em
  // js/script.js assim que alguém logasse.
  contaEhPro: false,
  db: null,
  boostsBrilhantesPendentes: 0,
  entrarComEmail: async () => {
    throw new Error(AVISO_NAO_CONFIGURADO);
  },
  criarContaComEmail: async () => {
    throw new Error(AVISO_NAO_CONFIGURADO);
  },
  enviarEmailProprio: async () => {},
  enviarFeedback: async () => {},
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
  sincronizarRota: async () => {},
  buscarConfigGlobal: async () => ({ anunciosAtivados: false }),
  definirAnunciosGlobalAtivados: async () => {},
  definirAnuncioPorUsuario: async () => {},
  buscarConfigAnuncio: async () => false,
  definirPerfilPublico: async () => {},
  buscarPerfilPublico: async () => null,
  buscarMeuEstadoCompleto: async () => null,
  salvarSnapshotMapa: async () => {},
  contarPessoasComMunicipioVerificado: async () => 0,
  contarPessoasComRegiao: async () => 0,
  contarTotalContas: async () => 0,
  resetarEstadoPublico: async () => {},
  // ---- Rede social (posts com foto) ----
  criarPost: async () => {
    throw new Error(AVISO_NAO_CONFIGURADO);
  },
  buscarFeedGlobal: async () => ({ posts: [], proximoCursor: null }),
  curtirPost: async () => {},
  comentarPost: async () => {},
  listarComentarios: async () => [],
  excluirPost: async () => {},
  buscarFotoPost: async () => null,
  buscarPost: async () => null,
  // ---- Moderação e exclusão de conta ----
  UID_DONO,
  registrarAtividadeSuspeita: async () => {},
  definirStatusDeConta: async () => {},
  excluirConta: async () => {
    throw new Error(AVISO_NAO_CONFIGURADO);
  },
  reautenticarEExcluirConta: async () => {
    throw new Error(AVISO_NAO_CONFIGURADO);
  },
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
  const storage = getStorage(app);
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

  /**
   * Grava um relato de bug, sugestão ou ponto turístico na coleção
   * "feedback" do Firestore (backup/auditoria -- lido pelo Console do
   * Firebase) E manda pra planilha do Google Sheets (ver
   * enviarFeedbackParaPlanilha), que é onde o Paulo realmente
   * acompanha isso no dia a dia. Exige login (mesma regra de
   * qualquer interação de verdade no app), pra amarrar cada relato a
   * uma conta e não virar um jeito fácil de mandar spam -- é assim
   * que já sai com apelido e e-mail prontos, sem precisar perguntar
   * de novo pra pessoa. `extras` carrega campos específicos de cada
   * tipo (ex: `municipio` na sugestão de ponto turístico).
   */
  window.raspadinhaAuth.enviarFeedback = async (tipo, texto, extras = {}) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");

    enviarFeedbackParaPlanilha(tipo, texto, usuario, extras);

    try {
      await addDoc(collection(db, "feedback"), {
        tipo,
        texto,
        ...extras,
        uid: usuario.uid,
        apelido: window.raspadinhaAuth.apelido || "",
        email: usuario.email || "",
        criadoEm: serverTimestamp(),
      });
    } catch (erro) {
      // A planilha (chamada acima) é o destino que o Paulo realmente
      // acompanha no dia a dia -- se só o backup no Firestore falhar
      // (ex: regra desatualizada), o relato já chegou onde importa,
      // então não vale mostrar erro pro usuário por causa disso.
      console.error("Falha ao gravar feedback no Firestore (backup):", erro);
    }
  };

  /**
   * Manda o relato também pra planilha do Google Sheets, via um
   * Google Apps Script Web App implantado na própria conta do Paulo
   * (ver PENDENCIAS.md pro passo a passo de deploy) -- "melhor
   * esforço": roda em paralelo ao Firestore, e se a URL ainda não
   * estiver configurada ou a chamada falhar (rede, script fora do ar
   * etc.), não afeta o "Enviado!" que o usuário já vê (baseado no
   * Firestore, que é a fonte confiável).
   *
   * Usa `mode: "no-cors"` porque um Web App do Apps Script não manda
   * os cabeçalhos de CORS que o fetch exigiria pra LER a resposta --
   * sem isso, o navegador bloqueia a chamada inteira mesmo o Apps
   * Script recebendo certinho do outro lado. Como consequência, não
   * dá pra saber aqui se deu certo (por isso é só "melhor esforço").
   */
  function enviarFeedbackParaPlanilha(tipo, texto, usuario, extras = {}) {
    enviarParaPlanilha({
      tipo,
      apelido: window.raspadinhaAuth.apelido || "",
      email: usuario.email || "",
      texto,
      ...extras,
    });
  }

  /**
   * Mesma técnica de "melhor esforço" de enviarFeedbackParaPlanilha,
   * generalizada: um POST fire-and-forget pro Apps Script Web App
   * (mode "no-cors", sem ler a resposta). Reaproveitada pro registro
   * de atividade suspeita e pro espelho de status de conta na aba
   * "Usuários" (ver tools/apps-script-feedback.gs pra cada `tipo`
   * aceito).
   */
  function enviarParaPlanilha(dados) {
    if (!URL_PLANILHA_FEEDBACK || URL_PLANILHA_FEEDBACK.startsWith("SUBSTITUA")) return;
    fetch(URL_PLANILHA_FEEDBACK, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(dados),
    }).catch((erro) => console.error("Falha ao enviar pra planilha:", erro));
  }

  window.raspadinhaAuth.sair = () => signOut(auth);

  /**
   * Registra uma verificação de GPS "suspeita" (deslocamento
   * implausível entre dois municípios -- ver avaliarDeslocamento em
   * js/script.js): grava no Firestore (fonte de verdade pra contar
   * depois) e manda pra aba "Atividades suspeitas" da planilha
   * (visão geral pro Paulo). NUNCA bloqueia a visita em si -- só
   * sinaliza. Se acumular 3 registros nos últimos 3 dias, suspende a
   * própria conta sozinha (a regra do Firestore permite só esse
   * sentido: "ativo" -> "suspenso") e desloga na hora.
   */
  window.raspadinhaAuth.registrarAtividadeSuspeita = async (detalhes) => {
    const usuario = auth.currentUser;
    if (!usuario) return;

    await addDoc(collection(db, "usuarios", usuario.uid, "atividadeSuspeita"), {
      ...detalhes,
      criadoEm: serverTimestamp(),
    });

    enviarParaPlanilha({
      tipo: "atividade-suspeita",
      apelido: window.raspadinhaAuth.apelido || "",
      email: usuario.email || "",
      municipioAnterior: detalhes.municipioAnteriorId,
      municipioNovo: detalhes.municipioNovoId,
      distanciaKm: detalhes.distanciaKm,
      tempoMin: detalhes.tempoMin,
      velocidadeKmh: detalhes.velocidadeKmh,
    });

    const tresDiasAtras = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const consultaRecente = query(
      collection(db, "usuarios", usuario.uid, "atividadeSuspeita"),
      where("criadoEm", ">=", tresDiasAtras)
    );
    const contagem = await getCountFromServer(consultaRecente);
    if (contagem.data().count < 3) return;

    const snap = await getDoc(doc(db, "usuarios", usuario.uid));
    if (snap.data()?.status && snap.data().status !== "ativo") return; // já suspenso/banido

    await window.raspadinhaAuth.definirStatusDeConta(usuario.uid, "suspenso");
    document.dispatchEvent(
      new CustomEvent("conta-bloqueada", { detail: { motivo: "suspenso", automatico: true } })
    );
    await signOut(auth);
  };

  /**
   * Muda o status (ativo/suspenso/banido) de uma conta -- a regra do
   * Firestore só deixa isso valer de verdade quando quem está
   * logado é o UID_DONO (qualquer conta) OU a própria conta indo de
   * "ativo" pra "suspenso" (usado só pela auto-suspensão acima).
   * Também atualiza o espelho na aba "Usuários" da planilha.
   */
  window.raspadinhaAuth.definirStatusDeConta = async (uidAlvo, novoStatus) => {
    await updateDoc(doc(db, "usuarios", uidAlvo), { status: novoStatus });

    const snap = await getDoc(doc(db, "usuarios", uidAlvo));
    enviarParaPlanilha({
      tipo: "usuario-status",
      apelido: snap.data()?.apelido || "",
      email: snap.data()?.email || "",
      status: novoStatus,
    });
  };

  /**
   * Apaga TODOS os dados da conta no Firestore/Storage (progresso,
   * amigos, posts, fotos, comentários) -- tudo isso ANTES de tentar
   * apagar a conta de autenticação em si, porque essas operações não
   * exigem sessão "recente" (diferente de deleteUser, que exige).
   * Chamada só depois das 3 confirmações crescentes (ver
   * iniciarFluxoExclusaoConta em js/script.js).
   */
  async function apagarDadosDaConta(uid) {
    // Remove a entrada reversa amigos/{uid} no doc de cada amigo,
    // usando a PRÓPRIA lista antes de apagá-la (a regra permite
    // qualquer um dos dois lados apagar essa entrada).
    const amigosSnap = await getDocs(collection(db, "usuarios", uid, "amigos"));
    await Promise.all(
      amigosSnap.docs.map((d) => deleteDoc(doc(db, "usuarios", d.id, "amigos", uid)).catch(() => {}))
    );

    // Subcoleções da própria conta. Pedidos de amizade ENVIADOS pra
    // outras contas ficam órfãos (mesma simplificação já aceita em
    // excluirPost, que não cascateia a exclusão dos comentários).
    const subcolecoes = ["convites", "pedidosAmizade", "amigos", "checkins", "atividadeSuspeita"];
    for (const nome of subcolecoes) {
      const snap = await getDocs(collection(db, "usuarios", uid, nome));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    }

    // Posts próprios + a foto de cada um (Drive, ver fotoDriveId, ou
    // Storage nos poucos posts antigos que ainda tiverem fotoStoragePath).
    const postsSnap = await getDocs(query(collection(db, "posts"), where("autorUid", "==", uid)));
    await Promise.all(
      postsSnap.docs.map(async (d) => {
        const post = d.data();
        await deleteDoc(d.ref);
        if (post.fotoDriveId) enviarParaPlanilha({ tipo: "excluir-foto-post", fotoId: post.fotoDriveId });
        if (post.fotoStoragePath) {
          await deleteObject(refStorage(storage, post.fotoStoragePath)).catch(() => {});
        }
      })
    );

    // Comentários próprios em posts de OUTRAS pessoas (collectionGroup
    // -- a regra de "comentarios" já libera read pra qualquer
    // autenticado e delete pro próprio autor do comentário).
    const comentariosSnap = await getDocs(
      query(collectionGroup(db, "comentarios"), where("autorUid", "==", uid))
    );
    await Promise.all(comentariosSnap.docs.map((d) => deleteDoc(d.ref)));

    // Por fim, o documento principal da conta.
    await deleteDoc(doc(db, "usuarios", uid));
  }

  window.raspadinhaAuth.excluirConta = async () => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");

    await apagarDadosDaConta(usuario.uid);

    try {
      await deleteUser(usuario);
    } catch (erro) {
      if (erro.code === "auth/requires-recent-login") {
        // Os DADOS já foram apagados acima -- só falta a conta de
        // autenticação em si, que exige confirmar a senha de novo
        // (ver reautenticarEExcluirConta, chamada por
        // confirmarExclusaoDeVez em js/script.js quando cai aqui).
        throw Object.assign(new Error("Por segurança, digite sua senha atual pra confirmar."), {
          code: "auth/requires-recent-login",
        });
      }
      throw erro;
    }
  };

  /**
   * Só usada quando excluirConta esbarra em "auth/requires-recent-
   * login" -- os dados já foram apagados, falta só reautenticar e
   * terminar de excluir a conta de autenticação.
   */
  window.raspadinhaAuth.reautenticarEExcluirConta = async (senha) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    const credencial = EmailAuthProvider.credential(usuario.email, senha);
    await reauthenticateWithCredential(usuario, credencial);
    await deleteUser(usuario);
  };

  window.raspadinhaAuth.salvarApelido = async (apelido) => {
    const usuario = auth.currentUser;
    if (!usuario) return;

    if (pareceEmail(apelido)) {
      throw Object.assign(new Error("O apelido não pode ter formato de e-mail."), {
        code: "apelido/formato-invalido",
      });
    }

    if (comecaComPrefixoReservado(apelido)) {
      throw Object.assign(
        new Error('O apelido não pode começar com "município" (esse prefixo é reservado).'),
        { code: "apelido/prefixo-invalido" }
      );
    }

    const disponivel = await apelidoEstaDisponivel(apelido, usuario.uid);
    if (!disponivel) {
      throw Object.assign(new Error("Esse nome de usuário já está em uso."), {
        code: "apelido/em-uso",
      });
    }

    const eraPrimeiroApelido = !window.raspadinhaAuth.apelido;

    await setDoc(
      doc(db, "usuarios", usuario.uid),
      { apelido, email: usuario.email, atualizadoEm: serverTimestamp() },
      { merge: true }
    );
    window.raspadinhaAuth.apelido = apelido;

    // Espelha na aba "Usuários" da planilha só na primeira vez (conta
    // recém-criada escolhendo o apelido) -- editar o apelido depois,
    // em Configurações, não precisa gerar tráfego de novo à toa.
    if (eraPrimeiroApelido) {
      enviarParaPlanilha({ tipo: "usuario-status", apelido, email: usuario.email || "", status: "ativo" });
    }

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

  window.raspadinhaAuth.sincronizarRota = (id, dados) => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.resolve();
    return setDoc(
      doc(db, "usuarios", usuario.uid),
      { estadoRotas: { [id]: dados } },
      { merge: true }
    ).catch((erro) => console.error("Falha ao sincronizar rota (perfil):", erro));
  };

  /**
   * Configuração global do app (padrão de anúncio pra quem NÃO tem um
   * override individual -- ver anunciosAtivados em usuarios/{uid}
   * abaixo) -- fica numa coleção separada de "usuarios" porque
   * precisa ser lida por QUALQUER pessoa (logada ou não, ver
   * buscarConfigAnuncio/atualizarVisibilidadeAnuncio em
   * js/script.js), mas só escrita pela conta dona do projeto.
   */
  window.raspadinhaAuth.buscarConfigGlobal = async () => {
    const snap = await getDoc(doc(db, "configuracoes", "global"));
    return snap.exists() ? snap.data() : { anunciosAtivados: false };
  };

  window.raspadinhaAuth.definirAnunciosGlobalAtivados = async (ativado) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    await setDoc(doc(db, "configuracoes", "global"), { anunciosAtivados: !!ativado }, { merge: true });
  };

  /**
   * Liga/desliga anúncio pra UMA conta específica (override
   * individual, campo `anunciosAtivados` no doc de usuarios/{uid} --
   * NÃO é o mesmo campo/coleção do padrão global acima). Usado tanto
   * pra "anúncio pra mim" (uidAlvo = a própria conta dona) quanto pra
   * qualquer outra conta escolhida por apelido no painel de Admin. A
   * regra do Firestore só deixa esse campo ser escrito pelo
   * UID_DONO, em QUALQUER conta.
   */
  window.raspadinhaAuth.definirAnuncioPorUsuario = async (uidAlvo, ativado) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    await updateDoc(doc(db, "usuarios", uidAlvo), { anunciosAtivados: !!ativado });
  };

  /**
   * Decide se o anúncio deve aparecer PRA ESSA sessão: se a conta
   * logada tiver um override individual (`anunciosAtivados` no
   * próprio doc), esse valor manda; senão, cai no padrão global.
   * Visitante sem login (sem doc de usuário) sempre usa o padrão
   * global.
   */
  window.raspadinhaAuth.buscarConfigAnuncio = async () => {
    const usuario = auth.currentUser;
    if (usuario) {
      const snap = await getDoc(doc(db, "usuarios", usuario.uid));
      const override = snap.data()?.anunciosAtivados;
      if (override !== undefined) return !!override;
    }
    const configGlobal = await window.raspadinhaAuth.buscarConfigGlobal();
    return !!configGlobal?.anunciosAtivados;
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
   * Busca o estado (município/região) do PRÓPRIO usuário logado, pra
   * restaurar no login (ver carregarEstadoDoUsuario em js/script.js)
   * -- é a fonte de verdade por conta (isolada por uid nas regras do
   * Firestore), usada pra corrigir sozinho qualquer mistura que ainda
   * exista no localStorage do navegador local.
   */
  window.raspadinhaAuth.buscarMeuEstadoCompleto = async () => {
    const usuario = auth.currentUser;
    if (!usuario) return null;
    const snap = await getDoc(doc(db, "usuarios", usuario.uid));
    if (!snap.exists()) return null;
    const dados = snap.data();
    return {
      estadoMunicipios: dados.estadoMunicipios || {},
      estadoRegioes: dados.estadoRegioes || {},
      estadoRotas: dados.estadoRotas || {},
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

  /* ---------- Rede social (posts com foto) ----------
     Primeira vez que o app lida com upload de arquivo (até aqui só
     havia imagens estáticas do repo + o snapshot do mapa, gerado
     localmente e salvo como data URL). Foto vai pro Firebase Storage
     (bucket já existe, nunca tinha sido usado); tudo mais (legenda,
     município marcado, pessoas marcadas, curtidas, comentários) fica
     no Firestore, coleção "posts" (ver README.md pras regras). */

  /**
   * Lê um Blob como base64 puro (sem o prefixo "data:...;base64,") --
   * usado pra mandar a foto do post pro Apps Script via JSON (ver
   * subirFotoPostParaDrive), já que fetch não sobe um Blob binário
   * direto num corpo de texto.
   */
  function blobParaBase64(blob) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result).split(",")[1] || "");
      leitor.onerror = () => reject(new Error("Não foi possível ler a foto."));
      leitor.readAsDataURL(blob);
    });
  }

  /**
   * SOLUÇÃO PROVISÓRIA (ver README.md): sobe a foto do post pro Google
   * Drive via o mesmo Apps Script Web App do feedback, em vez do
   * Firebase Storage -- o projeto ainda está no plano Spark (grátis),
   * que não permite mais ativar o Storage sem migrar pro Blaze
   * (pago por uso). Diferença importante: a foto fica com o link
   * "qualquer pessoa com o link pode ver" (o Drive não tem como
   * checar login do Desbrava), diferente do Storage, que só entregava
   * pra quem estivesse logado (ver buscarFotoPost logo abaixo, que
   * ainda existe pra eventuais posts antigos feitos direto no
   * Storage). Migrar de volta é só trocar esta função pelo
   * uploadBytes de antes.
   */
  async function subirFotoPostParaDrive(arquivoFoto, nomeArquivo) {
    if (!URL_PLANILHA_FEEDBACK || URL_PLANILHA_FEEDBACK.startsWith("SUBSTITUA")) {
      throw new Error("Upload de foto ainda não configurado (Apps Script).");
    }
    const base64 = await blobParaBase64(arquivoFoto);
    const resposta = await fetch(URL_PLANILHA_FEEDBACK, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        tipo: "upload-foto-post",
        base64,
        mimeType: arquivoFoto.type || "image/jpeg",
        nomeArquivo,
      }),
    });
    const dados = await resposta.json();
    if (!dados.ok || !dados.fotoUrl) throw new Error("Não foi possível subir a foto.");
    return { fotoUrl: dados.fotoUrl, fotoId: dados.fotoId };
  }

  /**
   * Cria um post: sobe a foto (ver subirFotoPostParaDrive) e grava os
   * metadados no Firestore -- um único doc novo, usando o id gerado
   * ANTES de gravar (doc(collection(...)).id) pra poder nomear o
   * arquivo da foto com o mesmo id do post.
   */
  window.raspadinhaAuth.criarPost = async ({ arquivoFoto, texto, municipioId, pessoasMarcadas }) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    if (!arquivoFoto) throw new Error("Escolha uma foto pra postar.");

    const novoDocRef = doc(collection(db, "posts"));
    const postId = novoDocRef.id;

    const { fotoUrl, fotoId } = await comTimeout(
      subirFotoPostParaDrive(arquivoFoto, `${postId}.jpg`),
      30000,
      "A conexão está lenta demais pra subir a foto. Verifique sua internet e tente de novo."
    );

    await comTimeout(
      setDoc(novoDocRef, {
        autorUid: usuario.uid,
        autorApelido: window.raspadinhaAuth.apelido || "?",
        texto: (texto || "").slice(0, 500),
        fotoUrl,
        fotoDriveId: fotoId,
        municipioId: municipioId || null,
        // Guarda os dois: uids "crus" (array-contains, pra um dia dar
        // pra consultar "posts que me marcaram") e a lista com apelido
        // já junto (pra renderizar o card sem precisar buscar cada
        // perfil separado).
        pessoasMarcadasUids: (pessoasMarcadas || []).map((p) => p.uid),
        pessoasMarcadas: pessoasMarcadas || [],
        curtidoPor: [],
        numComentarios: 0,
        criadoEm: serverTimestamp(),
      }),
      15000,
      "A conexão está lenta demais pra publicar. Verifique sua internet e tente de novo."
    );

    return postId;
  };

  /**
   * Busca a foto de um post via SDK (respeitando a regra de
   * segurança do Storage: só autenticado) e devolve um blob URL local
   * -- em vez de getDownloadURL(), que gera um link com token que
   * funciona pra QUALQUER UM que tenha a URL, autenticado ou não (ver
   * README.md pra explicação completa). Assim a foto só carrega de
   * verdade pra quem estiver logado no Desbrava.
   */
  window.raspadinhaAuth.buscarFotoPost = async (caminhoFoto) => {
    if (!auth.currentUser) return null;
    try {
      const bytes = await getBytes(refStorage(storage, caminhoFoto));
      const blob = new Blob([bytes], { type: "image/jpeg" });
      return URL.createObjectURL(blob);
    } catch (erro) {
      console.error("Falha ao carregar foto do post:", erro);
      return null;
    }
  };

  /**
   * Um post específico (usado pro deep-link ?post=, ver
   * js/script.js), incluindo o filtro por município e um cursor de
   * paginação simples (id do último post da página anterior).
   */
  window.raspadinhaAuth.buscarPost = async (postId) => {
    const snap = await getDoc(doc(db, "posts", postId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  };

  /**
   * Feed global, paginado (mais recentes primeiro). Se `municipioId`
   * for passado, filtra só os posts marcados naquele município (usado
   * pelo botão @ no popup do município) -- essa combinação (where +
   * orderBy em campos diferentes) exige um índice composto, que o
   * Firestore mesmo oferece criar (link direto no erro do console) na
   * primeira vez que essa consulta rodar de verdade.
   */
  window.raspadinhaAuth.buscarFeedGlobal = async ({ municipioId, cursor, limiteN = 15 } = {}) => {
    const clausulas = [orderBy("criadoEm", "desc"), limit(limiteN)];
    if (municipioId) clausulas.unshift(where("municipioId", "==", municipioId));
    if (cursor) clausulas.push(startAfter(cursor));

    const consulta = query(collection(db, "posts"), ...clausulas);
    const resultado = await getDocs(consulta);
    const posts = resultado.docs.map((d) => ({ id: d.id, ...d.data() }));
    return {
      posts,
      proximoCursor: resultado.docs.length === limiteN ? resultado.docs[resultado.docs.length - 1] : null,
    };
  };

  /**
   * Curtir/descurtir: só adiciona ou remove o PRÓPRIO uid do array
   * `curtidoPor` -- a regra do Firestore só deixa mexer nesse campo
   * (ou em numComentarios) se não for o autor do post.
   */
  window.raspadinhaAuth.curtirPost = (postId, curtir) => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.reject(new Error("Faça login primeiro."));
    return updateDoc(doc(db, "posts", postId), {
      curtidoPor: curtir ? arrayUnion(usuario.uid) : arrayRemove(usuario.uid),
    });
  };

  /**
   * Comenta num post: grava na subcoleção e incrementa o contador
   * denormalizado no post (duas escritas -- não dá pra fazer num
   * batch atômico simples porque o id do comentário só existe depois
   * de criado, mas como é só um contador de exibição, um comentário
   * "perdido" no meio do caminho (falha de rede entre as duas
   * escritas) não é grave).
   */
  window.raspadinhaAuth.comentarPost = async (postId, texto) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    const textoLimpo = (texto || "").trim().slice(0, 500);
    if (!textoLimpo) return;

    await addDoc(collection(db, "posts", postId, "comentarios"), {
      autorUid: usuario.uid,
      autorApelido: window.raspadinhaAuth.apelido || "?",
      texto: textoLimpo,
      criadoEm: serverTimestamp(),
    });
    await updateDoc(doc(db, "posts", postId), { numComentarios: increment(1) });
  };

  window.raspadinhaAuth.listarComentarios = async (postId) => {
    const consulta = query(collection(db, "posts", postId, "comentarios"), orderBy("criadoEm", "asc"));
    const resultado = await getDocs(consulta);
    return resultado.docs.map((d) => ({ id: d.id, ...d.data() }));
  };

  /**
   * Exclui um post (só o autor, ver regra) -- apaga o doc do
   * Firestore e a foto no Storage. Não apaga a subcoleção de
   * comentários (Firestore não faz isso em cascata sozinho e uma
   * Cloud Function pra isso é infraestrutura demais pra esse caso);
   * fica órfã, mas inacessível (ninguém acha o id de um post que não
   * existe mais pra listar os comentários dele).
   */
  window.raspadinhaAuth.excluirPost = async (postId, fotoDriveId) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    await deleteDoc(doc(db, "posts", postId));
    // Apagar do Drive é "melhor esforço" (fire-and-forget, mesma
    // técnica de enviarParaPlanilha) -- não trava a exclusão do post
    // se isso falhar.
    if (fotoDriveId) enviarParaPlanilha({ tipo: "excluir-foto-post", fotoId: fotoDriveId });
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
      status: encontrado.data().status || "ativo",
      // undefined = sem override individual, usa o padrão global
      // (ver buscarConfigAnuncio/definirAnuncioPorUsuario acima).
      anunciosAtivados: encontrado.data().anunciosAtivados,
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
      window.raspadinhaAuth.contaEhPro = false;
      document.dispatchEvent(new CustomEvent("auth-mudou", { detail: null }));
      return;
    }

    try {
      const snap = await getDoc(doc(db, "usuarios", usuario.uid));

      // Conta suspensa (auto-detecção de GPS falso, ou revisão manual)
      // ou banida (revisão manual, ver painel de moderação em
      // Configurações): barra o uso na hora -- a conta continua
      // existindo no Firebase, mas o app se recusa a fazer qualquer
      // coisa com ela (ver "conta-bloqueada" em js/script.js).
      const status = snap.data()?.status;
      if (status === "suspenso" || status === "banido") {
        await signOut(auth);
        document.dispatchEvent(new CustomEvent("conta-bloqueada", { detail: { motivo: status } }));
        return;
      }

      const apelido = snap.exists() ? snap.data().apelido : null;
      window.raspadinhaAuth.apelido = apelido || null;
      window.raspadinhaAuth.contaEhPro = !!snap.data()?.ehPro;

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
