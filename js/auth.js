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
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
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
  runTransaction,
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
  // Foto de perfil escolhida pela pessoa: null = usa as iniciais;
  // { tipo: "selo", seloId, dourado } = um selo que ela já conquistou;
  // { tipo: "foto", url } = uma foto enviada (Drive). Ver
  // definirFotoPerfil/subirFotoPerfil abaixo e aplicarAvatar em
  // js/script.js.
  fotoPerfil: null,
  definirFotoPerfil: async () => {},
  subirFotoPerfil: async () => {
    throw new Error(AVISO_NAO_CONFIGURADO);
  },
  // Assinante PRO: preenchido no login a partir de
  // `usuarios/{uid}.ehPro` (ver onAuthStateChanged). Vale tanto pro
  // distintivo no Ranking quanto pro gate do download offline
  // (ehUsuarioPro em js/script.js). Quem liga esse campo é o webhook
  // do Asaas (tools/apps-script-asaas.gs) ou a ativação manual pelo
  // codigoAtivacaoPro.
  contaEhPro: false,
  proAte: null,
  db: null,
  boostsBrilhantesPendentes: 0,
  // Sem Firebase configurado não há o que observar. Devolve um
  // cancelador vazio em vez de lançar: quem chama sempre invoca o
  // retorno ao fechar o checkout.
  observarAssinatura: () => () => {},
  entrarComEmail: async () => {
    throw new Error(AVISO_NAO_CONFIGURADO);
  },
  criarContaComEmail: async () => {
    throw new Error(AVISO_NAO_CONFIGURADO);
  },
  entrarComCredencialGoogle: async () => {
    throw new Error(AVISO_NAO_CONFIGURADO);
  },
  entrarComGoogleWeb: async () => {
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
  consumirBoostBrilhante: () => false,
  sincronizarMunicipio: async () => {},
  sincronizarRegiao: async () => {},
  sincronizarConquista: async () => {},
  sincronizarRota: async () => {},
  buscarConfigGlobal: async () => ({ anunciosAtivados: false }),
  definirAnunciosGlobalAtivados: async () => {},
  // Liberação geral do Motoclube (ver definirMotoclubeLiberado). Sem
  // Firebase configurado fica desligada -- na dúvida, o app se comporta
  // como se o produto fosse pago, que é o estado normal.
  /* Vale desde o PRIMEIRO instante, lendo a última resposta guardada no
     aparelho -- não espera o Firestore.

     Sem isso existia uma janela entre abrir o app e a nuvem responder
     em que a liberação valia `false`. Tocar no Motoclube nesse intervalo
     levava ao paywall, e a impressão era de que a liberação tinha se
     desligado sozinha. Era o que obrigava a desligar e religar o botão
     no admin toda hora.

     O valor é só um palpite inicial: o observador corrige em seguida,
     nos dois sentidos. */
  motoclubeLiberadoParaTodos: (() => {
    try {
      return localStorage.getItem("desbrava_motoclube_liberado") === "1";
    } catch {
      return false;
    }
  })(),
  // Grupo do Motoclube da conta logada (ver entrarNoGrupoMotoclube).
  grupoMotoclube: null,
  grupoEntrouEm: null,
  entrarNoGrupoMotoclube: async () => {},
  sairDoGrupoMotoclube: async () => {},
  contarMembrosDoGrupo: async () => 0,
  // Número de membro (ver garantirNumeroMotoclube). Vitalício.
  numeroMotoclube: null,
  garantirNumeroMotoclube: async () => null,
  observarConfigGlobal: () => () => {},
  definirMotoclubeLiberado: async () => {},
  definirChavePixColaboracao: async () => {},
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
  // ---- Sugestões da Comunidade ----
  criarSugestao: async () => {
    throw new Error(AVISO_NAO_CONFIGURADO);
  },
  buscarSugestoes: async () => ({ sugestoes: [], proximoCursor: null }),
  curtirSugestao: async () => {},
  comentarSugestao: async () => {},
  listarComentariosSugestao: async () => [],
  excluirSugestao: async () => {},
  // ---- Comentários nos pontos turísticos ----
  comentarPonto: async () => {},
  listarComentariosPonto: async () => [],
  excluirComentarioPonto: async () => {},
  curtirComentarioPonto: async () => {},
  responderComentarioPonto: async () => {},
  listarRespostasPonto: async () => [],
  excluirRespostaPonto: async () => {},
  // ---- Notificações ----
  listarNotificacoes: async () => [],
  contarNotificacoesNaoLidas: async () => 0,
  marcarNotificacoesLidas: async () => {},
  excluirNotificacao: async () => {},
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
};

if (CONFIGURADO) {
  const app = initializeApp(firebaseConfig);
  getAnalytics(app); // conta acessos automaticamente (ver Firebase Console > Analytics)
  const auth = getAuth(app);
  // Cache local persistente (IndexedDB): grava/lê o progresso mesmo
  // sem sinal (comum no Modo Viagem, em estrada) e sincroniza sozinho
  // assim que a conexão volta. Cai pro getFirestore normal (sem cache
  // offline) se o ambiente não suportar IndexedDB, ex.: aba anônima.
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache() });
  } catch (erro) {
    console.warn("Cache offline do Firestore indisponível, usando modo padrão:", erro);
    db = getFirestore(app);
  }
  const storage = getStorage(app);
  window.raspadinhaAuth.db = db;

  window.raspadinhaAuth.entrarComEmail = (email, senha) =>
    signInWithEmailAndPassword(auth, email, senha);

  /**
   * Envia o e-mail de redefinição de senha. IMPORTANTE: isso é um
   * recurso NATIVO do Firebase Auth -- o e-mail sai dos servidores do
   * Google (remetente noreply@<projeto>.firebaseapp.com), NÃO depende da
   * extensão Trigger Email nem do plano Blaze (diferente do e-mail de
   * boas-vindas). Por isso funciona mesmo no plano grátis (Spark).
   * Só existe senha pra redefinir se a conta foi criada com e-mail/senha;
   * numa conta que só tem Google, não há o que redefinir.
   */
  window.raspadinhaAuth.redefinirSenha = (email) =>
    sendPasswordResetEmail(auth, email);

  /**
   * Login com Google no app nativo: o plugin
   * (@capacitor-firebase/authentication, skipNativeAuth) abre o seletor
   * de conta do Google e devolve um idToken; aqui a gente troca esse
   * token por uma sessão do Firebase usando o MESMO SDK web que o resto
   * do app usa (Firestore etc.), pra não ter duas fontes de verdade.
   * Ver entrarComGoogle em js/script.js (é lá que o plugin é chamado).
   */
  window.raspadinhaAuth.entrarComCredencialGoogle = async (idToken) => {
    if (!idToken) throw new Error("Não recebi o token do Google.");
    const credencial = GoogleAuthProvider.credential(idToken);
    const resultado = await signInWithCredential(auth, credencial);
    await creditarConviteSeExistir(resultado.user.uid);
    return resultado;
  };

  window.raspadinhaAuth.entrarComGoogleWeb = async () => {
    const provider = new GoogleAuthProvider();
    const resultado = await signInWithPopup(auth, provider);
    await creditarConviteSeExistir(resultado.user.uid);
    return resultado;
  };

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
   * Liga/desliga o Motoclube para TODO MUNDO, de graça.
   *
   * Existe porque o pagamento pode estar fora do ar (foi o caso na
   * estreia: o webhook nunca chegava e quem pagava não recebia nada).
   * Nessa situação, cobrar por um recurso que não destranca é pior que
   * não cobrar -- então o dono libera geral com um toque, e volta a
   * cobrar quando o Pix estiver de pé.
   *
   * Mora no mesmo `configuracoes/global` dos anúncios: leitura pública,
   * escrita só pela conta dona. Não precisa de regra nova no Firestore.
   */
  /**
   * Observa `configuracoes/global` ao vivo.
   *
   * Substitui a leitura única que existia antes, e conserta um bug que
   * era difícil de enxergar: com persistentLocalCache, um getDoc pode
   * ser respondido pelo CACHE LOCAL, com uma versão do documento
   * anterior ao campo `motoclubeLiberadoParaTodos` existir. O campo
   * vinha `undefined`, o app entendia "desligado" e o Motoclube
   * fechava sozinho -- enquanto o botão do admin, lido do servidor,
   * continuava marcado. Exatamente o "desativa sozinho mas continua
   * mostrando ativado".
   *
   * Com onSnapshot o cache até responde primeiro, mas a versão do
   * servidor chega logo atrás e corrige. De quebra, ligar ou desligar
   * passa a valer nos outros aparelhos NA HORA, sem esperar o app ser
   * reaberto.
   */
  window.raspadinhaAuth.observarConfigGlobal = (aoMudar) =>
    onSnapshot(
      doc(db, "configuracoes", "global"),
      (snap) => {
        const dados = snap.exists() ? snap.data() : {};
        const liberado = !!dados.motoclubeLiberadoParaTodos;
        window.raspadinhaAuth.motoclubeLiberadoParaTodos = liberado;
        // Guarda pro próximo início do app não ter janela de "bloqueado"
        // enquanto a nuvem não responde.
        try {
          localStorage.setItem("desbrava_motoclube_liberado", liberado ? "1" : "0");
        } catch {
          /* modo privado, cota cheia: seguir sem cache é aceitável */
        }
        aoMudar?.(dados);
      },
      (erro) => console.error("Falha ao observar a configuração global:", erro)
    );

  window.raspadinhaAuth.definirMotoclubeLiberado = async (liberado) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    await setDoc(
      doc(db, "configuracoes", "global"),
      { motoclubeLiberadoParaTodos: !!liberado },
      { merge: true }
    );
    window.raspadinhaAuth.motoclubeLiberadoParaTodos = !!liberado;
  };

  /**
   * Salva a chave PIX de colaboração (mostrada no popup "Colaborar")
   * em configuracoes/global.chavePix -- mesmo doc/regra dos anúncios:
   * leitura pública, escrita só pela conta dona.
   */
  window.raspadinhaAuth.definirChavePixColaboracao = async (chave) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    await setDoc(
      doc(db, "configuracoes", "global"),
      { chavePix: String(chave || "").trim() },
      { merge: true }
    );
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

  /* ---- Grupos do Motoclube (um por município) ----
   *
   * A adesão mora no PRÓPRIO documento do usuário, e não numa coleção
   * de grupos: a regra do Firestore que deixa a pessoa escrever no
   * documento dela já cobre isso, então não precisa de regra nova. E
   * como esse documento já é legível por qualquer autenticado, o
   * crachá aparece na Comunidade sem nenhuma consulta extra.
   *
   * Dois campos, e o segundo é o que faz a regra dos 30 dias
   * funcionar:
   *   grupoMotoclube  -> município do grupo atual, ou null se saiu
   *   grupoEntrouEm   -> quando entrou pela ÚLTIMA vez
   *
   * `grupoEntrouEm` NÃO é limpo ao sair, de propósito: a carência
   * conta desde a entrada anterior. Se limpasse, bastaria sair e
   * entrar de novo pra trocar de grupo na hora, e a regra viraria
   * enfeite.
   */
  window.raspadinhaAuth.entrarNoGrupoMotoclube = async (municipioId) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");

    await setDoc(
      doc(db, "usuarios", usuario.uid),
      { grupoMotoclube: String(municipioId), grupoEntrouEm: new Date().toISOString() },
      { merge: true }
    );

    window.raspadinhaAuth.grupoMotoclube = String(municipioId);
    window.raspadinhaAuth.grupoEntrouEm = new Date().toISOString();
  };

  /* ---- Número de membro do Motoclube ----
   *
   * Sequencial e VITALÍCIO: quem recebe o #12 é o décimo segundo a
   * entrar, e continua sendo mesmo se parar de pagar. O número some do
   * perfil enquanto a assinatura não está ativa, mas nunca é devolvido
   * pra fila nem reaproveitado -- ele é identidade, não licença.
   *
   * O contador vive em `contadores/motoclube.ultimo` e é incrementado
   * dentro de uma TRANSAÇÃO junto com a gravação no usuário. Sem
   * transação, duas pessoas entrando no mesmo segundo leriam o mesmo
   * valor e sairiam com o mesmo número -- e número de membro repetido
   * é pior que não ter número.
   */
  window.raspadinhaAuth.garantirNumeroMotoclube = async () => {
    const usuario = auth.currentUser;
    if (!usuario) return null;
    // Já tem: nunca renumera. É o que torna o número vitalício.
    if (window.raspadinhaAuth.numeroMotoclube) return window.raspadinhaAuth.numeroMotoclube;

    const refUsuario = doc(db, "usuarios", usuario.uid);
    const refContador = doc(db, "contadores", "motoclube");

    const numero = await runTransaction(db, async (tx) => {
      const snapUsuario = await tx.get(refUsuario);
      // Reconfere DENTRO da transação: entre a checagem acima e aqui a
      // pessoa pode ter recebido número em outro aparelho.
      const jaTem = snapUsuario.data()?.numeroMotoclube;
      if (jaTem) return jaTem;

      const snapContador = await tx.get(refContador);
      const proximo = (snapContador.data()?.ultimo || 0) + 1;

      tx.set(refContador, { ultimo: proximo }, { merge: true });
      tx.set(refUsuario, { numeroMotoclube: proximo }, { merge: true });
      return proximo;
    });

    window.raspadinhaAuth.numeroMotoclube = numero;
    return numero;
  };

  /**
   * Quantas pessoas estão num grupo.
   *
   * Usa contagem AGREGADA (getCountFromServer): o Firestore devolve só
   * o número, sem baixar documento nenhum. Contar buscando os docs
   * ficaria caro do jeito errado -- o custo cresceria com o tamanho do
   * grupo justamente quando ele fica popular.
   */
  window.raspadinhaAuth.contarMembrosDoGrupo = async (municipioId) => {
    const consulta = query(
      collection(db, "usuarios"),
      where("grupoMotoclube", "==", String(municipioId))
    );
    const snap = await getCountFromServer(consulta);
    return snap.data().count;
  };

  /** Sair é sempre permitido. A carência dos 30 dias segue correndo. */
  window.raspadinhaAuth.sairDoGrupoMotoclube = async () => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");

    await setDoc(doc(db, "usuarios", usuario.uid), { grupoMotoclube: null }, { merge: true });
    window.raspadinhaAuth.grupoMotoclube = null;
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
      fotoPerfil: dados.fotoPerfil || null,
      // Grupo do Motoclube: aparece como crachá no perfil.
      grupoMotoclube: dados.grupoMotoclube || null,
      numeroMotoclube: dados.numeroMotoclube || null,
      // Necessário pra decidir se o número aparece: ele só é exibido
      // enquanto a assinatura está ativa (ver montarNumeroMotoclube).
      ehPro: dados.ehPro === true,
      proAte: dados.proAte || null,
    };
  };

  /**
   * Salva a foto de perfil escolhida (objeto {tipo,...} ou null pra
   * voltar às iniciais) no doc do próprio usuário e atualiza o valor
   * em memória, pra a UI refletir na hora (ver aplicarAvatar /
   * salvarFotoPerfil em js/script.js).
   */
  window.raspadinhaAuth.definirFotoPerfil = async (fotoPerfil) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    const valor = fotoPerfil || null;
    await setDoc(doc(db, "usuarios", usuario.uid), { fotoPerfil: valor }, { merge: true });
    window.raspadinhaAuth.fotoPerfil = valor;
  };

  /**
   * Sobe uma foto de perfil pro Drive (mesmo caminho das fotos de
   * post -- ver subirFotoPostParaDrive) e devolve a URL pública. Quem
   * chama depois passa { tipo: "foto", url } pra definirFotoPerfil.
   */
  window.raspadinhaAuth.subirFotoPerfil = async (arquivoFoto) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    const { fotoUrl } = await comTimeout(
      subirFotoPostParaDrive(arquivoFoto, `perfil-${usuario.uid}-${Date.now()}.jpg`),
      30000,
      "A conexão está lenta demais pra subir a foto. Verifique sua internet e tente de novo."
    );
    return fotoUrl;
  };

  /**
   * Observa a assinatura do Motoclube em tempo real.
   *
   * Existe porque `contaEhPro` só era lido UMA vez, no login: quem
   * pagava o Pix com o app aberto continuava vendo o paywall até
   * fechar e abrir de novo -- e, sem aviso nenhum na tela, parecia que
   * o pagamento tinha se perdido.
   *
   * Quem escreve `ehPro`/`proAte` é o webhook do Asaas
   * (tools/apps-script-asaas.gs), do lado de fora do app. Este
   * listener é justamente a ponte entre aquela escrita e a tela.
   *
   * Devolve uma função pra cancelar -- chame-a ao fechar o checkout,
   * senão o listener fica de pé consumindo cota à toa.
   */
  window.raspadinhaAuth.observarAssinatura = (aoMudar) => {
    const usuario = auth.currentUser;
    if (!usuario) return () => {};

    return onSnapshot(
      doc(db, "usuarios", usuario.uid),
      (snap) => {
        const dados = snap.data() || {};
        // Mantém o objeto global em dia: é dele que souMembroMotoclube()
        // lê, então atualizar aqui já destranca os recursos pagos.
        window.raspadinhaAuth.contaEhPro = !!dados.ehPro;
        window.raspadinhaAuth.proAte = dados.proAte || null;
        aoMudar?.({ ehPro: !!dados.ehPro, proAte: dados.proAte || null });
      },
      (erro) => console.error("Falha ao observar a assinatura:", erro)
    );
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
  window.raspadinhaAuth.criarPost = async ({ arquivoFoto, texto, municipioId, pontoId, pessoasMarcadas }) => {
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
        // Grupo do autor GRAVADO NO POST, e não consultado na hora de
        // exibir: o feed traz 20 posts por página, e buscar o documento
        // de cada autor seriam 20 leituras a cada rolagem. O preço é o
        // crachá ficar congelado no grupo da época -- o que até combina,
        // já que o post é daquele momento.
        autorGrupo: window.raspadinhaAuth.grupoMotoclube || null,
        texto: (texto || "").slice(0, 500),
        fotoUrl,
        fotoDriveId: fotoId,
        municipioId: municipioId || null,
        // Id ESTAVEL do ponto turistico (ex. 3302106-praca-da-matematica),
        // nunca o indice do array. Opcional: a maioria das fotos e da
        // cidade, nao de um ponto especifico. E o que permite o botao
        // "Posts" no painel do ponto achar o que foi marcado la.
        pontoId: pontoId || null,
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
   * Rotas personalizadas: criadas pelo próprio usuário (nome +
   * descrição opcional + lista de municípios), SEM selo -- diferente
   * das rotas oficiais de data/rotas.json. Coleção própria no
   * Firestore (`rotasPersonalizadas`), regra exige donoUid == uid pra
   * criar/editar/apagar; qualquer autenticado pode ler (link
   * compartilhado ?rotaPersonalizada=<id> funciona pra quem não é o
   * dono também).
   */
  window.raspadinhaAuth.criarRotaPersonalizada = async ({ nome, descricao, municipios, trilha, publica }) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    if (!nome || !nome.trim()) throw new Error("Dê um nome pra rota.");
    if (!municipios || municipios.length < 2) throw new Error("Escolha pelo menos 2 municípios.");

    const novoDocRef = doc(collection(db, "rotasPersonalizadas"));
    await setDoc(novoDocRef, {
      donoUid: usuario.uid,
      donoApelido: window.raspadinhaAuth.apelido || "?",
      nome: nome.trim().slice(0, 60),
      descricao: (descricao || "").trim().slice(0, 300),
      municipios,
      // trilha: só quando vem do Modo Viagem PRO (array de [lat,lon]
      // do trajeto real). publica: falso por padrão -- IMPORTANTE, a
      // leitura desta coleção continua liberada pra qualquer logado
      // que tenha o id (é o que faz o link compartilhado funcionar,
      // ver regra no README), então "privada" aqui quer dizer "não
      // aparece em nenhuma listagem pública" -- não é uma trava de
      // acesso por id. Só vira mesmo pública se o dono compartilhar.
      ...(trilha?.length ? { trilha } : {}),
      publica: !!publica,
      criadoEm: serverTimestamp(),
    });
    return novoDocRef.id;
  };

  window.raspadinhaAuth.buscarMinhasRotasPersonalizadas = async () => {
    const usuario = auth.currentUser;
    if (!usuario) return [];
    // SEM orderBy na query -- combinar where(donoUid) + orderBy(criadoEm)
    // exige um índice composto no Firestore (mesmo motivo documentado no
    // README pro filtro de posts por município). Ordena no cliente
    // depois de buscar -- lista de uma pessoa só é sempre pequena, não
    // pesa nada ordenar em JS.
    const consulta = query(collection(db, "rotasPersonalizadas"), where("donoUid", "==", usuario.uid));
    const snap = await getDocs(consulta);
    const rotas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rotas.sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0));
    return rotas;
  };

  window.raspadinhaAuth.buscarRotaPersonalizadaPorId = async (rotaId) => {
    const snap = await getDoc(doc(db, "rotasPersonalizadas", rotaId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  };

  window.raspadinhaAuth.excluirRotaPersonalizada = async (rotaId) => {
    await deleteDoc(doc(db, "rotasPersonalizadas", rotaId));
  };

  /**
   * Garagem Virtual (recurso PRO do Motoclube, ver souMembroMotoclube
   * em js/script.js): até 3 motos por usuário (limite conferido aqui,
   * ver criarMoto), guardadas em garagem/{uid}/motos/{motoId}. A
   * regra do Firestore (README) checa só o uid no CAMINHO, tanto pro
   * doc pai quanto pra subcoleção. Marca e modelo NUNCA aparecem em
   * perfil público/ranking/comunidade -- só as funções daqui e a tela
   * da Garagem tocam nesses documentos.
   *
   * O doc pai (garagem/{uid}) guarda só `motoAtivaId`: qual moto
   * recebe a quilometragem automática do Modo Viagem (ver
   * somarOdometroGaragem) -- evita ter que tocar em todas as motos
   * toda vez que a pessoa troca qual é a "principal".
   */
  const LIMITE_MOTOS_GARAGEM = 3;

  /**
   * Compatibilidade com o formato antigo (v0.11.3, 1 doc só em
   * garagem/{uid} com marca/modelo direto): na primeira vez que
   * alguém que já tinha cadastrado antes abrir a Garagem de novo,
   * migra pra dentro da subcoleção `motos` automaticamente.
   */
  async function migrarGaragemAntigaSeNecessario(uid) {
    const refPai = doc(db, "garagem", uid);
    const snapPai = await getDoc(refPai);
    if (!snapPai.exists() || !snapPai.data().marca) return;

    const dadosAntigos = snapPai.data();
    const novaMotoRef = doc(collection(db, "garagem", uid, "motos"));
    await setDoc(novaMotoRef, {
      marca: dadosAntigos.marca,
      modelo: dadosAntigos.modelo || "",
      apelido: dadosAntigos.apelido || "",
      odometroKm: dadosAntigos.odometroKm || 0,
      criadoEm: dadosAntigos.atualizadoEm || serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });
    await setDoc(refPai, { motoAtivaId: novaMotoRef.id }, { merge: true });
  }

  /** Lista as motos + qual delas está ativa. */
  window.raspadinhaAuth.buscarMotos = async () => {
    const usuario = auth.currentUser;
    if (!usuario) return { motos: [], motoAtivaId: null };
    await migrarGaragemAntigaSeNecessario(usuario.uid);

    const [snapMotos, snapPai] = await Promise.all([
      getDocs(collection(db, "garagem", usuario.uid, "motos")),
      getDoc(doc(db, "garagem", usuario.uid)),
    ]);
    const motos = snapMotos.docs.map((d) => ({ id: d.id, ...d.data() }));
    motos.sort((a, b) => (a.criadoEm?.toMillis?.() || 0) - (b.criadoEm?.toMillis?.() || 0));
    return { motos, motoAtivaId: snapPai.data()?.motoAtivaId || motos[0]?.id || null };
  };

  window.raspadinhaAuth.criarMoto = async ({ marca, modelo, apelido }) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    if (!marca || !modelo || !modelo.trim()) throw new Error("Preencha marca e modelo da moto.");

    const atuais = await getDocs(collection(db, "garagem", usuario.uid, "motos"));
    if (atuais.size >= LIMITE_MOTOS_GARAGEM) {
      throw new Error(`Você já tem ${LIMITE_MOTOS_GARAGEM} motos cadastradas (o máximo por enquanto).`);
    }

    const novaRef = doc(collection(db, "garagem", usuario.uid, "motos"));
    await setDoc(novaRef, {
      marca,
      modelo: modelo.trim().slice(0, 60),
      apelido: (apelido || "").trim().slice(0, 40),
      odometroKm: 0,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });

    // A primeira moto cadastrada já vira a "ativa" sozinha.
    if (atuais.empty) {
      await setDoc(doc(db, "garagem", usuario.uid), { motoAtivaId: novaRef.id }, { merge: true });
    }
    return novaRef.id;
  };

  window.raspadinhaAuth.atualizarMoto = async (motoId, { marca, modelo, apelido }) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    if (!marca || !modelo || !modelo.trim()) throw new Error("Preencha marca e modelo da moto.");
    await updateDoc(doc(db, "garagem", usuario.uid, "motos", motoId), {
      marca,
      modelo: modelo.trim().slice(0, 60),
      apelido: (apelido || "").trim().slice(0, 40),
      atualizadoEm: serverTimestamp(),
    });
  };

  /** Exclui uma moto -- se ela era a ativa, promove outra (a primeira
   * que sobrar) automaticamente, ou deixa sem ativa se não sobrar nenhuma. */
  window.raspadinhaAuth.excluirMoto = async (motoId) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    await deleteDoc(doc(db, "garagem", usuario.uid, "motos", motoId));

    const refPai = doc(db, "garagem", usuario.uid);
    const snapPai = await getDoc(refPai);
    if (snapPai.data()?.motoAtivaId === motoId) {
      const restantes = await getDocs(collection(db, "garagem", usuario.uid, "motos"));
      await setDoc(refPai, { motoAtivaId: restantes.docs[0]?.id || null }, { merge: true });
    }
  };

  window.raspadinhaAuth.definirMotoAtiva = async (motoId) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    await setDoc(doc(db, "garagem", usuario.uid), { motoAtivaId: motoId }, { merge: true });
  };

  /**
   * Soma a quilometragem de um rolê ao odômetro da moto ATIVA --
   * chamada automaticamente ao encerrar o Modo Viagem (usuário PRO).
   * Fica em silêncio se a pessoa ainda não cadastrou moto nenhuma --
   * não faz sentido forçar isso na hora de fechar uma viagem. Devolve
   * o id da moto que recebeu (ou null), pra o resumo da viagem
   * conseguir gravar o vínculo em `viagens` (ver salvarResumoViagem).
   */
  window.raspadinhaAuth.somarOdometroGaragem = async (km) => {
    const usuario = auth.currentUser;
    if (!usuario || !km || km <= 0) return null;
    const snapPai = await getDoc(doc(db, "garagem", usuario.uid));
    let motoId = snapPai.data()?.motoAtivaId;
    if (!motoId) {
      const snapMotos = await getDocs(collection(db, "garagem", usuario.uid, "motos"));
      motoId = snapMotos.docs[0]?.id;
    }
    if (!motoId) return null;
    await updateDoc(doc(db, "garagem", usuario.uid, "motos", motoId), {
      odometroKm: increment(km),
      atualizadoEm: serverTimestamp(),
    });
    return motoId;
  };

  /**
   * Log privado das viagens (recurso PRO): um doc por Modo Viagem
   * encerrado, só pro próprio dono ler (ver regra no README) -- é
   * estatística pessoal, não posta nada em lugar nenhum sozinho (isso
   * é uma ação separada, ver criarPost usado na tela de compartilhar).
   * `motoId` (opcional) vincula a viagem à moto que recebeu a
   * quilometragem, pra tela de Estatísticas da Garagem conseguir
   * filtrar (ver buscarViagensPorMoto).
   */
  window.raspadinhaAuth.salvarResumoViagem = async ({ km, duracaoMs, municipiosNovos, motoId }) => {
    const usuario = auth.currentUser;
    if (!usuario) return;
    await addDoc(collection(db, "viagens"), {
      donoUid: usuario.uid,
      km,
      duracaoMs,
      municipiosNovos,
      motoId: motoId || null,
      criadoEm: serverTimestamp(),
    });
  };

  /**
   * Viagens registradas com uma moto específica -- usado na aba
   * Estatísticas da Garagem. SEM orderBy (mesmo motivo de sempre:
   * where(donoUid) + where(motoId) + orderBy exigiria índice
   * composto) -- ordena no cliente, lista de uma pessoa só é pequena.
   */
  window.raspadinhaAuth.buscarViagensPorMoto = async (motoId) => {
    const usuario = auth.currentUser;
    if (!usuario) return [];
    const consulta = query(
      collection(db, "viagens"),
      where("donoUid", "==", usuario.uid),
      where("motoId", "==", motoId)
    );
    const snap = await getDocs(consulta);
    const viagens = snap.docs.map((d) => d.data());
    viagens.sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0));
    return viagens;
  };

  /**
   * Motoclube Desbrava: dicas/lojas (peças, oficinas, acessórios...)
   * cadastradas pelos usuários, com filtro de marca/modelo -- coleção
   * própria (`motoclubeItens`), não é por município (motoclube não é
   * regional). GRATUITO por enquanto; o código já está no formato de
   * uma feature "Pro" (ver souMembroMotoclube em js/script.js), mas
   * ninguém é bloqueado hoje -- não cobra nada sem o Paulo pedir de
   * novo (mesma regra do Plano PRO).
   */
  window.raspadinhaAuth.criarItemMotoclube = async ({
    arquivoFoto,
    nome,
    categoria,
    marcas,
    modelos,
    descricao,
    linkMaps,
  }) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    if (!nome || !nome.trim()) throw new Error("Dê um nome pra loja/dica.");

    const novoDocRef = doc(collection(db, "motoclubeItens"));
    let fotoUrl = null;
    let fotoDriveId = null;
    if (arquivoFoto) {
      const resultado = await subirFotoPostParaDrive(arquivoFoto, `motoclube-${novoDocRef.id}.jpg`);
      fotoUrl = resultado.fotoUrl;
      fotoDriveId = resultado.fotoId;
    }

    await setDoc(novoDocRef, {
      autorUid: usuario.uid,
      autorApelido: window.raspadinhaAuth.apelido || "?",
      nome: nome.trim().slice(0, 80),
      categoria: categoria || "outro",
      marcas: marcas || [],
      modelos: (modelos || "").trim().slice(0, 150),
      descricao: (descricao || "").trim().slice(0, 500),
      linkMaps: (linkMaps || "").trim().slice(0, 300),
      fotoUrl,
      fotoDriveId,
      curtidoPor: [],
      criadoEm: serverTimestamp(),
    });
    return novoDocRef.id;
  };

  window.raspadinhaAuth.buscarItensMotoclube = async () => {
    // Sem where/orderBy combinados (evita índice composto, mesmo
    // motivo de buscarMinhasRotasPersonalizadas) -- filtro de
    // marca/modelo é feito no cliente (script.js), a lista inteira
    // nunca deve ficar grande o bastante pra isso pesar.
    const snap = await getDocs(collection(db, "motoclubeItens"));
    const itens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    itens.sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0));
    return itens;
  };

  window.raspadinhaAuth.curtirItemMotoclube = async (itemId, curtir) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    await updateDoc(doc(db, "motoclubeItens", itemId), {
      curtidoPor: curtir ? arrayUnion(usuario.uid) : arrayRemove(usuario.uid),
    });
  };

  window.raspadinhaAuth.excluirItemMotoclube = async (itemId) => {
    await deleteDoc(doc(db, "motoclubeItens", itemId));
  };

  /* ============================================================
     LOJA DESBRAVA: catálogo de produtos (físico/digital) cadastrado só
     pelo admin (UID_DONO, ver regra no README), com gamificação de
     desbloqueio por município (ver estaVerificado em js/script.js) e
     pseudo-checkout (SEM gateway de pagamento real -- criarPedido só
     registra a intenção de compra, não cobra nada de verdade).
     ============================================================ */

  /** Vitrine pública: só produtos "ativo" ou "em_breve" -- "oculto"
   * nem entra na consulta (ver regra no README). */
  window.raspadinhaAuth.buscarProdutos = async () => {
    const consulta = query(collection(db, "produtos"), where("status", "in", ["ativo", "em_breve"]));
    const snap = await getDocs(consulta);
    const produtos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    produtos.sort((a, b) => (a.criadoEm?.toMillis?.() || 0) - (b.criadoEm?.toMillis?.() || 0));
    return produtos;
  };

  /** Painel do admin: TODOS os produtos, incluindo "oculto". Só
   * funciona de verdade pra UID_DONO (regra do Firestore rejeita
   * qualquer outra conta). */
  window.raspadinhaAuth.buscarTodosProdutosAdmin = async () => {
    const snap = await getDocs(collection(db, "produtos"));
    const produtos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    produtos.sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0));
    return produtos;
  };

  window.raspadinhaAuth.criarProduto = async ({
    nome,
    descricao,
    imagemUrl,
    tipo,
    estoque,
    valorBase,
    regraDesbloqueio,
    status,
  }) => {
    const novoDocRef = doc(collection(db, "produtos"));
    await setDoc(novoDocRef, {
      nome: (nome || "").trim().slice(0, 80),
      descricao: (descricao || "").trim().slice(0, 500),
      imagemUrl: imagemUrl || "",
      tipo: tipo === "digital" ? "digital" : "fisico",
      estoque: Number(estoque) || 0,
      valorBase: Number(valorBase) || 0,
      regraDesbloqueio: regraDesbloqueio || [],
      status: ["oculto", "em_breve", "ativo"].includes(status) ? status : "oculto",
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });
    return novoDocRef.id;
  };

  window.raspadinhaAuth.atualizarProduto = async (produtoId, dados) => {
    await updateDoc(doc(db, "produtos", produtoId), {
      nome: (dados.nome || "").trim().slice(0, 80),
      descricao: (dados.descricao || "").trim().slice(0, 500),
      imagemUrl: dados.imagemUrl || "",
      tipo: dados.tipo === "digital" ? "digital" : "fisico",
      estoque: Number(dados.estoque) || 0,
      valorBase: Number(dados.valorBase) || 0,
      regraDesbloqueio: dados.regraDesbloqueio || [],
      status: ["oculto", "em_breve", "ativo"].includes(dados.status) ? dados.status : "oculto",
      atualizadoEm: serverTimestamp(),
    });
  };

  window.raspadinhaAuth.excluirProduto = async (produtoId) => {
    await deleteDoc(doc(db, "produtos", produtoId));
  };

  /**
   * Popula o Firestore com os 3 produtos de exemplo (rodar 1x pelo
   * admin, ver botão dedicado no painel). Não confere duplicidade --
   * clicar de novo cria outros 3 -- por isso o botão pede confirmação
   * antes de chamar isso.
   */
  window.raspadinhaAuth.popularProdutosExemplo = async (idsRotaGoytacazes, idNiteroi) => {
    await window.raspadinhaAuth.criarProduto({
      nome: 'Patch Bordado em Couro "Rota Goytacazes"',
      descricao: "Patch bordado, base de couro, pra colar na jaqueta ou na bagageira -- prova de quem já rodou a Rota Povos Goytacazes.",
      imagemUrl: "",
      tipo: "fisico",
      estoque: 30,
      valorBase: 39.9,
      regraDesbloqueio: idsRotaGoytacazes || [],
      status: "ativo",
    });
    await window.raspadinhaAuth.criarProduto({
      nome: 'Ímã de Geladeira "Niterói"',
      descricao: "Ímã de geladeira comemorativo de Niterói -- em breve na Loja.",
      imagemUrl: "",
      tipo: "fisico",
      estoque: 50,
      valorBase: 14.9,
      regraDesbloqueio: idNiteroi ? [idNiteroi] : [],
      status: "em_breve",
    });
    await window.raspadinhaAuth.criarProduto({
      nome: "Chaveiro Clássico Desbrava",
      descricao: "O chaveiro clássico do Desbrava, liberado pra qualquer um -- não precisa ter raspado nenhum município.",
      imagemUrl: "",
      tipo: "fisico",
      estoque: 100,
      valorBase: 19.9,
      regraDesbloqueio: [],
      status: "ativo",
    });
  };

  /**
   * Pseudo-checkout: só registra o pedido no Firestore (SEM gateway de
   * pagamento real) -- ver calcularFrete/finalizarCompraLoja em
   * js/script.js pro resto do fluxo (frete via ViaCEP, voucher do
   * Motoclube).
   */
  window.raspadinhaAuth.criarPedido = async ({
    produtoId,
    produtoNome,
    tipoProduto,
    valorBase,
    valorVoucherAplicado,
    valorFrete,
    valorTotal,
    cep,
    uf,
  }) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    await addDoc(collection(db, "pedidos"), {
      donoUid: usuario.uid,
      donoApelido: window.raspadinhaAuth.apelido || "?",
      produtoId,
      produtoNome,
      tipoProduto,
      valorBase,
      valorVoucherAplicado: valorVoucherAplicado || 0,
      valorFrete: valorFrete || 0,
      valorTotal,
      cep: cep || null,
      uf: uf || null,
      criadoEm: serverTimestamp(),
    });
  };

  /**
   * Marca o voucher mensal do Motoclube como usado neste mês --
   * qualquer conta pode escrever esse campo no PRÓPRIO perfil (regra
   * padrão de usuarios/{uid}, não é um dos campos restritos tipo
   * "ehPro"/"status"). "YYYY-MM" como valor, pra comparar mês a mês
   * sem se importar com o dia/timezone exatos.
   */
  window.raspadinhaAuth.usarVoucherMotoclube = async () => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    const mesAtual = new Date().toISOString().slice(0, 7);
    await updateDoc(doc(db, "usuarios", usuario.uid), { ultimoMesUsoVoucher: mesAtual });
    window.raspadinhaAuth.ultimoMesUsoVoucher = mesAtual;
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
  window.raspadinhaAuth.buscarFeedGlobal = async ({ municipioId, pontoId, cursor, limiteN = 15 } = {}) => {
    const clausulas = [orderBy("criadoEm", "desc"), limit(limiteN)];
    /* `pontoId` já carrega o município no prefixo (3302106-...), então
       filtrar pelos dois seria redundante -- e pediria um índice
       composto a mais pro Firestore. Quando vem ponto, ele manda. */
    if (pontoId) clausulas.unshift(where("pontoId", "==", pontoId));
    else if (municipioId) clausulas.unshift(where("municipioId", "==", municipioId));
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
  window.raspadinhaAuth.curtirPost = async (postId, curtir, autorDoPostUid) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    await updateDoc(doc(db, "posts", postId), {
      curtidoPor: curtir ? arrayUnion(usuario.uid) : arrayRemove(usuario.uid),
    });
    /* Só o CURTIR avisa. Descurtir não manda nada e não apaga o aviso
     * anterior: notificação é registro do que aconteceu, não estado --
     * apagar deixaria a caixa mudando sozinha depois de lida. */
    if (curtir && autorDoPostUid) notificar(autorDoPostUid, { tipo: "curtida-post", postId });
  };

  /**
   * Comenta num post: grava na subcoleção e incrementa o contador
   * denormalizado no post (duas escritas -- não dá pra fazer num
   * batch atômico simples porque o id do comentário só existe depois
   * de criado, mas como é só um contador de exibição, um comentário
   * "perdido" no meio do caminho (falha de rede entre as duas
   * escritas) não é grave).
   */
  window.raspadinhaAuth.comentarPost = async (postId, texto, autorDoPostUid) => {
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
    if (autorDoPostUid) {
      notificar(autorDoPostUid, {
        tipo: "comentario-post",
        postId,
        texto: textoLimpo.slice(0, 120),
      });
    }
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

  /* ============================================================
     Sugestões da Comunidade: uma subcoleção por município
     (sugestoesComunidade/{municipioId}/itens/{itemId}) -- assim o
     feed de um município já vem isolado sem precisar de "where" +
     "orderBy" combinados (o tipo de consulta que exige um índice
     composto criado manualmente, como aconteceu com o filtro de
     posts por município). Ordenar por "mais curtido primeiro" só
     usa um índice de campo único (numCurtidas), que o Firestore cria
     sozinho.
     ============================================================ */

  /**
   * Cria uma sugestão de lugar num município. Reaproveita a mesma
   * infra provisória de foto dos posts (subirFotoPostParaDrive, ver
   * criarPost acima) -- mesmo aviso de privacidade (link público).
   * "anonimo" só afeta como o app RENDERIZA o autor (ver
   * renderizarCardSugestao em js/script.js); o autorUid real
   * continua gravado, porque a regra do Firestore precisa dele pra
   * saber quem pode editar/excluir.
   */
  window.raspadinhaAuth.criarSugestao = async ({
    municipioId,
    titulo,
    descricao,
    categoria,
    linkMaps,
    arquivoFoto,
    anonimo,
  }) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    if (!municipioId) throw new Error("Selecione um município.");
    if (!(titulo || "").trim()) throw new Error("Dê um nome pro lugar.");

    const novoDocRef = doc(collection(db, "sugestoesComunidade", municipioId, "itens"));
    const itemId = novoDocRef.id;

    let fotoUrl = null;
    let fotoId = null;
    if (arquivoFoto) {
      const resultado = await comTimeout(
        subirFotoPostParaDrive(arquivoFoto, `sugestao-${itemId}.jpg`),
        30000,
        "A conexão está lenta demais pra subir a foto. Verifique sua internet e tente de novo."
      );
      fotoUrl = resultado.fotoUrl;
      fotoId = resultado.fotoId;
    }

    await comTimeout(
      setDoc(novoDocRef, {
        autorUid: usuario.uid,
        autorApelido: window.raspadinhaAuth.apelido || "?",
        anonimo: !!anonimo,
        titulo: titulo.trim().slice(0, 80),
        descricao: (descricao || "").trim().slice(0, 500),
        categoria: categoria || "outro",
        linkMaps: (linkMaps || "").trim().slice(0, 500) || null,
        fotoUrl,
        fotoDriveId: fotoId,
        curtidoPor: [],
        numCurtidas: 0,
        numComentarios: 0,
        criadoEm: serverTimestamp(),
      }),
      15000,
      "A conexão está lenta demais pra publicar. Verifique sua internet e tente de novo."
    );

    return itemId;
  };

  /**
   * Sugestões de UM município, sempre ordenadas por mais curtidas
   * primeiro (numCurtidas, contador denormalizado -- ver
   * curtirSugestao). Paginado do mesmo jeito que buscarFeedGlobal.
   */
  window.raspadinhaAuth.buscarSugestoes = async (municipioId, { cursor, limiteN = 20 } = {}) => {
    const clausulas = [orderBy("numCurtidas", "desc"), limit(limiteN)];
    if (cursor) clausulas.push(startAfter(cursor));
    const consulta = query(collection(db, "sugestoesComunidade", municipioId, "itens"), ...clausulas);
    const resultado = await getDocs(consulta);
    const sugestoes = resultado.docs.map((d) => ({ id: d.id, ...d.data() }));
    return {
      sugestoes,
      proximoCursor: resultado.docs.length === limiteN ? resultado.docs[resultado.docs.length - 1] : null,
    };
  };

  /**
   * Curtir/descurtir: diferente de curtirPost, aqui também mantém um
   * contador numérico (numCurtidas) na mesma escrita -- é o que
   * permite ordenar "mais curtido primeiro" direto na consulta (ver
   * buscarSugestoes), já que o Firestore não ordena por tamanho de
   * array.
   */
  window.raspadinhaAuth.curtirSugestao = (municipioId, itemId, curtir) => {
    const usuario = auth.currentUser;
    if (!usuario) return Promise.reject(new Error("Faça login primeiro."));
    return updateDoc(doc(db, "sugestoesComunidade", municipioId, "itens", itemId), {
      curtidoPor: curtir ? arrayUnion(usuario.uid) : arrayRemove(usuario.uid),
      numCurtidas: increment(curtir ? 1 : -1),
    });
  };

  window.raspadinhaAuth.comentarSugestao = async (municipioId, itemId, texto) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    const textoLimpo = (texto || "").trim().slice(0, 500);
    if (!textoLimpo) return;

    const itemRef = doc(db, "sugestoesComunidade", municipioId, "itens", itemId);
    await addDoc(collection(itemRef, "comentarios"), {
      autorUid: usuario.uid,
      autorApelido: window.raspadinhaAuth.apelido || "?",
      texto: textoLimpo,
      criadoEm: serverTimestamp(),
    });
    await updateDoc(itemRef, { numComentarios: increment(1) });
  };

  window.raspadinhaAuth.listarComentariosSugestao = async (municipioId, itemId) => {
    const consulta = query(
      collection(db, "sugestoesComunidade", municipioId, "itens", itemId, "comentarios"),
      orderBy("criadoEm", "asc")
    );
    const resultado = await getDocs(consulta);
    return resultado.docs.map((d) => ({ id: d.id, ...d.data() }));
  };

  /* ---------- Comentários nos pontos turísticos ----------
   *
   * Coleção: pontosTuristicos/{pontoId}/comentarios/{id}
   * O `pontoId` é o id ESTÁVEL de data/destinos.json
   * (ex. 3302106-praca-da-matematica), nunca o índice do array --
   * excluir ou reordenar um ponto migraria comentário de lugar.
   *
   * REGRA DE QUEM PODE COMENTAR: só quem teve a presença confirmada
   * por GPS no município do ponto. A trava de verdade é a Regra do
   * Firestore, que confere
   *   estadoMunicipios[municipioId].verificado == true
   * no doc do próprio usuário. A checagem aqui no cliente é só pra
   * não deixar a pessoa digitar um comentário que o servidor vai
   * recusar depois -- quem abrir o DevTools passa por ela, mas
   * esbarra na regra.
   *
   * O doc pai (pontosTuristicos/{pontoId}) não precisa existir: no
   * Firestore uma subcoleção vive sem documento pai. Por isso não há
   * contador denormalizado aqui -- não há onde guardá-lo sem inventar
   * uma escrita a mais que a regra teria que liberar pra qualquer um.
   */
  window.raspadinhaAuth.comentarPonto = async (pontoId, municipioId, texto) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    const textoLimpo = (texto || "").trim().slice(0, 500);
    if (!textoLimpo) return null;

    const referencia = await addDoc(
      collection(db, "pontosTuristicos", pontoId, "comentarios"),
      {
        autorUid: usuario.uid,
        autorApelido: window.raspadinhaAuth.apelido || "?",
        municipioId: String(municipioId),
        texto: textoLimpo,
        criadoEm: serverTimestamp(),
      }
    );
    return referencia.id;
  };

  window.raspadinhaAuth.listarComentariosPonto = async (pontoId) => {
    /* Ordena por CRIAÇÃO aqui e por CURTIDAS no cliente
     * (renderizarComentariosDoPonto). Pedir ao Firestore
     * `orderBy('numCurtidas','desc')` exigiria manter um índice e, pior,
     * pagina errado quando alguém curte no meio da rolagem. Um ponto não
     * tem centenas de comentários -- ordenar em memória é exato e de
     * graça. */
    const consulta = query(
      collection(db, "pontosTuristicos", pontoId, "comentarios"),
      orderBy("criadoEm", "asc")
    );
    const resultado = await getDocs(consulta);
    return resultado.docs.map((d) => ({ id: d.id, ...d.data() }));
  };

  /**
   * Curtir/descurtir um comentário de ponto. Só mexe no próprio uid
   * dentro de `curtidoPor`; `numCurtidas` acompanha pra a ordenação não
   * precisar contar array a cada render.
   *
   * Qualquer pessoa logada curte -- diferente de COMENTAR, que exige o
   * município verificado por GPS.
   */
  window.raspadinhaAuth.curtirComentarioPonto = async (pontoId, comentarioId, curtir) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    await updateDoc(doc(db, "pontosTuristicos", pontoId, "comentarios", comentarioId), {
      curtidoPor: curtir ? arrayUnion(usuario.uid) : arrayRemove(usuario.uid),
      numCurtidas: increment(curtir ? 1 : -1),
    });
  };

  /* ---------- Respostas dentro de um comentário ----------
   *
   * pontosTuristicos/{pontoId}/comentarios/{id}/respostas/{id}
   *
   * QUALQUER PESSOA LOGADA RESPONDE, mesmo sem ter ido ao lugar --
   * decisão do Paulo: é onde quem tem dúvida pergunta a quem esteve
   * lá. Comentar de primeira continua exigindo GPS; perguntar, não.
   */
  window.raspadinhaAuth.responderComentarioPonto = async (
    pontoId,
    comentarioId,
    texto,
    donoDoComentarioUid
  ) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    const textoLimpo = (texto || "").trim().slice(0, 500);
    if (!textoLimpo) return null;

    const referencia = await addDoc(
      collection(db, "pontosTuristicos", pontoId, "comentarios", comentarioId, "respostas"),
      {
        autorUid: usuario.uid,
        autorApelido: window.raspadinhaAuth.apelido || "?",
        texto: textoLimpo,
        criadoEm: serverTimestamp(),
      }
    );

    // Avisa o dono do comentário (menos quando ele responde a si mesmo).
    if (donoDoComentarioUid && donoDoComentarioUid !== usuario.uid) {
      notificar(donoDoComentarioUid, {
        tipo: "resposta-comentario",
        texto: textoLimpo.slice(0, 120),
        pontoId,
      });
    }
    return referencia.id;
  };

  window.raspadinhaAuth.listarRespostasPonto = async (pontoId, comentarioId) => {
    const consulta = query(
      collection(db, "pontosTuristicos", pontoId, "comentarios", comentarioId, "respostas"),
      orderBy("criadoEm", "asc")
    );
    const resultado = await getDocs(consulta);
    return resultado.docs.map((d) => ({ id: d.id, ...d.data() }));
  };

  window.raspadinhaAuth.excluirRespostaPonto = async (pontoId, comentarioId, respostaId) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    await deleteDoc(
      doc(db, "pontosTuristicos", pontoId, "comentarios", comentarioId, "respostas", respostaId)
    );
  };

  /* ============================================================
     NOTIFICAÇÕES  --  usuarios/{uid}/notificacoes/{id}

     QUEM ESCREVE É O CLIENTE DE QUEM AGE, não um gatilho de servidor:
     Cloud Functions exigem o plano Blaze, e o projeto está no Spark
     (ver BLAZE.md). Então, quando eu curto o seu post, é o MEU app que
     grava o aviso na SUA caixa.

     Consequências que valem saber:
     - a regra do Firestore libera qualquer autenticado a CRIAR na caixa
       de qualquer um, exigindo só que `deUid` seja o próprio uid. Dá
       pra abusar disso com o DevTools; ler/apagar continua só do dono.
     - se o app de quem agiu cair entre a ação e o aviso, a notificação
       se perde. Por isso ela é sempre "melhor esforço": nunca derruba a
       ação principal (o like já foi, o comentário já está lá).
     Quando o Blaze entrar, isso vira um gatilho no servidor.
     ============================================================ */

  /** Melhor esforço: nunca lança, nunca trava a ação que a gerou. */
  function notificar(paraUid, dados) {
    const usuario = auth.currentUser;
    if (!usuario || !paraUid || paraUid === usuario.uid) return;
    addDoc(collection(db, "usuarios", paraUid, "notificacoes"), {
      deUid: usuario.uid,
      deApelido: window.raspadinhaAuth.apelido || "?",
      lida: false,
      criadoEm: serverTimestamp(),
      ...dados,
    }).catch((erro) => console.warn("Não deu pra notificar:", erro));
  }

  window.raspadinhaAuth.listarNotificacoes = async (limiteN = 40) => {
    const usuario = auth.currentUser;
    if (!usuario) return [];
    const consulta = query(
      collection(db, "usuarios", usuario.uid, "notificacoes"),
      orderBy("criadoEm", "desc"),
      limit(limiteN)
    );
    const resultado = await getDocs(consulta);
    return resultado.docs.map((d) => ({ id: d.id, ...d.data() }));
  };

  window.raspadinhaAuth.contarNotificacoesNaoLidas = async () => {
    const usuario = auth.currentUser;
    if (!usuario) return 0;
    const consulta = query(
      collection(db, "usuarios", usuario.uid, "notificacoes"),
      where("lida", "==", false)
    );
    // getCountFromServer: conta sem baixar os documentos.
    const resultado = await getCountFromServer(consulta);
    return resultado.data().count;
  };

  window.raspadinhaAuth.marcarNotificacoesLidas = async (ids) => {
    const usuario = auth.currentUser;
    if (!usuario || !ids?.length) return;
    await Promise.all(
      ids.map((id) =>
        updateDoc(doc(db, "usuarios", usuario.uid, "notificacoes", id), { lida: true }).catch(
          () => {}
        )
      )
    );
  };

  window.raspadinhaAuth.excluirNotificacao = async (id) => {
    const usuario = auth.currentUser;
    if (!usuario) return;
    await deleteDoc(doc(db, "usuarios", usuario.uid, "notificacoes", id));
  };

  /** Só o autor apaga o próprio -- a regra do Firestore confere o uid. */
  window.raspadinhaAuth.excluirComentarioPonto = async (pontoId, comentarioId) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    await deleteDoc(doc(db, "pontosTuristicos", pontoId, "comentarios", comentarioId));
  };

  /**
   * Exclui uma sugestão (só o autor, ver regra) -- mesma lógica de
   * excluirPost (apaga o doc, apaga a foto do Drive em "melhor
   * esforço", não cascateia os comentários).
   */
  window.raspadinhaAuth.excluirSugestao = async (municipioId, itemId, fotoDriveId) => {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error("Faça login primeiro.");
    await deleteDoc(doc(db, "sugestoesComunidade", municipioId, "itens", itemId));
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
      window.raspadinhaAuth.proAte = null;
      window.raspadinhaAuth.grupoMotoclube = null;
      window.raspadinhaAuth.grupoEntrouEm = null;
      window.raspadinhaAuth.numeroMotoclube = null;
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
      // Vencimento da assinatura do Motoclube, gravado pelo webhook do
      // Asaas (tools/apps-script-asaas.gs). Pode vir como Timestamp do
      // Firestore ou string ISO -- quem normaliza é
      // parsearDataAssinatura em js/script.js.
      window.raspadinhaAuth.proAte = snap.data()?.proAte || null;
      window.raspadinhaAuth.fotoPerfil = snap.data()?.fotoPerfil || null;
      window.raspadinhaAuth.grupoMotoclube = snap.data()?.grupoMotoclube || null;
      window.raspadinhaAuth.grupoEntrouEm = snap.data()?.grupoEntrouEm || null;
      window.raspadinhaAuth.numeroMotoclube = snap.data()?.numeroMotoclube || null;
      window.raspadinhaAuth.ultimoMesUsoVoucher = snap.data()?.ultimoMesUsoVoucher || null;

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
