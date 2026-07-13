/**
 * Login com Google via Firebase Authentication.
 *
 * Este arquivo é um módulo ES (por isso o <script type="module"> no
 * index.html) porque o SDK do Firebase é distribuído assim. Como
 * script.js é um script "normal" (não módulo), a ponte entre os dois
 * é o objeto global `window.raspadinhaAuth` e o evento "auth-mudou".
 *
 * Enquanto js/firebase-config.js não tiver as chaves reais (ver
 * SUBSTITUA_AQUI nesse arquivo), o login fica desativado sem quebrar
 * o resto do app.
 */
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const CONFIGURADO = firebaseConfig.apiKey !== "SUBSTITUA_AQUI";

window.raspadinhaAuth = {
  configurado: CONFIGURADO,
  usuarioAtual: null,
  entrar: () => {
    alert(
      "Login ainda não configurado. Preencha js/firebase-config.js com as chaves do seu projeto Firebase."
    );
  },
  sair: () => {},
  // TODO(PRO): trocar por uma verificação real (ex: campo no
  // Firestore ligado ao usuário logado, ou custom claim do Firebase
  // Auth) quando o controle de assinatura PRO existir.
  ehPro: () => false,
};

if (CONFIGURADO) {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();

  window.raspadinhaAuth.entrar = () =>
    signInWithPopup(auth, provider).catch((erro) => {
      console.error("Falha no login com Google:", erro);
    });

  window.raspadinhaAuth.sair = () => signOut(auth);

  onAuthStateChanged(auth, (usuario) => {
    window.raspadinhaAuth.usuarioAtual = usuario;
    document.dispatchEvent(new CustomEvent("auth-mudou", { detail: usuario }));
  });
} else {
  console.warn(
    "Firebase ainda não configurado (js/firebase-config.js). Login com Google desativado por enquanto."
  );
}
