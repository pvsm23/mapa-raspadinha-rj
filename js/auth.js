/**
 * Login com e-mail e senha via Firebase Authentication + Google
 * Analytics (medir acessos) + Firestore (apelido escolhido no
 * primeiro login).
 *
 * Este arquivo é um módulo ES (por isso o <script type="module"> no
 * index.html) porque o SDK do Firebase é distribuído assim. Como
 * script.js é um script "normal" (não módulo), a ponte entre os dois
 * é o objeto global `window.raspadinhaAuth` e os eventos
 * "auth-mudou" / "precisa-apelido".
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
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const CONFIGURADO = firebaseConfig.apiKey !== "SUBSTITUA_AQUI";

// Sessão dura 30 dias de INATIVIDADE (não 30 dias corridos): toda
// vez que o app abre com uma sessão válida, o prazo é renovado. Só
// desloga de verdade se passar 30 dias sem abrir o app nenhuma vez.
const CHAVE_ULTIMA_ATIVIDADE = "raspadinha_ultima_atividade";
const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

const AVISO_NAO_CONFIGURADO =
  "Login ainda não configurado. Preencha js/firebase-config.js com as chaves do seu projeto Firebase.";

window.raspadinhaAuth = {
  configurado: CONFIGURADO,
  usuarioAtual: null,
  apelido: null,
  entrarComEmail: async () => {
    throw new Error(AVISO_NAO_CONFIGURADO);
  },
  criarContaComEmail: async () => {
    throw new Error(AVISO_NAO_CONFIGURADO);
  },
  sair: () => {},
  salvarApelido: async () => {},
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

  window.raspadinhaAuth.entrarComEmail = (email, senha) =>
    signInWithEmailAndPassword(auth, email, senha);

  window.raspadinhaAuth.criarContaComEmail = (email, senha) =>
    createUserWithEmailAndPassword(auth, email, senha);

  window.raspadinhaAuth.sair = () => signOut(auth);

  window.raspadinhaAuth.salvarApelido = async (apelido) => {
    const usuario = auth.currentUser;
    if (!usuario) return;

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
    } else {
      localStorage.removeItem(CHAVE_ULTIMA_ATIVIDADE);
    }

    window.raspadinhaAuth.usuarioAtual = usuario;

    if (!usuario) {
      window.raspadinhaAuth.apelido = null;
      document.dispatchEvent(new CustomEvent("auth-mudou", { detail: null }));
      return;
    }

    try {
      const snap = await getDoc(doc(db, "usuarios", usuario.uid));
      const apelido = snap.exists() ? snap.data().apelido : null;
      window.raspadinhaAuth.apelido = apelido || null;

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
