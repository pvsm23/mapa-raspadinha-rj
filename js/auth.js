/**
 * Login com Google via Firebase Authentication + Google Analytics
 * (medir quantos acessos o site tem) + Firestore (apelido escolhido
 * no primeiro login).
 *
 * Este arquivo é um módulo ES (por isso o <script type="module"> no
 * index.html) porque o SDK do Firebase é distribuído assim. Como
 * script.js é um script "normal" (não módulo), a ponte entre os dois
 * é o objeto global `window.raspadinhaAuth` e os eventos
 * "auth-mudou" / "precisa-apelido".
 *
 * Usa signInWithRedirect (não signInWithPopup): popups não
 * funcionam de forma confiável em navegadores mobile nem dentro de
 * um PWA instalado (a janela abre e fecha sozinha sem completar o
 * login) — redirect é o método recomendado pelo próprio Firebase
 * nesses casos.
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
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const CONFIGURADO = firebaseConfig.apiKey !== "SUBSTITUA_AQUI";

window.raspadinhaAuth = {
  configurado: CONFIGURADO,
  usuarioAtual: null,
  apelido: null,
  entrar: () => {
    alert(
      "Login ainda não configurado. Preencha js/firebase-config.js com as chaves do seu projeto Firebase."
    );
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
  const provider = new GoogleAuthProvider();

  window.raspadinhaAuth.entrar = () => {
    signInWithRedirect(auth, provider).catch((erro) => {
      console.error("Falha ao iniciar login com Google:", erro);
    });
  };

  window.raspadinhaAuth.sair = () => signOut(auth);

  window.raspadinhaAuth.salvarApelido = async (apelido) => {
    const usuario = auth.currentUser;
    if (!usuario) return;
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

  // Captura erros de configuração (ex: dominio nao autorizado,
  // provedor Google nao habilitado) ao voltar do redirect do Google.
  getRedirectResult(auth).catch((erro) => {
    console.error("Falha no login com Google (redirect):", erro);
  });

  onAuthStateChanged(auth, async (usuario) => {
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
      // Sem Firestore acessivel, segue com o nome do Google mesmo
      // (nao trava o usuario fora do app por causa disso).
      document.dispatchEvent(
        new CustomEvent("auth-mudou", { detail: { usuario, apelido: usuario.displayName } })
      );
    }
  });
} else {
  console.warn(
    "Firebase ainda não configurado (js/firebase-config.js). Login com Google desativado por enquanto."
  );
}
