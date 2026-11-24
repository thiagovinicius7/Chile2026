import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, query, where,
  onSnapshot, setDoc, updateDoc, deleteDoc, addDoc, writeBatch, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { firebaseConfig, GEMINI_MODEL } from "./config.js";

/* ---------- Firebase ---------- */
const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
let db;
try { db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { db = initializeFirestore(fb, {}); }
let gemini = null; // carregado só quando alguém envia um PDF
async function getGemini() {
  if (gemini) return gemini;
  const m = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-ai.js");
  const ai = m.getAI(fb, { backend: new m.GoogleAIBackend() });
  gemini = m.getGenerativeModel(ai, { model: GEMINI_MODEL, generationConfig: { responseMimeType: "application/json" } });
  return gemini;
}

/* ---------- estado ---------- */
const S = { user: null, viagens: [], vid: null, info: null, itens: [], view: "tempo", fam: "", open: {}, carregou: false };
try { S.view = localStorage.getItem("v-view") || "tempo"; } catch (e) {}
let unsubViagens = null, unsubItens = null, unsubInfo = null;

const $ = (id) => document.getElementById(id);
const email = () => (S.user && S.user.email || "").toLowerCase();

/* ---------- utilidades ---------- */
const I = {
  voo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M10.5 13.5L3 11l1.5-1.5 8 .5 5-5c1-1 2.5-1 3 0s0 2-1 3l-5 5 .5 8L13.5 22l-2.5-7.5"/></svg>',
  hosp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-6h6v6"/></svg>',
  carro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/></svg>',
  passeio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M2 20l7-12 4 6 3-4 6 10z"/></svg>',
  rest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 3-3 6s1 3 3 3v9"/></svg>',
  nota: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 3h10l4 4v14H5z"/><path d="M9 11h6M9 15h6"/></svg>',
  bed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 18V8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M12 17v-6M9 13.5l3-3 3 3"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>',
  google: '<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>'
};
const NOME = { voo: "Voos", hosp: "Hospedagem", carro: "Carros", passeio: "Passeios", rest: "Restaurantes", nota: "Notas" };
const TNOME = { voo: "Voo", hosp: "Hospedagem", carro: "Carro", passeio: "Passeio", rest: "Restaurante", nota: "Nota" };
const CURTO = { voo: "voo", hosp: "hotel", carro: "carro", passeio: "passeio", rest: "restaurante", nota: "nota" };
const PLUR = { voo: "voos", hosp: "hotéis", carro: "carros", passeio: "passeios", rest: "restaurantes", nota: "notas" };
const ORDEM = ["voo", "hosp", "carro", "passeio", "rest", "nota"];
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pd = (s) => { if (!s) return null; const p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const fdt = (s) => { const d = pd(s); return d ? d.getDate() + " " + MES[d.getMonth()] : ""; };
const fdtAno = (s) => { const d = pd(s); return d ? d.getDate() + " " + MES[d.getMonth()] + " " + d.getFullYear() : ""; };
function money(v, m) {
  if (!v) return ""; const n = Number(v); const sym = { BRL: "R$", USD: "US$", CLP: "CLP" }[m] || m || "";
  const dec = m === "CLP" ? 0 : 2;
  return sym + " " + n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
const familias = () => String(S.info && S.info.familias || "").split(",").map((s) => s.trim()).filter(Boolean);
const okFam = (it) => !S.fam || it.familia === S.fam || it.familia === "Geral" || (it.divide || []).indexOf(S.fam) >= 0;
function toast(t) { const r = $("toastRoot"); r.innerHTML = '<div class="toast" role="status">' + esc(t) + "</div>"; clearTimeout(toast.t); toast.t = setTimeout(() => { r.innerHTML = ""; }, 2200); }
function cidade(it) {
  const s = (it.titulo || "") + " " + (it.local || "");
  const c = (S.info && S.info.cidades) || ["Santiago", "Temuco", "Pucón", "Puerto Varas", "Castro", "Chiloé"];
  for (const x of c) if (s.indexOf(x) >= 0) return x === "Chiloé" ? "Castro" : x;
  return "";
}
const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const novoId = (it) => (slug(it.tipo + "-" + it.titulo) || "item") + "-" + Date.now().toString(36).slice(-5);
function erroTexto(e) {
  const c = e && e.code || "";
  if (c.indexOf("permission-denied") >= 0) return "Seu e-mail não está na lista desta viagem.";
  if (c.indexOf("unavailable") >= 0) return "Sem conexão agora. Tente de novo em instantes.";
  return "Não deu para salvar. Tente de novo.";
}

/* ---------- telas ---------- */
function telaLogin(msg) {
  $("app").innerHTML = '<div class="center"><h1>Viagens</h1><p>Roteiro, hotéis, voos e passeios da família, num lugar só.</p>' +
    '<button class="gbtn" id="loginBtn">' + I.google + "Entrar com Google</button>" + (msg ? '<p class="msg">' + esc(msg) + "</p>" : "") + "</div>";
}
function telaLista() {
  const v = S.viagens.slice().sort((a, b) => (b.inicio || "").localeCompare(a.inicio || ""));
  let h = '<header><div class="topline"><span class="eyebrow">' + esc(S.user.email) + '</span><button class="mini" id="sairBtn">Sair</button></div><h1>Suas viagens</h1></header>';
  if (!S.carregou) h += '<p class="status">Carregando…</p>';
  else if (!v.length) h += '<div class="empty"><h3>Nenhuma viagem com o seu e-mail</h3>Se alguém te convidou, peça para conferir se cadastrou ' + esc(S.user.email) + ' na viagem. Ou crie uma nova.</div>';
  h += '<div class="trips">' + v.map((x) => '<button class="trip" data-abrir="' + esc(x.id) + '"><div><b>' + esc(x.nome || "Viagem") + "</b><span>" +
    (x.inicio ? fdt(x.inicio) + " a " + fdtAno(x.fim) : "Sem datas") + "</span></div>" + I.chev.replace('class="chev"', 'class="chev" style="transform:rotate(-90deg)"') + "</button>").join("") + "</div>";
  if (S.carregou) h += '<div class="bar"><button class="up" id="novaViagem">' + I.plus + "Nova viagem</button></div>";
  $("app").innerHTML = h;
}
function telaViagem() {
  let h = '<header><div class="topline"><span class="eyebrow" id="hDates"></span><span style="display:inline-flex;gap:6px">' +
    (S.viagens.length > 1 ? '<button class="mini" id="voltarBtn">' + I.back + "Viagens</button>" : "") +
    '<button class="mini" id="cfgBtn">' + I.gear + "Viagem</button></span></div>" +
    '<h1 id="hName"></h1><span class="status" id="hStatus"></span>' +
    '<div class="ridge" aria-hidden="true"><svg viewBox="0 0 400 24" preserveAspectRatio="none"><path fill="currentColor" opacity=".2" d="M0 24 L0 17 L30 10 L52 15 L80 3 L104 13 L130 7 L158 17 L186 5 L205 11 L232 1 L262 14 L290 8 L318 16 L346 6 L372 12 L400 7 L400 24 Z"/></svg></div></header>' +
    '<div class="bar"><div class="seg" role="group" aria-label="Visão"><button id="vTempo">Linha do tempo</button><button id="vTudo">Tudo</button></div>' +
    '<select id="fam" aria-label="Família"></select><button class="link" id="toggleAll">Abrir todos</button>' +
    '<span style="display:inline-flex;gap:6px;flex-wrap:wrap"><button class="up" id="addBtn">' + I.plus + 'Adicionar</button><button class="up" id="upBtn" title="PDF ou print de voo, hotel, carro ou passeio">' + I.pdf + "Enviar PDF</button></span></div>" +
    '<main id="out"></main>';
  $("app").innerHTML = h;
  render();
}

/* ---------- itens ---------- */
function itemHTML(it, extra) {
  const key = it.id + (extra ? "|" + extra.k : "");
  const meta = [];
  if (extra && extra.label) meta.push(extra.label);
  meta.push(it.familia && it.familia !== "Geral" ? it.familia : "Grupo todo");
  const hora = extra ? extra.hora : it.hora || "";
  const det = [];
  if (it.tipo === "hosp") { det.push(["Check-in", fdt(it.data) + (it.hora ? " · " + it.hora : "")]); det.push(["Check-out", fdt(it.dataFim) + (it.horaFim ? " · " + it.horaFim : "")]); }
  else if (it.tipo === "carro") { det.push(["Retirada", fdt(it.data) + (it.hora ? " · " + it.hora : "")]); det.push(["Devolução", fdt(it.dataFim) + (it.horaFim ? " · " + it.horaFim : "")]); }
  else { let q = fdt(it.data) || "Sem data"; if (it.hora) q += " · " + it.hora + (it.horaFim ? " → " + it.horaFim : ""); det.push(["Quando", q]); }
  if (it.local) det.push(["Local", esc(it.local)]);
  if (it.codigo) det.push(["Código", '<span class="mono">' + esc(it.codigo) + "</span>"]);
  if (it.valor) det.push(["Valor", '<span class="mono">' + esc(money(it.valor, it.moeda)) + "</span>"]);
  const st = (it.status === "confirmado" ? '<span class="pill ok">Confirmado</span>' : '<span class="pill pend">A confirmar</span>') +
    (it.pago ? '<span class="pill ok">Pago</span>' : it.valor ? '<span class="pill pend">A pagar</span>' : "");
  det.push(["Situação", st]);
  const mapQ = it.local && it.tipo !== "voo" ? it.local.split("·")[0].split("→")[0].replace(/^Retirada:\s*/, "").trim() : "";
  let btns = '<button data-edit="' + esc(it.id) + '">Editar</button>';
  if (mapQ) btns += '<a class="map" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapQ) + '">Ver no mapa</a>';
  if (it.link) btns += '<a target="_blank" rel="noopener" href="' + esc(it.link) + '">Abrir reserva</a>';
  if (it.codigo) btns += '<button data-copy="' + esc(it.codigo.split(" ")[0]) + '">Copiar código</button>';
  return '<details class="it t-' + esc(it.tipo) + '" data-k="' + esc(key) + '"' + (S.open[key] ? " open" : "") + ">" +
    '<summary><span class="ico">' + (I[it.tipo] || I.nota) + '</span><span class="imain"><div class="ititle">' + esc(it.titulo) + '</div><div class="imeta">' + esc(meta.join(" · ")) + '</div></span><span class="hora">' + esc(hora) + "</span></summary>" +
    '<div class="idet"><dl>' + det.map((r) => "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>").join("") + "</dl>" +
    (it.obs ? '<div class="obs">' + esc(it.obs) + "</div>" : "") + '<div class="btns">' + btns + "</div></div></details>";
}
function eventosDoDia(day, lista) {
  const ev = [], dorme = [];
  lista.forEach((it) => {
    const a = it.data, b = it.dataFim || it.data;
    if (it.tipo === "hosp") {
      if (a === day) ev.push({ it, k: "in", hora: it.hora || "", label: "Check-in" });
      if (b === day && b !== a) ev.push({ it, k: "out", hora: it.horaFim || "", label: "Check-out" });
      if (a <= day && day < b) dorme.push(it);
    } else if (it.tipo === "carro") {
      if (a === day) ev.push({ it, k: "ret", hora: it.hora || "", label: "Retirada" });
      if (b === day && b !== a) ev.push({ it, k: "dev", hora: it.horaFim || "", label: "Devolução" });
    } else if (a === day) ev.push({ it, k: "x", hora: it.hora || "", label: it.tipo === "voo" ? it.local || "" : "" });
  });
  ev.sort((x, y) => (x.hora || "99").localeCompare(y.hora || "99"));
  return { ev, dorme };
}
function vazio() { return '<div class="empty"><h3>Nada lançado ainda</h3>Use Adicionar, ou Enviar PDF com a confirmação de um voo ou hotel.</div>'; }
function renderTempo(lista) {
  const com = lista.filter((i) => i.data);
  const ds = [S.info && S.info.inicio].concat(com.map((i) => i.data)).filter(Boolean).sort();
  const de = [S.info && S.info.fim].concat(com.map((i) => i.dataFim || i.data)).filter(Boolean).sort();
  if (!ds.length) return vazio();
  const d = pd(ds[0]), fim = pd(de[de.length - 1]), hoje = iso(new Date());
  let h = "", n = 1, guard = 0;
  while (d <= fim && guard++ < 120) {
    const day = iso(d), r = eventosDoDia(day, lista);
    let cid = r.dorme.length ? cidade(r.dorme[0]) : "";
    if (!cid) for (let i = r.ev.length - 1; i >= 0; i--) { const c = cidade(r.ev[i].it); if (c) { cid = c; break; } }
    const tipos = {}; r.ev.forEach((e) => { tipos[e.it.tipo] = (tipos[e.it.tipo] || 0) + 1; });
    const dots = ORDEM.filter((t) => tipos[t]).map((t) => '<span class="dot t-' + t + '">' + tipos[t] + " " + (tipos[t] > 1 ? PLUR[t] : CURTO[t]) + "</span>").join("");
    const key = "d" + day;
    h += '<details class="day' + (day === hoje ? " today" : "") + '" data-k="' + key + '"' + (S.open[key] ? " open" : "") + "><summary>" +
      '<div class="dnum"><div class="d">' + d.getDate() + '</div><div class="w">' + WD[d.getDay()] + "</div></div>" +
      '<div class="dsum"><div class="city">Dia ' + n + (cid ? " · " + esc(cid) : "") + '</div><div class="icons">' + (dots || '<span class="imeta">Nada marcado</span>') + "</div></div>" + I.chev + "</summary>" +
      '<div class="dbody">' + (r.ev.length ? r.ev.map((e) => itemHTML(e.it, e)).join("") : '<div class="none">Dia livre por enquanto.</div>') +
      r.dorme.map((it) => '<div class="sleep">' + I.bed + "Dorme em: " + esc(it.titulo) + (it.familia && it.familia !== "Geral" ? " (" + esc(it.familia) + ")" : "") + "</div>").join("") +
      '<button class="link" style="margin:0;align-self:flex-start" data-addday="' + day + '">+ adicionar neste dia</button></div></details>';
    d.setDate(d.getDate() + 1); n++;
  }
  const sem = lista.filter((i) => !i.data);
  if (sem.length) h += '<div class="group"><h2>Ideias sem data</h2><span>' + sem.length + '</span></div><div class="list">' + sem.map((it) => itemHTML(it, { k: "sem", hora: "", label: "" })).join("") + "</div>";
  return h;
}
function renderTudo(lista) {
  if (!lista.length) return vazio();
  return ORDEM.filter((t) => lista.some((i) => i.tipo === t)).map((t) => {
    const g = lista.filter((i) => i.tipo === t).sort((a, b) => ((a.data || "9") + (a.hora || "")).localeCompare((b.data || "9") + (b.hora || "")));
    return '<div class="group"><h2>' + NOME[t] + "</h2><span>" + g.length + '</span></div><div class="list">' +
      g.map((it) => itemHTML(it, { k: "tudo", hora: it.data ? fdt(it.data) + (it.dataFim && it.dataFim !== it.data ? " → " + fdt(it.dataFim) : "") : "", label: "" })).join("") + "</div>";
  }).join("");
}
function header() {
  const inf = S.info || {};
  $("hName").textContent = inf.nome || "Viagem";
  $("hDates").textContent = inf.inicio ? fdt(inf.inicio) + " a " + fdtAno(inf.fim) : "Defina as datas em Viagem";
  const hoje = new Date(new Date().toDateString());
  let st = "";
  const dias = inf.inicio ? Math.ceil((pd(inf.inicio) - hoje) / 864e5) : null;
  if (dias != null && dias > 0) st = "Faltam <b>" + dias + " dias</b> · ";
  else if (dias != null && inf.fim && pd(inf.fim) >= hoje) st = "<b>Em viagem</b> · ";
  const c = {}; S.itens.forEach((i) => { c[i.tipo] = (c[i.tipo] || 0) + 1; });
  st += ORDEM.filter((t) => c[t]).map((t) => c[t] + " " + (c[t] > 1 ? PLUR[t] : CURTO[t])).join(" · ") || "nada lançado";
  $("hStatus").innerHTML = st;
  const sel = $("fam");
  if (document.activeElement !== sel) sel.innerHTML = '<option value="">Todas as famílias</option>' + familias().map((f) => "<option" + (f === S.fam ? " selected" : "") + ">" + esc(f) + "</option>").join("");
}
function render() {
  if (!$("out")) return;
  header();
  $("vTempo").setAttribute("aria-pressed", S.view === "tempo");
  $("vTudo").setAttribute("aria-pressed", S.view === "tudo");
  const lista = S.itens.filter(okFam);
  $("out").innerHTML = S.view === "tempo" ? renderTempo(lista) : renderTudo(lista);
  syncToggle();
}
function syncToggle() {
  const all = document.querySelectorAll(S.view === "tempo" ? ".day" : ".it");
  let fechado = false; all.forEach((e) => { if (!e.open) fechado = true; });
  if ($("toggleAll")) $("toggleAll").textContent = fechado ? "Abrir todos" : "Fechar todos";
}

/* ---------- dados ---------- */
function ouvirViagens() {
  if (unsubViagens) unsubViagens();
  S.carregou = false;
  unsubViagens = onSnapshot(query(collection(db, "viagens"), where("membros", "array-contains", email())), (q) => {
    S.viagens = q.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    S.carregou = true;
    const pedida = decodeURIComponent(location.hash.slice(1));
    if (S.vid && !S.viagens.some((v) => v.id === S.vid)) fecharViagem();
    if (!S.vid) {
      if (pedida && S.viagens.some((v) => v.id === pedida)) return abrirViagem(pedida);
      if (S.viagens.length === 1 && !S.saiuDaViagem) return abrirViagem(S.viagens[0].id);
      return telaLista();
    }
    S.info = S.viagens.find((v) => v.id === S.vid) || S.info; render();
  }, (e) => { console.error(e); telaLogin("Não consegui abrir suas viagens. " + erroTexto(e)); });
}
function abrirViagem(id) {
  S.vid = id; S.info = S.viagens.find((v) => v.id === id) || null; S.itens = []; S.fam = ""; S.open = {};
  try { S.fam = localStorage.getItem("v-fam-" + id) || ""; } catch (e) {}
  if (location.hash.slice(1) !== id) history.replaceState(null, "", "#" + encodeURIComponent(id));
  if (unsubItens) unsubItens();
  telaViagem();
  unsubItens = onSnapshot(collection(db, "viagens", id, "itens"), (q) => {
    S.itens = q.docs.map((d) => Object.assign({}, d.data(), { id: d.id })); render();
  }, (e) => { console.error(e); toast(erroTexto(e)); });
}
function fecharViagem() {
  if (unsubItens) unsubItens(); unsubItens = null; S.vid = null; S.info = null; S.itens = []; S.saiuDaViagem = true;
  history.replaceState(null, "", location.pathname); telaLista();
}
const itensRef = () => collection(db, "viagens", S.vid, "itens");
const limpaItem = (it) => { const o = {}; for (const k in it) if (k !== "id" && it[k] !== undefined) o[k] = it[k]; o.atualizadoPor = email(); o.atualizadoEm = serverTimestamp(); return o; };

/* ---------- formulário de item ---------- */
let ED = null;
const fld = (id, label, html, full) => '<label class="f' + (full ? " full" : "") + '" for="' + id + '">' + label + html + "</label>";
function drawEd() {
  const it = ED.it, t = it.tipo;
  const L = { voo: ["Partida", "Chegada"], hosp: ["Check-in", "Check-out"], carro: ["Retirada", "Devolução"] }[t] || ["Data", "Termina em"];
  let h = '<div class="overlay" data-close="1"><div class="sheet" role="dialog" aria-modal="true"><h2>' + (ED.novo ? "Adicionar" : "Editar") + '</h2><form id="edForm" class="fgrid">';
  h += fld("eTipo", "Tipo", '<select id="eTipo" name="tipo">' + ORDEM.map((k) => '<option value="' + k + '"' + (k === t ? " selected" : "") + ">" + TNOME[k] + "</option>").join("") + "</select>");
  h += fld("eFam", "De quem", '<select id="eFam" name="familia"><option value="Geral">Grupo todo</option>' + familias().map((f) => "<option" + (f === it.familia ? " selected" : "") + ">" + esc(f) + "</option>").join("") + "</select>");
  h += fld("eTit", "Nome", '<input id="eTit" name="titulo" required value="' + esc(it.titulo) + '">', 1);
  h += fld("eData", L[0], '<input type="date" id="eData" name="data" value="' + esc(it.data) + '">');
  h += fld("eHora", "Horário", '<input type="time" id="eHora" name="hora" value="' + esc(it.hora) + '">');
  h += fld("eFim", L[1], '<input type="date" id="eFim" name="dataFim" value="' + esc(it.dataFim) + '">');
  h += fld("eHoraFim", "Horário", '<input type="time" id="eHoraFim" name="horaFim" value="' + esc(it.horaFim) + '">');
  h += fld("eLocal", t === "voo" ? "Trecho (ex.: BSB → SCL)" : "Endereço · telefone", '<input id="eLocal" name="local" value="' + esc(it.local) + '">', 1);
  h += fld("eCod", "Código da reserva", '<input id="eCod" name="codigo" value="' + esc(it.codigo) + '">', 1);
  h += fld("eVal", "Valor", '<input type="number" step="0.01" inputmode="decimal" id="eVal" name="valor" value="' + esc(it.valor || "") + '">');
  h += fld("eMoeda", "Moeda", '<select id="eMoeda" name="moeda">' + ["BRL", "CLP", "USD"].map((m) => '<option value="' + m + '"' + ((it.moeda || "BRL") === m ? " selected" : "") + ">" + { BRL: "Real (R$)", CLP: "Peso chileno", USD: "Dólar (US$)" }[m] + "</option>").join("") + "</select>");
  h += '<label class="chk full" for="eConf"><input type="checkbox" id="eConf" name="conf"' + (it.status === "confirmado" ? " checked" : "") + "> Confirmado</label>";
  h += '<label class="chk full" for="ePago"><input type="checkbox" id="ePago" name="pago"' + (it.pago ? " checked" : "") + "> Já foi pago</label>";
  h += fld("eLink", "Link da reserva", '<input type="url" id="eLink" name="link" placeholder="https://" value="' + esc(it.link) + '">', 1);
  h += fld("eObs", "Observações", '<textarea id="eObs" name="obs">' + esc(it.obs) + "</textarea>", 1);
  if (ED.del) h += '<div class="msg full">Excluir "' + esc(it.titulo || "este item") + '" para todo mundo?<div class="acts" style="margin-top:8px"><div class="r"><button type="button" class="btn ghost" id="eDelNao">Cancelar</button><button type="button" class="btn" id="eDelSim">Excluir</button></div></div></div>';
  if (ED.err) h += '<div class="msg full">' + esc(ED.err) + "</div>";
  h += '<div class="acts full">' + (ED.novo ? "" : '<button type="button" class="btn danger" id="eDel"' + (ED.busy ? " disabled" : "") + ">Excluir</button>") +
    '<div class="r"><button type="button" class="btn ghost" data-close="1">Fechar</button><button type="submit" class="btn"' + (ED.busy ? " disabled" : "") + ">" + (ED.busy ? "Salvando…" : "Salvar") + "</button></div></div></form></div></div>";
  $("sheetRoot").innerHTML = h;
}
function readEd() {
  const f = $("edForm"); if (!f) return; const it = ED.it;
  ["tipo", "familia", "titulo", "data", "hora", "dataFim", "horaFim", "local", "codigo", "moeda", "link", "obs"].forEach((k) => { it[k] = f.elements[k].value.trim(); });
  it.valor = +f.elements.valor.value || 0; it.status = f.elements.conf.checked ? "confirmado" : "pendente"; it.pago = f.elements.pago.checked;
}
function abrirEd(id, dia) {
  const old = S.itens.find((x) => x.id === id);
  const it = old ? Object.assign({}, old) : { tipo: "passeio", titulo: "", data: dia || "", hora: "", dataFim: "", horaFim: "", local: "", codigo: "", valor: 0, moeda: "CLP", status: "pendente", pago: false, link: "", obs: "", familia: "Geral" };
  ED = { it, novo: !old, busy: false, err: "", del: false }; drawEd();
}
function fecharSheet() { ED = null; UP = null; CFG = null; $("sheetRoot").innerHTML = ""; }

/* ---------- envio de PDF (Gemini) ---------- */
let UP = null;
function drawUp() {
  const b = UP;
  let h = '<div class="overlay" data-close="1"><div class="sheet" role="dialog" aria-modal="true"><h2>Enviar confirmação</h2>';
  if (!b.props) {
    h += '<div class="pick"><b>Escolher PDF ou print</b>E-mail da companhia aérea, reserva do Booking ou Airbnb, voucher de passeio.<input type="file" id="upFile" multiple accept="application/pdf,image/jpeg,image/png,image/webp"' + (b.busy ? " disabled" : "") + "></div>";
    if (b.files.length) h += '<div class="files">' + b.files.map((f, i) => "<span>" + esc(f.name) + (b.busy ? "" : '<button type="button" data-rm="' + i + '">Tirar</button>') + "</span>").join("") + "</div>";
    h += '<label class="f" for="upNota">Algo a acrescentar? (opcional)<textarea id="upNota" placeholder="Ex.: essa reserva é só do Rodrigo e da Carol"' + (b.busy ? " disabled" : "") + ">" + esc(b.nota) + "</textarea></label>";
    if (b.err) h += '<div class="msg">' + esc(b.err) + "</div>";
    h += '<div class="acts"><span class="hint">' + (b.busy ? "Lendo a confirmação, pode levar até um minuto…" : "Nada entra na viagem antes de você conferir.") + '</span><div class="r"><button type="button" class="btn ghost" data-close="1">Fechar</button><button type="button" class="btn" id="upGo"' + (b.busy || !b.files.length ? " disabled" : "") + ">" + (b.busy ? "Lendo…" : "Ler confirmação") + "</button></div></div>";
  } else {
    const n = b.sel.filter(Boolean).length;
    h += '<p class="hint">Encontrei ' + b.props.length + " item(ns). Desmarque o que não quiser salvar.</p>";
    b.props.forEach((p, i) => {
      const it = p.it, meta = [];
      meta.push(it.dataFim && it.dataFim !== it.data ? fdt(it.data) + " → " + fdt(it.dataFim) : fdt(it.data) || "Sem data");
      if (it.hora) meta.push(it.hora); if (it.local) meta.push(it.local); if (it.codigo) meta.push("Cód. " + it.codigo); if (it.valor) meta.push(money(it.valor, it.moeda));
      meta.push(it.familia === "Geral" ? "Grupo todo" : it.familia);
      h += '<label class="prop t-' + esc(it.tipo) + (b.sel[i] ? "" : " off") + '" for="pp' + i + '"><input type="checkbox" id="pp' + i + '" data-pi="' + i + '"' + (b.sel[i] ? " checked" : "") + '><span class="ico">' + (I[it.tipo] || I.nota) + '</span><span class="imain">' +
        (p.substitui ? '<span class="tagupd">Atualiza: ' + esc(p.substitui.titulo) + "</span>" : '<span class="tagnew">Novo</span>') +
        '<div class="ititle">' + esc(it.titulo) + '</div><div class="imeta">' + esc(meta.join(" · ")) + "</div>" + (it.obs ? '<div class="imeta">' + esc(it.obs) + "</div>" : "") + "</span></label>";
    });
    if (b.err) h += '<div class="msg">' + esc(b.err) + "</div>";
    h += '<div class="acts"><button type="button" class="btn ghost" id="upBack"' + (b.busy ? " disabled" : "") + '>Voltar</button><div class="r"><button type="button" class="btn" id="upSave"' + (n && !b.busy ? "" : " disabled") + ">" + (b.busy ? "Salvando…" : "Salvar " + n) + "</button></div></div>";
  }
  $("sheetRoot").innerHTML = h + "</div></div>";
}
const lerNota = () => { const t = $("upNota"); if (t && UP) UP.nota = t.value; };
const limpa = (v) => (typeof v === "string" ? v.trim() : "");
function paraBase64(file) {
  return new Promise((ok, err) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = err; r.readAsDataURL(file); });
}
async function organizar() {
  lerNota(); const b = UP; b.busy = true; b.err = ""; drawUp();
  try {
    if (b.files.some((f) => f.size > 18 * 1024 * 1024)) throw { code: "grande" };
    const partes = [];
    for (const f of b.files) {
      const tipo = f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : "");
      if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(tipo)) throw { code: "tipo" };
      partes.push({ inlineData: { mimeType: tipo, data: await paraBase64(f) } });
    }
    const inf = S.info || {};
    const exist = S.itens.map((x) => JSON.stringify({ id: x.id, tipo: x.tipo, titulo: x.titulo, data: x.data, codigo: x.codigo || "", familia: x.familia || "" })).join("\n");
    const prompt = "Você organiza uma viagem em grupo (" + (inf.nome || "") + ", " + (inf.inicio || "") + " a " + (inf.fim || "") + "). Leia os arquivos anexos (confirmações de reserva) e extraia cada reserva como um item.\n" +
      "Tipos: voo (cada trecho é um item), hosp (hospedagem), carro (aluguel), passeio, rest (restaurante), nota (outro).\n" +
      'Responda só com JSON: {"itens":[{"substitui":"id de um item existente que esta confirmação atualiza, ou vazio","tipo":"","titulo":"curto em português, ex.: LATAM LA8108 Brasília → Santiago","data":"AAAA-MM-DD","hora":"HH:MM","dataFim":"AAAA-MM-DD","horaFim":"HH:MM","local":"","codigo":"","valor":0,"moeda":"BRL|CLP|USD","confirmado":true,"pago":false,"link":"","obs":"","familia":"Geral"}]}\n' +
      "Regras: data/hora = partida do voo, check-in, retirada do carro ou horário do passeio; dataFim/horaFim = chegada, check-out ou devolução. local = aeroportos (ex.: BSB → SCL) ou endereço · telefone. codigo = localizador ou nº da reserva, com o PIN se houver (ex.: 1234567 (PIN 1234)). valor = total na moeda original, número sem separador de milhar. obs = detalhes úteis e curtos: quartos, passageiros, forma de pagamento, política de cancelamento, quem reservou. familia = Geral se for do grupo todo; senão um destes: " + familias().join(", ") + ". Use substitui quando o código de reserva ou o mesmo voo/hotel já existir na lista. Nunca invente horários, valores ou códigos: deixe vazio ou 0.\n" +
      "ITENS QUE JÁ EXISTEM:\n" + (exist || "(nenhum)") + "\n\n" + (b.nota.trim() ? "OBSERVAÇÃO DE QUEM ENVIOU: " + b.nota.trim() + "\n" : "");
    const model = await getGemini();
    const res = await model.generateContent([prompt].concat(partes));
    let r; try { r = JSON.parse(res.response.text()); } catch (e) { throw { code: "json" }; }
    const arr = r && Array.isArray(r.itens) ? r.itens : [];
    const byId = {}; S.itens.forEach((x) => { byId[x.id] = x; });
    const fams = familias();
    const props = arr.filter((x) => x && ORDEM.indexOf(x.tipo) >= 0).map((x) => {
      const old = byId[limpa(x.substitui)] || null, it = old ? Object.assign({}, old) : {};
      const put = (k, v) => { if (v !== "" && v != null) it[k] = v; else if (!(k in it)) it[k] = ""; };
      it.tipo = x.tipo; put("titulo", limpa(x.titulo));
      ["data", "dataFim"].forEach((k) => { const v = limpa(x[k]); put(k, /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""); });
      ["hora", "horaFim"].forEach((k) => { const v = limpa(x[k]); put(k, /^\d{2}:\d{2}$/.test(v) ? v : ""); });
      put("local", limpa(x.local)); put("codigo", limpa(x.codigo)); put("obs", limpa(x.obs));
      put("link", /^https?:\/\//.test(limpa(x.link)) ? limpa(x.link) : "");
      if (+x.valor > 0) { it.valor = +x.valor; it.moeda = ["BRL", "CLP", "USD"].indexOf(x.moeda) >= 0 ? x.moeda : "BRL"; }
      else if (!("valor" in it)) { it.valor = 0; it.moeda = "BRL"; }
      it.status = old ? old.status || "confirmado" : x.confirmado === false ? "pendente" : "confirmado";
      it.pago = !!(x.pago || (old && old.pago));
      const fam = limpa(x.familia); it.familia = fams.indexOf(fam) >= 0 ? fam : old ? old.familia : "Geral";
      if (!old) it.id = novoId(it);
      return { it, substitui: old };
    });
    if (!UP) return;
    b.busy = false;
    if (!props.length) { b.err = "Não encontrei reservas nesse arquivo. Confira se é a confirmação completa."; drawUp(); return; }
    b.props = props; b.sel = props.map(() => true); drawUp();
  } catch (e) {
    console.error(e); if (!UP) return; b.busy = false;
    const c = (e && e.code) || "", m = String(e && e.message || "");
    b.err = c === "grande" ? "Arquivo grande demais. Envie só as páginas da confirmação."
      : c === "tipo" ? "Use PDF, JPG ou PNG."
      : c === "json" ? "A resposta veio incompleta. Tente com um arquivo por vez."
      : /quota|429|exhausted/i.test(m) ? "O limite gratuito do Gemini acabou por agora. Tente de novo mais tarde."
      : /api-not-enabled|not been used|disabled/i.test(m) ? "A leitura de PDF ainda não foi ligada no Firebase (Firebase AI Logic)."
      : "Não deu para ler agora. Tente de novo em instantes.";
    drawUp();
  }
}
async function salvarUp() {
  const b = UP; b.busy = true; b.err = ""; drawUp();
  try {
    const batch = writeBatch(db); let n = 0;
    b.props.forEach((p, i) => { if (b.sel[i]) { batch.set(doc(itensRef(), p.it.id), limpaItem(p.it)); n++; } });
    await batch.commit(); fecharSheet(); toast(n + " item(ns) salvos na viagem");
  } catch (e) { console.error(e); if (!UP) return; b.busy = false; b.err = erroTexto(e); drawUp(); }
}

/* ---------- configurações da viagem / nova viagem ---------- */
let CFG = null;
function drawCfg() {
  const v = CFG.v, nova = CFG.nova;
  let h = '<div class="overlay" data-close="1"><div class="sheet" role="dialog" aria-modal="true"><h2>' + (nova ? "Nova viagem" : "Viagem") + '</h2><form id="cfgForm" class="fgrid">';
  h += fld("cNome", "Nome", '<input id="cNome" name="nome" required value="' + esc(v.nome) + '">', 1);
  h += fld("cIni", "Ida", '<input type="date" id="cIni" name="inicio" value="' + esc(v.inicio) + '">');
  h += fld("cFim", "Volta", '<input type="date" id="cFim" name="fim" value="' + esc(v.fim) + '">');
  h += fld("cFam", "Famílias ou casais (separados por vírgula)", '<input id="cFam" name="familias" placeholder="Ex.: Thiago e Luana, Rodrigo e Carol" value="' + esc(v.familias) + '">', 1);
  h += fld("cViaj", "Quem vai", '<input id="cViaj" name="viajantes" value="' + esc(v.viajantes) + '">', 1);
  h += fld("cMemb", "E-mails Google que podem ver e editar (um por linha)", '<textarea id="cMemb" name="membros" style="min-height:110px">' + esc((v.membros || [email()]).join("\n")) + "</textarea>", 1);
  h += '<p class="hint full">Quem não estiver nesta lista não consegue abrir a viagem, nem com o link. O seu e-mail fica sempre na lista.</p>';
  if (!nova) {
    h += '<div class="sec full">Importar dados</div><div class="pick full"><b>Escolher arquivo .json</b>Arquivo de importação com itens da viagem (por exemplo, o que veio do Claude).<input type="file" id="cImp" accept="application/json,.json"></div>';
    if (CFG.imp) h += '<p class="hint full">' + esc(CFG.imp) + "</p>";
  }
  if (CFG.err) h += '<div class="msg full">' + esc(CFG.err) + "</div>";
  h += '<div class="acts full">' + (nova ? "" : '<button type="button" class="btn ghost" id="sairBtn2">Sair da conta</button>') +
    '<div class="r"><button type="button" class="btn ghost" data-close="1">Fechar</button><button type="submit" class="btn"' + (CFG.busy ? " disabled" : "") + ">" + (CFG.busy ? "Salvando…" : nova ? "Criar" : "Salvar") + "</button></div></div></form></div></div>";
  $("sheetRoot").innerHTML = h;
}
function readCfg() {
  const f = $("cfgForm"); const v = CFG.v;
  ["nome", "inicio", "fim", "familias", "viajantes"].forEach((k) => { v[k] = f.elements[k].value.trim(); });
  const m = f.elements.membros.value.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  if (m.indexOf(email()) < 0) m.unshift(email());
  v.membros = Array.from(new Set(m));
}
async function salvarCfg() {
  readCfg(); const v = CFG.v;
  if (!v.nome) { CFG.err = "Dê um nome à viagem."; drawCfg(); return; }
  if (v.inicio && v.fim && v.fim < v.inicio) { CFG.err = "A volta está antes da ida."; drawCfg(); return; }
  CFG.busy = true; CFG.err = ""; drawCfg();
  const dados = { nome: v.nome, inicio: v.inicio, fim: v.fim, familias: v.familias, viajantes: v.viajantes, membros: v.membros };
  try {
    if (CFG.nova) {
      const ref = await addDoc(collection(db, "viagens"), Object.assign(dados, { dono: email(), criadoEm: serverTimestamp() }));
      fecharSheet(); S.saiuDaViagem = false; toast("Viagem criada"); setTimeout(() => abrirViagem(ref.id), 300);
    } else { await updateDoc(doc(db, "viagens", S.vid), dados); fecharSheet(); toast("Viagem salva"); }
  } catch (e) { console.error(e); if (!CFG) return; CFG.busy = false; CFG.err = erroTexto(e); drawCfg(); }
}
async function importar(file) {
  try {
    const d = JSON.parse(await file.text());
    const itens = Array.isArray(d) ? d : d.itens || [];
    if (!itens.length) throw new Error("vazio");
    const info = d.info || {};
    if (CFG) {
      readCfg();
      ["nome", "inicio", "fim", "familias", "viajantes"].forEach((k) => { if (!CFG.v[k] && info[k]) CFG.v[k] = info[k]; });
    }
    for (let i = 0; i < itens.length; i += 400) {
      const batch = writeBatch(db);
      itens.slice(i, i + 400).forEach((x) => { const it = Object.assign({}, x); if (!it.id) it.id = novoId(it); batch.set(doc(itensRef(), String(it.id)), limpaItem(it)); });
      await batch.commit();
    }
    if (CFG) { CFG.imp = itens.length + " itens importados. Confira os dados acima e toque em Salvar."; drawCfg(); } else toast(itens.length + " itens importados");
  } catch (e) {
    console.error(e);
    if (CFG) { CFG.imp = e && e.code ? erroTexto(e) : "Esse arquivo não parece um arquivo de importação válido."; drawCfg(); }
  }
}

/* ---------- eventos ---------- */
document.addEventListener("toggle", (e) => { const k = e.target.dataset && e.target.dataset.k; if (k) { S.open[k] = e.target.open; syncToggle(); } }, true);
document.addEventListener("click", async (e) => {
  const t = e.target, c = (sel) => t.closest && t.closest(sel);
  if (c("#loginBtn")) {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (err) {
      if (/popup-blocked|operation-not-supported/.test(err.code || "")) return signInWithRedirect(auth, new GoogleAuthProvider());
      if (!/popup-closed|cancelled-popup/.test(err.code || "")) telaLogin("Não deu para entrar. " + (/unauthorized-domain/.test(err.code || "") ? "Este endereço ainda não foi autorizado no Firebase." : "Tente de novo."));
    }
    return;
  }
  if (c("#sairBtn") || c("#sairBtn2")) { fecharSheet(); return signOut(auth); }
  const ab = c("[data-abrir]"); if (ab) return abrirViagem(ab.dataset.abrir);
  if (c("#voltarBtn")) return fecharViagem();
  if (c("#novaViagem")) { CFG = { nova: true, v: { nome: "", inicio: "", fim: "", familias: "", viajantes: "", membros: [email()] }, busy: false, err: "" }; return drawCfg(); }
  if (c("#cfgBtn")) { CFG = { nova: false, v: Object.assign({}, S.info), busy: false, err: "" }; return drawCfg(); }
  if (c("#vTempo")) { S.view = "tempo"; try { localStorage.setItem("v-view", "tempo"); } catch (x) {} return render(); }
  if (c("#vTudo")) { S.view = "tudo"; try { localStorage.setItem("v-view", "tudo"); } catch (x) {} return render(); }
  if (c("#toggleAll")) {
    const all = document.querySelectorAll(S.view === "tempo" ? ".day" : ".it"), abrir = $("toggleAll").textContent === "Abrir todos";
    all.forEach((el) => { el.open = abrir; S.open[el.dataset.k] = abrir; }); return syncToggle();
  }
  const cp = c("[data-copy]");
  if (cp) { const v = cp.dataset.copy; try { await navigator.clipboard.writeText(v); toast("Código copiado"); } catch (x) { toast(v); } return; }
  const ed = c("[data-edit]"); if (ed) return abrirEd(ed.dataset.edit);
  const ad = c("[data-addday]"); if (ad) return abrirEd(null, ad.dataset.addday);
  if (c("#addBtn")) return abrirEd(null);
  if (c("#upBtn")) { UP = { files: [], nota: "", busy: false, err: "", props: null, sel: [] }; return drawUp(); }

  if (t.dataset && t.dataset.close && (t.classList.contains("overlay") ? e.target === t : true)) {
    if ((ED && ED.busy) || (UP && UP.busy) || (CFG && CFG.busy)) return; return fecharSheet();
  }
  if (ED) {
    if (t.id === "eDel") { readEd(); ED.del = true; return drawEd(); }
    if (t.id === "eDelNao") { readEd(); ED.del = false; return drawEd(); }
    if (t.id === "eDelSim") {
      ED.busy = true; drawEd();
      try { await deleteDoc(doc(itensRef(), ED.it.id)); fecharSheet(); toast("Item excluído"); }
      catch (x) { ED.busy = false; ED.del = false; ED.err = erroTexto(x); drawEd(); }
    }
  }
  if (UP) {
    if (t.dataset && t.dataset.rm != null) { lerNota(); UP.files.splice(+t.dataset.rm, 1); return drawUp(); }
    if (t.id === "upGo") return organizar();
    if (t.id === "upBack") { UP.props = null; UP.err = ""; return drawUp(); }
    if (t.id === "upSave") return salvarUp();
  }
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "fam") { S.fam = t.value; try { localStorage.setItem("v-fam-" + S.vid, S.fam); } catch (x) {} t.blur(); return render(); }
  if (ED && t.id === "eTipo") { readEd(); return drawEd(); }
  if (UP && t.id === "upFile") { lerNota(); UP.files = UP.files.concat(Array.from(t.files || [])).slice(0, 6); UP.err = ""; return drawUp(); }
  if (UP && t.dataset && t.dataset.pi != null) { UP.sel[+t.dataset.pi] = t.checked; return drawUp(); }
  if (CFG && t.id === "cImp" && t.files && t.files[0]) { CFG.imp = "Importando…"; const f = t.files[0]; readCfg(); drawCfg(); return importar(f); }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (CFG && e.target.id === "cfgForm") return salvarCfg();
  if (!ED || e.target.id !== "edForm") return;
  readEd(); const it = ED.it;
  if (!it.titulo) { ED.err = "Dê um nome ao item."; return drawEd(); }
  if (it.data && it.dataFim && it.dataFim < it.data) { ED.err = "A data final está antes da inicial."; return drawEd(); }
  if (!it.id) it.id = novoId(it);
  ED.busy = true; ED.err = ""; drawEd();
  try { await setDoc(doc(itensRef(), it.id), limpaItem(it)); const novo = ED.novo; fecharSheet(); toast(novo ? "Item adicionado" : "Alterações salvas"); }
  catch (x) { console.error(x); if (!ED) return; ED.busy = false; ED.err = erroTexto(x); drawEd(); }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("sheetRoot").innerHTML) fecharSheet(); });
window.addEventListener("hashchange", () => { const id = decodeURIComponent(location.hash.slice(1)); if (id && id !== S.vid && S.viagens.some((v) => v.id === id)) abrirViagem(id); });

/* ---------- início ---------- */
getRedirectResult(auth).catch(() => {});
onAuthStateChanged(auth, (u) => {
  S.user = u;
  if (unsubViagens) { unsubViagens(); unsubViagens = null; }
  if (unsubItens) { unsubItens(); unsubItens = null; }
  S.vid = null; S.viagens = []; S.itens = [];
  if (!u) return telaLogin();
  telaLista(); ouvirViagens();
});
