// Configuração do projeto Firebase "viagens".
// Este bloco não é segredo: quem protege os dados são as regras em firestore.rules.
export const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "COLE_AQUI.firebaseapp.com",
  projectId: "COLE_AQUI",
  storageBucket: "COLE_AQUI.appspot.com",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI"
};

// Modelo do Gemini usado para ler PDFs e prints de confirmação.
export const GEMINI_MODEL = "gemini-2.5-flash";
