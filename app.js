import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, addDoc, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js?v=5.1.0";
import { KEYS, transposeContent, semitoneDistance, renderChordMarkup } from "./chord-engine.js?v=5.1.0";
import { drawChordDiagram } from "./chord-diagrams.js?v=5.1.0";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
let db;

try {
  db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (error) {
  console.warn("Cache persistente indispon\u00EDvel. Usando cache tempor\u00E1rio.", error);
  db = getFirestore(firebaseApp);
}
const $ = (id) => document.getElementById(id);

let currentUser = null;
let songs = [];
let lists = [];
let sharedSongs = [];
let groups = [];
let currentGroup = null;
let currentPublicId = "";
let groupRepertoires = [];
let currentRepertoire = null;
let textOnlyMode = false;
let playerTextOnlyMode = false;
let selectedBulkSongs = [];
let editingSong = null;
let editingList = null;
let previewKey = "C";
let fontSize = 18;
let scrollFrame = null;
let listPlayer = { songs: [], index: 0 };
let playerFontSize = 20;
let playerKey = "C";
let playerScrollFrame = null;
let authMode = "login";
let touchStartX = 0;
let isDirty = false;
let viewingSong = null;
let viewingSongReadOnly = false;
let viewerTextOnlyMode = false;
let viewerFontSize = 20;
let viewerKey = "C";
let viewerScrollFrame = null;

const views = ["library", "lists", "groups", "search", "shared", "songViewer", "editor", "listPlayer"];

function resetReaderState(nextView = "") {
  stopAutoScroll();
  stopViewerAutoScroll();
  stopPlayerAutoScroll();

  if (nextView !== "songViewer") {
    const readerShell = $("dedicatedSongViewer")?.closest(".song-reader-shell");
    readerShell?.classList.remove("stage-mode");
    $("readerQuickPanel")?.classList.add("hidden");
  }

  if (nextView !== "listPlayer") {
    $("listPlayerShell")?.classList.remove("stage-mode");
    $("listQuickPanel")?.classList.add("hidden");
  }

  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
}

function showView(name) {
  resetReaderState(name);

  views.forEach((view) => {
    $(`${view}View`).classList.toggle("hidden", view !== name);
  });

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === name);
  });

  closeSidebar();

  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
}

function toast(message) {
  const element = $("toast");
  element.textContent = message;
  element.classList.add("show");
  window.setTimeout(() => element.classList.remove("show"), 2800);
}

function formatDate(value) {
  try {
    return value?.toDate().toLocaleDateString("pt-BR") || "agora";
  } catch {
    return "agora";
  }
}

function safeText(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function windows1252Byte(character) {
  const special = new Map([
    [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83],
    [0x201E, 0x84], [0x2026, 0x85], [0x2020, 0x86],
    [0x2021, 0x87], [0x02C6, 0x88], [0x2030, 0x89],
    [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C],
    [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92],
    [0x201C, 0x93], [0x201D, 0x94], [0x2022, 0x95],
    [0x2013, 0x96], [0x2014, 0x97], [0x02DC, 0x98],
    [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B],
    [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F]
  ]);

  const code = character.codePointAt(0);
  if (code <= 0xFF) return code;
  return special.get(code) ?? null;
}

function decodeBrokenUtf8Once(value) {
  const bytes = [];

  for (const character of String(value)) {
    const byte = windows1252Byte(character);
    if (byte === null) return String(value);
    bytes.push(byte);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(new Uint8Array(bytes));
  } catch {
    return String(value);
  }
}

function repairBrokenText(value = "") {
  let text = String(value ?? "");

  for (let pass = 0; pass < 4; pass += 1) {
    if (!/[\u00C3\u00C2\u00E2\u00F0\u0192\u2021]/.test(text)) break;
    const decoded = decodeBrokenUtf8Once(text);
    if (decoded === text) break;
    text = decoded;
  }

  const sections = [
    [/INTRODU[^A-Z\n]{0,12}O/gi, "INTRODU\u00C7\u00C3O"],
    [/PR[^A-Z\n]{0,8}-REFR[^A-Z\n]{0,8}O/gi, "PR\u00C9-REFR\u00C3O"],
    [/REFR[^A-Z\n]{0,8}O/gi, "REFR\u00C3O"],
    [/INTERL[^A-Z\n]{0,8}DIO/gi, "INTERL\u00DADIO"],
    [/MINISTRA[^A-Z\n]{0,8}O/gi, "MINISTRA\u00C7\u00C3O"],
    [/MODULA[^A-Z\n]{0,8}O/gi, "MODULA\u00C7\u00C3O"],
    [/ESPONT[^A-Z\n]{0,8}NEO/gi, "ESPONT\u00C2NEO"]
  ];

  sections.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  return text
    .replace(/\uFFFD/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trimEnd();
}


let globalSearchFilter = "all";

function normalizeSearchValue(value = "") {
  return repairBrokenText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildGlobalSearchResults(queryText) {
  const queryValue = normalizeSearchValue(queryText);

  if (!queryValue) return [];

  const results = [];

  songs.forEach((song) => {
    const haystack = normalizeSearchValue(
      `${song.title} ${song.artist} ${song.key} ${song.content}`
    );

    if (haystack.includes(queryValue)) {
      results.push({
        type: "songs",
        id: song.id,
        title: repairBrokenText(song.title || "Sem t\u00EDtulo"),
        subtitle: `${repairBrokenText(song.artist || "Artista n\u00E3o informado")} \u2022 Tom ${song.key || "C"}`,
        meta: "Cifra",
        action: "Abrir"
      });
    }
  });

  lists.forEach((list) => {
    const songNames = (list.songSnapshots || [])
      .map((song) => `${song.title || ""} ${song.artist || ""}`)
      .join(" ");

    const haystack = normalizeSearchValue(
      `${list.name || ""} ${list.date || ""} ${songNames}`
    );

    if (haystack.includes(queryValue)) {
      results.push({
        type: "lists",
        id: list.id,
        title: repairBrokenText(list.name || "Lista sem nome"),
        subtitle: `${list.songSnapshots?.length || list.songIds?.length || 0} m\u00FAsica(s)`,
        meta: "Lista",
        action: "Abrir"
      });
    }
  });

  groups.forEach((group) => {
    const haystack = normalizeSearchValue(
      `${group.name || ""} ${group.description || ""}`
    );

    if (haystack.includes(queryValue)) {
      results.push({
        type: "groups",
        id: group.id,
        title: repairBrokenText(group.name || "Grupo sem nome"),
        subtitle: repairBrokenText(group.description || "Sem descri\u00E7\u00E3o"),
        meta: "Grupo",
        action: "Abrir"
      });
    }
  });

  return results;
}

function renderGlobalSearch() {
  const input = $("globalSearchInput");
  const queryValue = input?.value || "";
  const allResults = buildGlobalSearchResults(queryValue);

  const visibleResults = globalSearchFilter === "all"
    ? allResults
    : allResults.filter((item) => item.type === globalSearchFilter);

  $("globalSearchSummary").textContent = queryValue.trim()
    ? `${visibleResults.length} resultado(s) encontrado(s)`
    : "Digite algo para pesquisar.";

  $("globalSearchResults").innerHTML = visibleResults.length
    ? visibleResults.map((item) => `
        <article class="global-search-result">
          <div class="global-search-result-icon">${item.meta[0]}</div>
          <div class="global-search-result-content">
            <span>${safeText(item.meta)}</span>
            <h3>${safeText(item.title)}</h3>
            <p>${safeText(item.subtitle)}</p>
          </div>
          <button
            type="button"
            class="secondary-button"
            data-open-search-result="${item.type}:${item.id}"
          >
            ${safeText(item.action)}
          </button>
        </article>
      `).join("")
    : queryValue.trim()
      ? '<div class="empty-state compact-empty"><h3>Nada encontrado</h3><p>Tente outro t\u00EDtulo, artista ou nome de lista.</p></div>'
      : "";
}

$("globalSearchInput")?.addEventListener("input", renderGlobalSearch);

document.querySelectorAll("[data-search-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    globalSearchFilter = button.dataset.searchFilter;

    document.querySelectorAll("[data-search-filter]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    renderGlobalSearch();
  });
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-search-result]");
  if (!button) return;

  const [type, id] = button.dataset.openSearchResult.split(":");

  if (type === "songs") {
    openSongViewer(id, false);
  } else if (type === "lists") {
    const list = lists.find((item) => item.id === id);
    if (list) openListPlayer(list);
  } else if (type === "groups") {
    openGroupDetails(id);
  }
});

function normalizeSongText(song = {}) {
  return {
    ...song,
    title: repairBrokenText(song.title || ""),
    artist: repairBrokenText(song.artist || ""),
    content: repairBrokenText(song.content || "")
  };
}

function initials(name = "Usu\u00E1rio") {
  const pieces = name.trim().split(/\s+/).filter(Boolean);
  return (pieces[0]?.[0] || "U").toUpperCase();
}

function setDirty(value) {
  isDirty = value;
  $("saveStateText").textContent = value ? "Altera\u00E7\u00F5es n\u00E3o salvas" : "Tudo salvo";
  $("saveStateDot").parentElement.classList.toggle("saved", !value);
}

function firebaseMessage(code) {
  const messages = {
    "auth/invalid-credential": "Senha incorreta ou conta n\u00E3o encontrada. Confira os dados ou recupere sua senha.",
    "auth/wrong-password": "A senha informada est\u00E1 incorreta.",
    "auth/user-not-found": "N\u00E3o encontramos uma conta com esse e-mail.",
    "auth/missing-email": "Digite seu e-mail para recuperar a senha.",
    "auth/email-already-in-use": "Este e-mail j\u00E1 est\u00E1 cadastrado.",
    "auth/weak-password": "Use uma senha com pelo menos 6 caracteres.",
    "auth/invalid-email": "Informe um e-mail v\u00E1lido.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "permission-denied": "Voc\u00EA n\u00E3o tem permiss\u00E3o para realizar esta a\u00E7\u00E3o."
  };
  return messages[code] || "N\u00E3o foi poss\u00EDvel concluir. Tente novamente.";
}

KEYS.forEach((key) => {
  $("songKey").insertAdjacentHTML("beforeend", `<option value="${key}">${key}</option>`);
});

const togglePasswordButton = $("togglePassword");

if (togglePasswordButton) {
  togglePasswordButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const input = $("passwordInput");
    const willShow = input.type === "password";

    input.type = willShow ? "text" : "password";
    togglePasswordButton.textContent = willShow ? "Ocultar" : "Ver";
    togglePasswordButton.setAttribute(
      "aria-label",
      willShow ? "Ocultar senha" : "Mostrar senha"
    );

    input.focus({ preventScroll: true });
    const end = input.value.length;
    input.setSelectionRange(end, end);
  });
}

const forgotPasswordButton = $("forgotPasswordBtn");

if (forgotPasswordButton) {
  forgotPasswordButton.addEventListener("click", async () => {
    const email = $("emailInput").value.trim();

    if (!email) {
      toast("Digite seu e-mail para recuperar a senha.");
      $("emailInput").focus();
      return;
    }

    forgotPasswordButton.disabled = true;
    forgotPasswordButton.textContent = "Enviando...";

    try {
      await sendPasswordResetEmail(auth, email);
      toast("Enviamos um e-mail para voc\u00EA criar uma nova senha.");
    } catch (error) {
      console.error("Erro ao recuperar senha:", error);
      toast(firebaseMessage(error.code));
    } finally {
      forgotPasswordButton.disabled = false;
      forgotPasswordButton.textContent = "Esqueci minha senha";
    }
  });
}

$("toggleAuthMode").onclick = () => {
  authMode = authMode === "login" ? "register" : "login";
  $("nameLabel").classList.toggle("hidden", authMode === "login");
  $("authSubmitBtn").textContent = authMode === "login" ? "Entrar" : "Criar minha conta";
  $("toggleAuthMode").textContent = authMode === "login"
    ? "Criar uma conta gratuita"
    : "J\u00E1 tenho uma conta";
  $("authHint").textContent = authMode === "login"
    ? "Entre usando seu e-mail e sua senha."
    : "Seu repert\u00F3rio ficar\u00E1 salvo somente na sua conta.";
};

$("authForm").onsubmit = async (event) => {
  event.preventDefault();
  const submitButton = $("authSubmitBtn");
  submitButton.disabled = true;
  submitButton.textContent = authMode === "login" ? "Entrando..." : "Criando conta...";

  try {
    const email = $("emailInput").value.trim();
    const password = $("passwordInput").value;

    if (authMode === "register") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const name = $("nameInput").value.trim() || "Usu\u00E1rio";
      await updateProfile(credential.user, { displayName: name });
      await setDoc(doc(db, "users", credential.user.uid), {
        name,
        email,
        createdAt: serverTimestamp()
      });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    toast(firebaseMessage(error.code));
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = authMode === "login" ? "Entrar" : "Criar minha conta";
  }
};

$("logoutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  $("authScreen").classList.toggle("hidden", Boolean(user));
  $("app").classList.toggle("hidden", !user);

  if (!user) return;

  const name = user.displayName || "Usu\u00E1rio";
  const firstName = name.split(/\s+/)[0];
  $("userName").textContent = name;
  $("userEmail").textContent = user.email || "";
  $("profileInitial").textContent = initials(name);
  $("sidebarInitial").textContent = initials(name);
  $("welcomeTitle").textContent = `Ol\u00E1, ${firstName}! O que vamos tocar hoje?`;

  await ensurePublicProfile(user);

  try {
    await handleSharedLink();
  } catch (error) {
    console.error("Erro ao abrir compartilhamento:", error);
  }

  try {
    await loadAll();
  } catch (error) {
    console.error("Erro ao carregar dados da conta:", error);
    toast("Alguns dados n\u00E3o puderam ser carregados. Atualize a p\u00E1gina.");
  }
});


const LOCAL_DATA_VERSION = 1;

function localDataKey(area) {
  return currentUser ? `cifrasIeb:${LOCAL_DATA_VERSION}:${currentUser.uid}:${area}` : "";
}

function serializeLocalValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value.map(serializeLocalValue);
  }

  if (typeof value === "object") {
    if (typeof value.toMillis === "function") {
      return { __localTimestamp: value.toMillis() };
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeLocalValue(item)])
    );
  }

  return value;
}

function restoreLocalValue(value) {
  if (!value || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map(restoreLocalValue);
  }

  if (Object.prototype.hasOwnProperty.call(value, "__localTimestamp")) {
    const millis = Number(value.__localTimestamp) || 0;
    return {
      toMillis: () => millis,
      toDate: () => new Date(millis)
    };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, restoreLocalValue(item)])
  );
}

function saveLocalArea(area, data) {
  const key = localDataKey(area);
  if (!key) return;

  try {
    localStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      data: serializeLocalValue(data)
    }));
  } catch (error) {
    console.warn(`N\u00E3o foi poss\u00EDvel salvar ${area} para uso offline.`, error);
  }
}

function readLocalArea(area) {
  const key = localDataKey(area);
  if (!key) return null;

  try {
    const stored = JSON.parse(localStorage.getItem(key) || "null");
    return stored?.data ? restoreLocalValue(stored.data) : null;
  } catch (error) {
    console.warn(`N\u00E3o foi poss\u00EDvel ler ${area} offline.`, error);
    return null;
  }
}

function hydrateLocalData() {
  const localSongs = readLocalArea("songs");
  const localLists = readLocalArea("lists");
  const localGroups = readLocalArea("groups");
  const localShared = readLocalArea("shared");

  if (Array.isArray(localSongs)) songs = localSongs.map(normalizeSongText);
  if (Array.isArray(localLists)) lists = localLists;
  if (Array.isArray(localGroups)) groups = localGroups;
  if (Array.isArray(localShared)) sharedSongs = localShared.map(normalizeSongText);

  renderSongs($("songSearch")?.value || "");
  renderLists();
  renderGroups();
  renderShared();
  updateStats();
}

async function loadAll() {
  hydrateLocalData();

  const results = await Promise.allSettled([
    loadSongs(),
    loadLists(),
    loadGroups(),
    loadShared()
  ]);

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const areas = ["cifras", "repert\u00F3rios pessoais", "grupos", "compartilhamentos"];
      console.error(`Erro ao carregar ${areas[index]}:`, result.reason);
    }
  });

  updateStats();
  if (!$("searchView")?.classList.contains("hidden")) {
    renderGlobalSearch();
  }

  if (navigator.onLine) {
    await preloadOfflineGroupRepertoires();
    markSuccessfulSync();
  }
}

async function loadSongs() {
  try {
    const snapshot = await getDocs(
      query(collection(db, "songs"), where("ownerId", "==", currentUser.uid))
    );

    songs = snapshot.docs
      .map((item) => normalizeSongText({ id: item.id, ...item.data() }))
      .sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
        const bTime = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

    saveLocalArea("songs", songs);
    renderSongs($("songSearch")?.value || "");
  } catch (error) {
    const cachedSongs = readLocalArea("songs");

    if (Array.isArray(cachedSongs)) {
      songs = cachedSongs.map(normalizeSongText);
      renderSongs($("songSearch")?.value || "");
      updateStats();
      return;
    }
    console.error("Erro ao carregar cifras:", error);

    if (error?.code === "permission-denied") {
      toast("O Firebase bloqueou a leitura das cifras. Verifique as regras.");
    } else {
      toast("N\u00E3o foi poss\u00EDvel carregar as cifras. Atualize a p\u00E1gina e tente novamente.");
    }
  }
}

async function loadLists() {
  try {
    const snapshot = await getDocs(
      query(collection(db, "lists"), where("ownerId", "==", currentUser.uid))
    );

    lists = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
        const bTime = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

    saveLocalArea("lists", lists);
    renderLists();
  } catch (error) {
    console.error(error);
    const cachedLists = readLocalArea("lists");

    if (Array.isArray(cachedLists)) {
      lists = cachedLists;
      renderLists();
      updateStats();
    }
  }
}

async function loadShared() {
  try {
    const snapshot = await getDocs(
      query(collection(db, "shares"), where("viewerIds", "array-contains", currentUser.uid))
    );
    const songIds = [...new Set(snapshot.docs.map((item) => item.data().songId))];

    sharedSongs = (await Promise.all(songIds.map(async (songId) => {
      const result = await getDoc(doc(db, "songs", songId));
      return result.exists()
        ? normalizeSongText({ id: result.id, ...result.data(), readOnly: true })
        : null;
    }))).filter(Boolean);

    saveLocalArea("shared", sharedSongs);
    renderShared();
  } catch (error) {
    console.error(error);
    const cachedShared = readLocalArea("shared");

    if (Array.isArray(cachedShared)) {
      sharedSongs = cachedShared.map(normalizeSongText);
      renderShared();
      updateStats();
    }
  }
}

function updateStats() {
  $("songCount").textContent = songs.length;
  $("listCount").textContent = lists.length;
  $("sharedCount").textContent = sharedSongs.length;
}

function songCard(song, shared = false) {
  song = normalizeSongText(song);

  const title = song.title || "Sem t\u00EDtulo";
  const artist = song.artist || "Artista n\u00E3o informado";
  const key = song.key || "C";

  return `
    <article class="song-row-card">
      <button
        type="button"
        class="song-row-open"
        data-open-song="${song.id}"
        data-shared="${shared}"
      >
        <span class="song-row-key">${safeText(key)}</span>
        <span class="song-row-copy">
          <strong>${safeText(title)}</strong>
          <small>${safeText(artist)} \u2022 Tom ${safeText(key)}</small>
          <em>Atualizada em ${formatDate(song.updatedAt)}</em>
        </span>
        <span class="song-row-arrow" aria-hidden="true">\u203A</span>
      </button>
    </article>`;
}

function renderSongs(filter = "") {
  const term = filter.trim().toLowerCase();
  const visible = songs.filter((song) =>
    `${song.title || ""} ${song.artist || ""}`.toLowerCase().includes(term)
  );

  $("songGrid").innerHTML = visible.map((song) => songCard(song)).join("");
  $("emptyLibrary").classList.toggle("hidden", visible.length > 0 || Boolean(term));
}

function renderShared() {
  $("sharedGrid").innerHTML = sharedSongs.map((song) => songCard(song, true)).join("");
  $("emptyShared").classList.toggle("hidden", sharedSongs.length > 0);
}

function renderLists() {
  $("listGrid").innerHTML = lists.map((list) => {
    const name = repairBrokenText(list.name || "Lista sem nome");
    const amount = list.songIds?.length || list.songSnapshots?.length || 0;
    const dateText = list.date
      ? formatRepertoireDate(list.date)
      : "Data n\u00E3o definida";

    return `
      <article class="repertoire-row-card">
        <button
          type="button"
          class="repertoire-row-main"
          data-play-list="${list.id}"
        >
          <span class="repertoire-row-icon">L</span>
          <span class="repertoire-row-copy">
            <strong>${safeText(name)}</strong>
            <small>${amount} m\u00FAsica(s) \u2022 ${safeText(dateText)}</small>
          </span>
          <span class="song-row-arrow" aria-hidden="true">\u203A</span>
        </button>

        <div class="repertoire-row-actions">
          <button type="button" data-edit-list="${list.id}">Editar</button>
          <button type="button" class="danger-text" data-delete-list="${list.id}">Excluir</button>
        </div>
      </article>`;
  }).join("");

  $("emptyLists").classList.toggle("hidden", lists.length > 0);
}

$("songSearch").oninput = (event) => renderSongs(event.target.value);

document.addEventListener("click", async (event) => {
  const openSongButton = event.target.closest("[data-open-song]");
  if (openSongButton) {
    openSongViewer(
      openSongButton.dataset.openSong,
      openSongButton.dataset.shared === "true"
    );
    return;
  }

  const playListButton = event.target.closest("[data-play-list]");
  if (playListButton) {
    startList(playListButton.dataset.playList);
    return;
  }

  const editListButton = event.target.closest("[data-edit-list]");
  if (editListButton) {
    openListDialog(lists.find((list) => list.id === editListButton.dataset.editList));
    return;
  }

  const deleteListButton = event.target.closest("[data-delete-list]");
  if (deleteListButton) {
    if (confirm("Deseja excluir esta lista?")) {
      await deleteDoc(doc(db, "lists", deleteListButton.dataset.deleteList));
      toast("Lista exclu\u00EDda.");
      await loadLists();
      updateStats();
    }
    return;
  }

  const chordButton = event.target.closest(".chord");
  if (chordButton) {
    showChord(chordButton.dataset.chord);
    return;
  }

  if (event.target.matches("[data-close-dialog]")) {
    event.target.closest("dialog").close();
  }

  if (event.target.closest("[data-new-song]")) openSongEditor();
  if (event.target.closest("[data-new-list]")) openListDialog();
  if (event.target.closest("[data-go-library]")) showView("library");
});

$("newSongBtn").onclick = () => openSongEditor();
$("newListBtn").onclick = () => openListDialog();
$("backToLibrary").onclick = () => {
  if (isDirty && !confirm("Existem altera\u00E7\u00F5es n\u00E3o salvas. Deseja sair mesmo assim?")) return;
  showView("library");
};
$("saveSongBtn").onclick = saveSong;

$("deleteSongBtn").onclick = async () => {
  if (!editingSong?.id || !confirm("Deseja excluir esta cifra permanentemente?")) return;
  await deleteDoc(doc(db, "songs", editingSong.id));
  toast("Cifra exclu\u00EDda.");
  await loadSongs();
  updateStats();
  showView("library");
};


function renderDedicatedSongViewer() {
  if (!viewingSong) return;

  const originalKey = viewingSong.key || "C";
  const semitones = semitoneDistance(originalKey, viewerKey);
  const preferFlats = /b/.test(viewerKey);
  const transposedContent = transposeContent(
    viewingSong.content || "",
    semitones,
    preferFlats
  );

  const content = viewerTextOnlyMode
    ? stripChordMarkup(transposedContent)
    : transposedContent;

  $("viewerSongTitle").textContent =
    repairBrokenText(viewingSong.title || "Sem t\u00EDtulo");
  $("viewerSongArtist").textContent =
    repairBrokenText(viewingSong.artist || "Artista n\u00E3o informado");
  $("viewerCurrentKey").textContent = viewerKey;
  $("viewerSongKeyMeta").textContent = `Tom ${viewerKey}`;
  $("dedicatedSongViewer").style.fontSize = `${viewerFontSize}px`;
  $("dedicatedSongViewer").innerHTML = renderChordMarkup(content);

  const capo = Number(viewingSong.capo) || 0;
  $("viewerCapoBadge").classList.toggle("hidden", capo <= 0);
  $("viewerCapoBadge").textContent = capo > 0 ? `Capotraste ${capo}` : "";
}

function openSongViewer(id, readOnly = false) {
  viewingSong = [...songs, ...sharedSongs].find((song) => song.id === id);
  if (!viewingSong) {
    toast("N\u00E3o foi poss\u00EDvel abrir esta cifra.");
    return;
  }

  viewingSongReadOnly = readOnly;
  viewerTextOnlyMode = false;
  viewerFontSize = 20;
  viewerKey = viewingSong.key || "C";

  $("viewerTextOnlyBtn").textContent = "Somente texto";
  $("viewerTextOnlyBtn").classList.remove("active-mode");
  $("viewerEditBtn").classList.toggle("hidden", readOnly);

  const readerShell = $("dedicatedSongViewer").closest(".song-reader-shell");
  readerShell.classList.remove("stage-mode");
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";

  renderDedicatedSongViewer();
  $("dedicatedSongViewer").scrollTop = 0;
  showView("songViewer");

  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
}

$("viewerBackBtn").onclick = () => {
  showView(viewingSongReadOnly ? "shared" : "library");
};

$("viewerEditBtn").onclick = () => {
  if (!viewingSong || viewingSongReadOnly) return;
  openSongEditor(viewingSong.id, false);
};

$("viewerTransposeUp").onclick = () => changeViewerKey(1);
$("viewerTransposeDown").onclick = () => changeViewerKey(-1);

function changeViewerKey(delta) {
  const scale = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  let index = scale.indexOf(viewerKey);
  if (index < 0) index = 0;
  viewerKey = scale[(index + delta + 12) % 12];
  renderDedicatedSongViewer();
}

$("viewerFontUp").onclick = () => {
  viewerFontSize = Math.min(40, viewerFontSize + 2);
  renderDedicatedSongViewer();
};

$("viewerFontDown").onclick = () => {
  viewerFontSize = Math.max(12, viewerFontSize - 2);
  renderDedicatedSongViewer();
};

$("viewerTextOnlyBtn").onclick = () => {
  viewerTextOnlyMode = !viewerTextOnlyMode;
  $("viewerTextOnlyBtn").textContent =
    viewerTextOnlyMode ? "Mostrar acordes" : "Somente texto";
  $("viewerTextOnlyBtn").classList.toggle("active-mode", viewerTextOnlyMode);
  renderDedicatedSongViewer();
};

$("viewerStageBtn").onclick = () => {
  toggleStageMode($("dedicatedSongViewer").closest(".song-reader-shell"));
};

function getViewerScrollTarget() {
  const shell = $("dedicatedSongViewer")?.closest(".song-reader-shell");
  const viewer = $("dedicatedSongViewer");

  if (shell?.classList.contains("stage-mode")) {
    return {
      get position() { return viewer.scrollTop; },
      get maximum() { return Math.max(0, viewer.scrollHeight - viewer.clientHeight); },
      scrollBy(amount) { viewer.scrollTop += amount; }
    };
  }

  return {
    get position() { return window.scrollY; },
    get maximum() {
      return Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
    },
    scrollBy(amount) { window.scrollBy(0, amount); }
  };
}

$("viewerAutoScrollBtn").onclick = () => {
  if (viewerScrollFrame) {
    stopViewerAutoScroll();
    return;
  }

  const speed = Number($("viewerScrollSpeed").value) || 0.75;
  $("viewerAutoScrollBtn").textContent = "Pausar";
  $("viewerAutoScrollBtn").classList.add("is-scrolling");

  let previousTime = performance.now();

  const step = (currentTime) => {
    const elapsed = Math.min(50, currentTime - previousTime);
    previousTime = currentTime;

    const target = getViewerScrollTarget();
    target.scrollBy(speed * elapsed * 0.055);

    if (target.position >= target.maximum - 2) {
      stopViewerAutoScroll();
      return;
    }

    viewerScrollFrame = requestAnimationFrame(step);
  };

  viewerScrollFrame = requestAnimationFrame(step);
};

function stopViewerAutoScroll() {
  if (viewerScrollFrame) cancelAnimationFrame(viewerScrollFrame);
  viewerScrollFrame = null;

  if ($("viewerAutoScrollBtn")) {
    $("viewerAutoScrollBtn").textContent = "Iniciar";
    $("viewerAutoScrollBtn").classList.remove("is-scrolling");
  }
}

function openSongEditor(id = null, readOnly = false) {
  editingSong = id ? [...songs, ...sharedSongs].find((song) => song.id === id) : null;
  const song = editingSong || {
    title: "",
    artist: "",
    key: "C",
    capo: 0,
    content: ""
  };

  $("songTitle").value = song.title || "";
  $("songArtist").value = song.artist || "";
  $("songKey").value = song.key || "C";
  $("songCapo").value = song.capo || 0;
  $("songContent").value = song.content || "";
  previewKey = song.key || "C";

  ["songTitle", "songArtist", "songKey", "songCapo", "songContent"].forEach((elementId) => {
    $(elementId).disabled = readOnly;
  });

  $("saveSongBtn").classList.toggle("hidden", readOnly);
  $("deleteSongBtn").classList.toggle("hidden", readOnly || !editingSong);
  $("shareBtn").classList.toggle("hidden", readOnly || !editingSong);
  $("importBtn").classList.toggle("hidden", readOnly);

  setDirty(false);
  updatePreview();
  switchEditorTab("edit");
  showView("editor");
}

function updatePreview() {
  const originalKey = $("songKey").value || "C";
  const semitones = semitoneDistance(originalKey, previewKey);
  const preferFlats = /b/.test(previewKey);
  const transposedContent = transposeContent($("songContent").value, semitones, preferFlats);
  const content = textOnlyMode ? stripChordMarkup(transposedContent) : transposedContent;
  const title = $("songTitle").value.trim();
  const artist = $("songArtist").value.trim();

  $("currentKeyLabel").textContent = previewKey;
  $("previewSongTitle").textContent = title || "Pr\u00E9via da cifra";
  $("previewSongArtist").textContent = artist || "A visualiza\u00E7\u00E3o ser\u00E1 atualizada enquanto voc\u00EA digita.";
  $("songPreview").style.fontSize = `${fontSize}px`;

  if (!content.trim()) {
    $("songPreview").innerHTML = `
      <div class="preview-empty">
        <div>
          <strong>Sua cifra aparecer\u00E1 aqui</strong>
          <span>Digite a letra e os acordes no editor.</span>
        </div>
      </div>`;
    return;
  }

  $("songPreview").innerHTML = renderChordMarkup(content);
}



const CHORD_ROOTS = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];

const CHORD_SUFFIX_GROUPS = [
  {
    group: "Maiores",
    suffixes: ["", "7M", "maj7", "6", "add9", "9", "11", "13"]
  },
  {
    group: "Menores",
    suffixes: ["m", "m7", "m6", "m9", "m11", "m13", "m7M"]
  },
  {
    group: "S\u00E9timas",
    suffixes: ["7", "7(9)", "7(11)", "7(13)", "7(b9)", "7(#9)", "7(b5)", "7(#5)"]
  },
  {
    group: "Suspensos",
    suffixes: ["sus2", "sus4", "7sus4", "add2", "add4"]
  },
  {
    group: "Diminutos e aumentados",
    suffixes: ["dim", "dim7", "m7(b5)", "aug", "+", "5"]
  }
];

const MAJOR_FIELD_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_FIELD_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
const CHROMATIC_SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CHROMATIC_FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

let chordLibraryTab = "all";
let selectedChordRoot = "C";
let customChords = [];

function normalizeChordSearch(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function getBuiltInChords() {
  const chords = [];

  CHORD_ROOTS.forEach((root) => {
    CHORD_SUFFIX_GROUPS.forEach((group) => {
      group.suffixes.forEach((suffix) => {
        chords.push({
          name: `${root}${suffix}`,
          root,
          group: group.group,
          custom: false
        });
      });
    });
  });

  return chords;
}

const BUILT_IN_CHORDS = getBuiltInChords();

function loadCustomChords() {
  try {
    const stored = localStorage.getItem("cifrasIebCustomChords");
    const parsed = stored ? JSON.parse(stored) : [];
    customChords = Array.isArray(parsed)
      ? parsed.filter((item) => item && item.name)
      : [];
  } catch (error) {
    console.warn("N\u00E3o foi poss\u00EDvel carregar acordes personalizados:", error);
    customChords = [];
  }
}

function persistCustomChords() {
  try {
    localStorage.setItem(
      "cifrasIebCustomChords",
      JSON.stringify(customChords)
    );
  } catch (error) {
    console.warn("N\u00E3o foi poss\u00EDvel salvar acordes personalizados:", error);
  }
}

function chordButtonHtml(chord, options = {}) {
  const removeButton = options.removable
    ? `<button type="button" class="remove-custom-chord" data-remove-custom-chord="${safeText(chord.name)}" aria-label="Remover ${safeText(chord.name)}">\u00D7</button>`
    : "";

  return `
    <div class="chord-library-item">
      <button
        type="button"
        class="chord-insert-button"
        data-insert-chord="${safeText(chord.name)}"
        title="Inserir [${safeText(chord.name)}]"
      >
        <strong>${safeText(chord.name)}</strong>
        <small>${safeText(chord.group || chord.root || "")}</small>
      </button>
      ${removeButton}
    </div>`;
}

function renderChordLibraryAll() {
  const search = normalizeChordSearch($("chordLibrarySearch")?.value || "");
  const allChords = [...BUILT_IN_CHORDS, ...customChords];

  const visible = allChords
    .filter((chord) => {
      if (!search) return true;
      return normalizeChordSearch(
        `${chord.name} ${chord.root || ""} ${chord.group || ""}`
      ).includes(search);
    })
    .slice(0, search ? 240 : 180);

  $("chordLibraryAllGrid").innerHTML = visible.length
    ? visible.map((chord) => chordButtonHtml(chord)).join("")
    : '<div class="empty-mini">Nenhum acorde encontrado.</div>';
}

function renderChordRootFilter() {
  $("chordRootFilter").innerHTML = CHORD_ROOTS.map((root) => `
    <button
      type="button"
      class="${root === selectedChordRoot ? "active" : ""}"
      data-select-chord-root="${safeText(root)}"
    >${safeText(root)}</button>
  `).join("");
}

function renderChordRootGrid() {
  const search = normalizeChordSearch($("chordLibrarySearch")?.value || "");

  const visible = [...BUILT_IN_CHORDS, ...customChords]
    .filter((chord) => chord.root === selectedChordRoot || chord.name.startsWith(selectedChordRoot))
    .filter((chord) => {
      if (!search) return true;
      return normalizeChordSearch(
        `${chord.name} ${chord.group || ""}`
      ).includes(search);
    });

  $("chordLibraryRootGrid").innerHTML = visible.length
    ? visible.map((chord) => chordButtonHtml(chord)).join("")
    : '<div class="empty-mini">Nenhum acorde neste tom.</div>';
}

function rootToChromaticIndex(root) {
  const aliases = {
    "Db": "C#",
    "Eb": "D#",
    "Gb": "F#",
    "Ab": "G#",
    "Bb": "A#"
  };

  return CHROMATIC_SHARPS.indexOf(aliases[root] || root);
}

function shouldPreferFlats(root) {
  return ["Db", "Eb", "F", "Gb", "Ab", "Bb"].includes(root);
}

function buildHarmonicField(root, mode) {
  const rootIndex = rootToChromaticIndex(root);
  const intervals = mode === "minor"
    ? MINOR_FIELD_INTERVALS
    : MAJOR_FIELD_INTERVALS;

  const scale = shouldPreferFlats(root)
    ? CHROMATIC_FLATS
    : CHROMATIC_SHARPS;

  const degrees = mode === "minor"
    ? [
        { degree: "i", suffix: "m" },
        { degree: "ii\u00B0", suffix: "dim" },
        { degree: "III", suffix: "" },
        { degree: "iv", suffix: "m" },
        { degree: "v", suffix: "m" },
        { degree: "VI", suffix: "" },
        { degree: "VII", suffix: "" }
      ]
    : [
        { degree: "I", suffix: "" },
        { degree: "ii", suffix: "m" },
        { degree: "iii", suffix: "m" },
        { degree: "IV", suffix: "" },
        { degree: "V", suffix: "" },
        { degree: "vi", suffix: "m" },
        { degree: "vii\u00B0", suffix: "dim" }
      ];

  return intervals.map((interval, index) => {
    const note = scale[(rootIndex + interval + 12) % 12];
    return {
      degree: degrees[index].degree,
      name: `${note}${degrees[index].suffix}`,
      group: mode === "minor" ? "Campo menor" : "Campo maior"
    };
  });
}

function renderHarmonicField() {
  const root = $("harmonicFieldRoot").value || "C";
  const mode = $("harmonicFieldMode").value || "major";
  const field = buildHarmonicField(root, mode);

  $("harmonicFieldTitle").textContent =
    `Campo harm\u00F4nico de ${root} ${mode === "minor" ? "menor" : "maior"}`;

  $("harmonicFieldFormula").textContent =
    mode === "minor"
      ? "i \u00B7 ii\u00B0 \u00B7 III \u00B7 iv \u00B7 v \u00B7 VI \u00B7 VII"
      : "I \u00B7 ii \u00B7 iii \u00B7 IV \u00B7 V \u00B7 vi \u00B7 vii\u00B0";

  $("harmonicFieldGrid").innerHTML = field.map((chord) => `
    <button
      type="button"
      class="harmonic-field-card"
      data-insert-chord="${safeText(chord.name)}"
    >
      <span>${safeText(chord.degree)}</span>
      <strong>${safeText(chord.name)}</strong>
      <small>Inserir acorde</small>
    </button>
  `).join("");
}

function renderCustomChords() {
  $("customChordGrid").innerHTML = customChords.length
    ? customChords
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((chord) => chordButtonHtml(chord, { removable: true }))
        .join("")
    : '<div class="empty-mini">Voc\u00EA ainda n\u00E3o criou acordes personalizados.</div>';
}

function switchChordLibraryTab(tab) {
  chordLibraryTab = tab;

  document.querySelectorAll(".chord-library-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.chordTab === tab);
  });

  const panels = {
    all: "chordLibraryAllPanel",
    roots: "chordLibraryRootsPanel",
    fields: "chordLibraryFieldsPanel",
    custom: "chordLibraryCustomPanel"
  };

  Object.entries(panels).forEach(([key, id]) => {
    $(id).classList.toggle("hidden", key !== tab);
  });

  if (tab === "all") renderChordLibraryAll();
  if (tab === "roots") {
    renderChordRootFilter();
    renderChordRootGrid();
  }
  if (tab === "fields") renderHarmonicField();
  if (tab === "custom") renderCustomChords();
}

function insertChordIntoEditor(chordName) {
  const textarea = $("songContent");
  if (!textarea) return;

  const chordMarkup = `[${chordName}]`;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;

  textarea.value =
    textarea.value.slice(0, start) +
    chordMarkup +
    textarea.value.slice(end);

  const cursor = start + chordMarkup.length;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));

  toast(`${chordMarkup} inserido na cifra.`);
}

function openChordLibrary() {
  loadCustomChords();

  $("chordLibrarySearch").value = "";
  selectedChordRoot = "C";

  if (!$("harmonicFieldRoot").options.length) {
    CHORD_ROOTS.forEach((root) => {
      $("harmonicFieldRoot").insertAdjacentHTML(
        "beforeend",
        `<option value="${safeText(root)}">${safeText(root)}</option>`
      );
    });
  }

  switchChordLibraryTab("all");
  $("chordLibraryDialog").showModal();
}

$("openChordLibraryBtn").onclick = openChordLibrary;

document.querySelectorAll(".chord-library-tab").forEach((button) => {
  button.addEventListener("click", () => {
    switchChordLibraryTab(button.dataset.chordTab);
  });
});

$("chordLibrarySearch").addEventListener("input", () => {
  if (chordLibraryTab === "all") renderChordLibraryAll();
  if (chordLibraryTab === "roots") renderChordRootGrid();
});

$("harmonicFieldRoot").addEventListener("change", renderHarmonicField);
$("harmonicFieldMode").addEventListener("change", renderHarmonicField);

$("saveCustomChordBtn").onclick = () => {
  const name = $("customChordName").value
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/\s+/g, "");

  const group = $("customChordGroup").value || "Personalizados";

  if (!name) {
    toast("Digite o nome do acorde.");
    $("customChordName").focus();
    return;
  }

  if (!/^[A-G](?:#|b)?[A-Za-z0-9()+/#\u00B0\u00BA+\-]*$/.test(name)) {
    toast("Use um nome como Cadd9/G, F#m7 ou Bb7M.");
    $("customChordName").focus();
    return;
  }

  const alreadyExists = [...BUILT_IN_CHORDS, ...customChords]
    .some((chord) => chord.name.toLowerCase() === name.toLowerCase());

  if (alreadyExists) {
    toast("Esse acorde j\u00E1 existe na biblioteca.");
    return;
  }

  const rootMatch = name.match(/^[A-G](?:#|b)?/);

  customChords.push({
    name,
    root: rootMatch?.[0] || "",
    group,
    custom: true
  });

  persistCustomChords();
  $("customChordName").value = "";
  renderCustomChords();
  toast(`${name} foi salvo em Meus acordes.`);
};

document.addEventListener("click", (event) => {
  const insertButton = event.target.closest("[data-insert-chord]");
  if (insertButton) {
    insertChordIntoEditor(insertButton.dataset.insertChord);
    $("chordLibraryDialog").close();
    return;
  }

  const rootButton = event.target.closest("[data-select-chord-root]");
  if (rootButton) {
    selectedChordRoot = rootButton.dataset.selectChordRoot;
    renderChordRootFilter();
    renderChordRootGrid();
    return;
  }

  const removeButton = event.target.closest("[data-remove-custom-chord]");
  if (removeButton) {
    const name = removeButton.dataset.removeCustomChord;

    if (!confirm(`Remover o acorde ${name}?`)) return;

    customChords = customChords.filter((chord) => chord.name !== name);
    persistCustomChords();
    renderCustomChords();
    toast("Acorde personalizado removido.");
  }
});

loadCustomChords();

function insertTextAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);

  const needsLeadingBreak = before.length > 0 && !before.endsWith("\n");
  const needsTrailingBreak = after.length > 0 && !after.startsWith("\n");

  const insertion =
    `${needsLeadingBreak ? "\n" : ""}${text}${needsTrailingBreak ? "\n" : ""}`;

  textarea.value = before + insertion + after;

  const cursorPosition = before.length + insertion.length;
  textarea.focus();
  textarea.setSelectionRange(cursorPosition, cursorPosition);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

document.querySelectorAll("[data-insert-section]").forEach((button) => {
  button.addEventListener("click", () => {
    const label = button.dataset.insertSection;
    insertTextAtCursor($("songContent"), `\n::${label}::\n\n`);
  });
});

["songContent", "songKey", "songTitle", "songArtist", "songCapo"].forEach((elementId) => {
  $(elementId).addEventListener("input", () => {
    if (elementId === "songKey") previewKey = $(elementId).value;
    setDirty(true);
    updatePreview();
  });
});

$("transposeUp").onclick = () => changeKey(1);
$("transposeDown").onclick = () => changeKey(-1);

function changeKey(delta) {
  const chromaticScale = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  let index = chromaticScale.indexOf(previewKey);
  if (index < 0) index = 0;
  previewKey = chromaticScale[(index + delta + 12) % 12];
  updatePreview();
}

$("fontUp").onclick = () => {
  fontSize = Math.min(36, fontSize + 2);
  updatePreview();
};

$("fontDown").onclick = () => {
  fontSize = Math.max(12, fontSize - 2);
  updatePreview();
};

async function saveSong() {
  const title = $("songTitle").value.trim();
  const content = $("songContent").value.trim();

  if (!title) {
    toast("Informe o t\u00EDtulo da m\u00FAsica.");
    $("songTitle").focus();
    return;
  }

  if (!content) {
    toast("Digite ou importe o conte\u00FAdo da cifra.");
    $("songContent").focus();
    return;
  }

  const saveButton = $("saveSongBtn");
  saveButton.disabled = true;
  saveButton.textContent = "Salvando...";

  try {
    const data = {
      ownerId: currentUser.uid,
      title: repairBrokenText(title),
      artist: repairBrokenText($("songArtist").value.trim()),
      key: $("songKey").value,
      capo: Number($("songCapo").value) || 0,
      content: repairBrokenText($("songContent").value),
      updatedAt: serverTimestamp()
    };

    if (editingSong?.id) {
      await updateDoc(doc(db, "songs", editingSong.id), data);
    } else {
      data.createdAt = serverTimestamp();
      const reference = await addDoc(collection(db, "songs"), data);
      editingSong = { id: reference.id, ...data };
    }

    setDirty(false);
    await loadSongs();
    updateStats();

    toast("Cifra salva com sucesso!");

    window.setTimeout(() => {
      showView("library");
      editingSong = null;
    }, 650);
  } catch (error) {
    console.error("Erro ao salvar a cifra:", error);

    if (error?.code === "permission-denied") {
      toast("O Firebase bloqueou o salvamento. Verifique as regras.");
    } else if (error?.code === "failed-precondition") {
      toast("O Firestore precisa de um \u00EDndice para concluir esta a\u00E7\u00E3o.");
    } else {
      toast("N\u00E3o foi poss\u00EDvel salvar a cifra. Tente novamente.");
    }
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Salvar cifra";
  }
}

$("importBtn").onclick = () => {
  $("importText").value = $("songContent").value;
  $("importDialog").showModal();
};

$("confirmImportBtn").onclick = () => {
  const importedContent = $("importText").value.trim();
  if (!importedContent) {
    toast("Cole uma cifra antes de importar.");
    return;
  }
  $("songContent").value = importedContent;
  setDirty(true);
  updatePreview();
  $("importDialog").close();
  toast("Cifra importada para o editor.");
};

$("shareBtn").onclick = async () => {
  if (!editingSong?.id) return;

  try {
    const token = crypto.randomUUID().replaceAll("-", "");
    await setDoc(doc(db, "publicShares", token), {
      songId: editingSong.id,
      ownerId: currentUser.uid,
      active: true,
      createdAt: serverTimestamp()
    });

    $("shareLink").value = `${location.origin}${location.pathname}?share=${token}`;
    $("shareDialog").showModal();
  } catch (error) {
    console.error(error);
    toast("N\u00E3o foi poss\u00EDvel gerar o link.");
  }
};

$("copyShareLink").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("shareLink").value);
    toast("Link copiado.");
  } catch {
    $("shareLink").select();
    document.execCommand("copy");
    toast("Link copiado.");
  }
};

async function handleSharedLink() {
  const token = new URLSearchParams(location.search).get("share");
  if (!token) return;

  try {
    const share = await getDoc(doc(db, "publicShares", token));

    if (!share.exists() || !share.data().active) {
      toast("Este link n\u00E3o est\u00E1 mais dispon\u00EDvel.");
      return;
    }

    const data = share.data();
    if (data.ownerId !== currentUser.uid) {
      await setDoc(doc(db, "shares", `${data.songId}_${currentUser.uid}`), {
        songId: data.songId,
        ownerId: data.ownerId,
        viewerIds: arrayUnion(currentUser.uid),
        createdAt: serverTimestamp()
      }, { merge: true });
      toast("Cifra adicionada \u00E0s compartilhadas.");
    }

    history.replaceState({}, document.title, location.pathname);
  } catch (error) {
    console.error(error);
    toast("N\u00E3o foi poss\u00EDvel abrir o compartilhamento.");
  }
}

function showChord(chord) {
  $("chordName").textContent = chord;
  $("chordDiagram").innerHTML = drawChordDiagram(chord);
  $("chordHelp").textContent = "\u00D7 indica uma corda que n\u00E3o deve ser tocada. \u25CB indica corda solta.";
  $("chordDialog").showModal();
}

$("autoScrollBtn").onclick = () => {
  if (scrollFrame) {
    stopAutoScroll();
    return;
  }

  $("autoScrollBtn").textContent = "Pausar";
  let previousTime = performance.now();

  const step = (currentTime) => {
    const difference = (currentTime - previousTime) / 16.67;
    previousTime = currentTime;
    $("songPreview").scrollTop += Number($("scrollSpeed").value) * difference;

    if ($("songPreview").scrollTop + $("songPreview").clientHeight >= $("songPreview").scrollHeight - 2) {
      stopAutoScroll();
      return;
    }

    scrollFrame = requestAnimationFrame(step);
  };

  scrollFrame = requestAnimationFrame(step);
};

function stopAutoScroll() {
  if (scrollFrame) cancelAnimationFrame(scrollFrame);
  scrollFrame = null;
  if ($("autoScrollBtn")) $("autoScrollBtn").textContent = "Iniciar";
}

function switchEditorTab(tab) {
  const isPreview = tab === "preview";

  document.querySelectorAll(".editor-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.editorTab === tab);
  });

  if (window.innerWidth <= 980) {
    $("editorPanel").style.display = isPreview ? "none" : "block";
    $("previewPanel").style.display = isPreview ? "block" : "none";
  } else {
    $("editorPanel").style.display = "";
    $("previewPanel").style.display = "";
  }

  if (isPreview) {
    updatePreview();
    $("songPreview").scrollTop = 0;
  }
}

document.querySelectorAll(".editor-tab").forEach((button) => {
  button.addEventListener("click", () => {
    switchEditorTab(button.dataset.editorTab);
  });
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 980) {
    $("editorPanel").style.display = "";
    $("previewPanel").style.display = "";
  } else {
    const activeTab = document.querySelector(".editor-tab.active")?.dataset.editorTab || "edit";
    switchEditorTab(activeTab);
  }
});

function toggleStageMode(panel) {
  panel.classList.toggle("stage-mode");
  document.body.style.overflow = panel.classList.contains("stage-mode") ? "hidden" : "";
}

$("stageModeBtn").onclick = () => toggleStageMode($("previewPanel"));


function openListDialog(list = null) {
  editingList = list;
  $("listDialogTitle").textContent = list ? "Editar repert\u00F3rio" : "Novo repert\u00F3rio";
  $("listName").value = list?.name || "";
  $("listDate").value = list?.date || new Date().toISOString().slice(0, 10);

  if (!songs.length) {
    $("listSongOptions").innerHTML = `
      <div class="empty-state">
        <p>Crie uma cifra antes de montar uma lista.</p>
      </div>`;
  } else {
    $("listSongOptions").innerHTML = songs.map((song) => `
      <label class="check-row">
        <input type="checkbox" value="${song.id}" ${list?.songIds?.includes(song.id) ? "checked" : ""}>
        <span>${safeText(song.title)} \u2014 ${safeText(song.artist || "Sem artista")}</span>
      </label>
    `).join("");
  }

  $("listDialog").showModal();
}

$("saveListBtn").onclick = async () => {
  const name = $("listName").value.trim();
  const date = $("listDate").value;

  if (!name) {
    toast("Informe o nome do repert\u00F3rio.");
    return;
  }

  if (!date) {
    toast("Selecione a data do repert\u00F3rio.");
    return;
  }

  const songIds = [...$("listSongOptions").querySelectorAll("input:checked")]
    .map((input) => input.value);

  if (!songIds.length) {
    toast("Selecione pelo menos uma m\u00FAsica.");
    return;
  }

  const data = {
    ownerId: currentUser.uid,
    name,
    date,
    songIds,
    updatedAt: serverTimestamp()
  };

  if (editingList) {
    await updateDoc(doc(db, "lists", editingList.id), data);
  } else {
    data.createdAt = serverTimestamp();
    await addDoc(collection(db, "lists"), data);
  }

  $("listDialog").close();
  toast("Repert\u00F3rio pessoal salvo.");
  await loadLists();
  updateStats();
};

function startList(id) {
  const list = lists.find((item) => item.id === id);
  if (!list) return;

  listPlayer.songs = list.songIds.map((songId) => songs.find((song) => song.id === songId)).filter(Boolean);
  listPlayer.index = 0;
  playerFontSize = 20;
  playerTextOnlyMode = false;
  playerKey = listPlayer.songs[0]?.key || "C";
  $("playerTextOnlyBtn").textContent = "Somente texto";
  $("playerTextOnlyBtn").classList.remove("active-mode");

  if (!listPlayer.songs.length) {
    toast("Esta lista est\u00E1 vazia.");
    return;
  }

  renderListSong();
  showView("listPlayer");
}

function renderListSong() {
  const song = listPlayer.songs[listPlayer.index];
  if (!song) return;

  const originalKey = song.key || "C";

  if (!playerKey) {
    playerKey = originalKey;
  }

  const semitones = semitoneDistance(originalKey, playerKey);
  const preferFlats = /b/.test(playerKey);
  const transposedContent = transposeContent(
    song.content || "",
    semitones,
    preferFlats
  );

  const content = playerTextOnlyMode
    ? stripChordMarkup(transposedContent)
    : transposedContent;

  $("listProgress").textContent =
    `${listPlayer.index + 1} de ${listPlayer.songs.length} \u2022 ${song.title}`;

  $("playerCurrentKey").textContent = playerKey;
  $("listPlayerSong").style.fontSize = `${playerFontSize}px`;

  $("listPlayerSong").innerHTML = `
    <h1>${safeText(song.title)}</h1>
    <p class="muted">
      ${safeText(song.artist || "Artista n\u00E3o informado")}
      \u2022 Tom ${safeText(playerKey)}
      ${Number(song.capo) > 0 ? ` \u2022 Capotraste ${Number(song.capo)}` : ""}
    </p>
    ${renderChordMarkup(content)}
  `;

  $("prevListSong").disabled = listPlayer.index === 0;
  $("nextListSong").disabled =
    listPlayer.index === listPlayer.songs.length - 1;

  $("listPlayerSong").scrollTop = 0;
  stopPlayerAutoScroll();
}

function moveList(direction) {
  const nextIndex = listPlayer.index + direction;

  if (nextIndex < 0 || nextIndex >= listPlayer.songs.length) {
    return;
  }

  listPlayer.index = nextIndex;
  playerKey = listPlayer.songs[nextIndex]?.key || "C";
  renderListSong();
}

$("prevListSong").onclick = () => moveList(-1);
$("nextListSong").onclick = () => moveList(1);
$("exitListPlayer").onclick = () => {
  stopPlayerAutoScroll();

  const shell = $("listPlayerShell");
  shell.classList.remove("stage-mode");
  document.body.style.overflow = "";
  $("playerStageMode").textContent = "Tela cheia";

  showView("lists");
};

$("listPlayerSong").addEventListener("touchstart", (event) => {
  touchStartX = event.changedTouches[0].screenX;
}, { passive: true });

$("listPlayerSong").addEventListener("touchend", (event) => {
  const difference = event.changedTouches[0].screenX - touchStartX;
  if (Math.abs(difference) > 65) moveList(difference < 0 ? 1 : -1);
}, { passive: true });

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.onclick = () => showView(button.dataset.view);
});

$("menuBtn").onclick = () => {
  $("sidebar").classList.toggle("open");
  $("sidebarBackdrop").classList.toggle("hidden");
};

$("profileBtn").onclick = $("menuBtn").onclick;
$("sidebarBackdrop").onclick = closeSidebar;

function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("sidebarBackdrop").classList.add("hidden");
}



function generateStablePublicId(uid = "") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let hash = 2166136261;

  for (const character of uid) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  let value = "IEB-";
  let state = hash >>> 0;

  for (let index = 0; index < 6; index += 1) {
    state = Math.imul(state ^ (state >>> 13), 2246822519) >>> 0;
    value += alphabet[state % alphabet.length];
  }

  return value;
}

function showPublicId(publicId, status = "ID pronto para compartilhar.") {
  currentPublicId = publicId;
  $("userPublicId").textContent = publicId;
  $("groupPageUserId").textContent = publicId;

  const statusElement = $("publicIdStatus");
  if (statusElement) statusElement.textContent = status;
}

async function ensurePublicProfile(user) {
  const fallbackPublicId = generateStablePublicId(user.uid);

  // Mostra o ID imediatamente. A tela nunca fica presa em "gerando".
  showPublicId(fallbackPublicId, "Sincronizando seu ID com o Firebase...");

  const userReference = doc(db, "users", user.uid);
  const profileReference = doc(db, "publicProfiles", user.uid);

  try {
    const [userSnapshot, profileSnapshot] = await Promise.all([
      getDoc(userReference),
      getDoc(profileReference)
    ]);

    const savedPublicId =
      userSnapshot.data()?.publicId ||
      profileSnapshot.data()?.publicId ||
      fallbackPublicId;

    const name =
      user.displayName ||
      userSnapshot.data()?.name ||
      profileSnapshot.data()?.name ||
      "Usu\u00E1rio";

    showPublicId(savedPublicId, "ID pronto para compartilhar.");

    await Promise.all([
      setDoc(userReference, {
        name,
        email: user.email || "",
        publicId: savedPublicId,
        updatedAt: serverTimestamp()
      }, { merge: true }),

      setDoc(profileReference, {
        uid: user.uid,
        publicId: savedPublicId,
        name,
        updatedAt: serverTimestamp()
      }, { merge: true })
    ]);

    showPublicId(savedPublicId, "ID sincronizado com sucesso.");
  } catch (error) {
    console.error("Erro ao sincronizar ID p\u00FAblico:", error);
    showPublicId(
      fallbackPublicId,
      "O ID est\u00E1 dispon\u00EDvel neste aparelho, mas verifique as regras do Firestore para usar grupos."
    );

    if (error.code === "permission-denied") {
      toast("Seu ID foi gerado, mas o Firebase bloqueou a sincroniza\u00E7\u00E3o. Atualize as regras enviadas na V3.");
    }
  }
}

async function copyPublicId() {
  if (!currentPublicId) return;
  try {
    await navigator.clipboard.writeText(currentPublicId);
    toast("ID copiado!");
  } catch {
    toast(`Seu ID \u00e9 ${currentPublicId}`);
  }
}

$("copyUserIdBtn").onclick = copyPublicId;
$("copyGroupPageUserId").onclick = copyPublicId;

async function loadGroups() {
  try {
    const snapshot = await getDocs(
      query(collection(db, "groups"), where("memberIds", "array-contains", currentUser.uid))
    );
    groups = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    groups.sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
    saveLocalArea("groups", groups);
    renderGroups();
  } catch (error) {
    console.error("Erro ao carregar grupos:", error);
    const cachedGroups = readLocalArea("groups");

    if (Array.isArray(cachedGroups)) {
      groups = cachedGroups;
      renderGroups();
      return;
    }

    toast("N\u00e3o foi poss\u00edvel carregar os grupos.");
  }
}

function renderGroups(searchTerm = "") {
  const queryText = repairBrokenText(searchTerm).trim().toLowerCase();
  const filteredGroups = groups.filter((group) => {
    const haystack = `${group.name || ""} ${group.description || ""}`.toLowerCase();
    return !queryText || haystack.includes(queryText);
  });

  const uniqueMembers = new Set(
    groups.flatMap((group) => group.memberIds || [])
  );

  if ($("groupsSummaryCount")) $("groupsSummaryCount").textContent = groups.length;
  if ($("groupsSummaryMembers")) $("groupsSummaryMembers").textContent = uniqueMembers.size;
  if ($("groupsSummaryOwned")) {
    $("groupsSummaryOwned").textContent = groups.filter(
      (group) => group.ownerId === currentUser?.uid
    ).length;
  }

  $("groupGrid").innerHTML = filteredGroups.map((group, index) => {
    const isOwner = group.ownerId === currentUser.uid;
    const memberCount = group.memberIds?.length || 1;
    const initial = (group.name || "G").trim().charAt(0).toUpperCase();

    return `
      <article class="professional-group-card">
        <div class="group-card-accent"></div>
        <div class="group-card-top">
          <div class="group-card-avatar">${safeText(initial)}</div>
          <span class="group-access-badge ${isOwner ? "owner" : ""}">
            ${isOwner ? "Respons\u00E1vel" : "Membro"}
          </span>
        </div>

        <div class="group-card-copy">
          <span class="group-card-index">EQUIPE ${String(index + 1).padStart(2, "0")}</span>
          <h3>${safeText(group.name || "Grupo sem nome")}</h3>
          <p>${safeText(group.description || "Equipe organizada no Cifras IEB.")}</p>
        </div>

        <div class="group-card-metrics">
          <div>
            <strong>${memberCount}</strong>
            <span>${memberCount === 1 ? "membro" : "membros"}</span>
          </div>
          <div>
            <strong>${isOwner ? "Admin" : "Ativo"}</strong>
            <span>seu acesso</span>
          </div>
        </div>

        <button class="group-open-button" data-open-group="${group.id}">
          <span>Abrir painel</span>
          <span>\u2192</span>
        </button>
      </article>
    `;
  }).join("");

  $("emptyGroups").classList.toggle("hidden", groups.length > 0);

  if (groups.length && !filteredGroups.length) {
    $("groupGrid").innerHTML = `
      <div class="groups-search-empty">
        <strong>Nenhum grupo encontrado</strong>
        <span>Tente buscar usando outro nome.</span>
      </div>
    `;
  }
}

$("groupSearchInput")?.addEventListener("input", (event) => {
  renderGroups(event.target.value);
});

function openGroupDialog() {
  $("groupNameInput").value = "";
  $("groupDescriptionInput").value = "";
  $("groupDialog").showModal();
}

$("newGroupBtn").onclick = openGroupDialog;
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-new-group]")) openGroupDialog();

  const openGroupButton = event.target.closest("[data-open-group]");
  if (openGroupButton) openGroupDetails(openGroupButton.dataset.openGroup);
});

$("saveGroupBtn").onclick = async () => {
  const name = $("groupNameInput").value.trim();
  const description = $("groupDescriptionInput").value.trim();

  if (!name) {
    toast("Informe o nome do grupo.");
    return;
  }

  const button = $("saveGroupBtn");
  button.disabled = true;
  button.textContent = "Criando...";

  try {
    await addDoc(collection(db, "groups"), {
      name,
      description,
      ownerId: currentUser.uid,
      adminIds: [currentUser.uid],
      memberIds: [currentUser.uid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    $("groupDialog").close();
    toast("Grupo criado com sucesso!");
    await loadGroups();
  } catch (error) {
    console.error(error);
    toast("N\u00e3o foi poss\u00edvel criar o grupo.");
  } finally {
    button.disabled = false;
    button.textContent = "Criar grupo";
  }
};

async function getGroupMembers(group) {
  const ids = group.memberIds || [];
  const profiles = await Promise.all(ids.map(async (uid) => {
    const snapshot = await getDoc(doc(db, "publicProfiles", uid));
    return snapshot.exists()
      ? { uid, ...snapshot.data() }
      : { uid, name: "Usu\u00e1rio", publicId: "ID indispon\u00edvel" };
  }));
  return profiles;
}

async function openGroupDetails(groupId) {
  currentGroup = groups.find((group) => group.id === groupId);
  if (!currentGroup) return;

  const isOwner = currentGroup.ownerId === currentUser.uid;

  $("groupDetailsName").textContent = currentGroup.name || "Grupo";
  $("groupDetailsDescription").textContent = currentGroup.description || "Sem descri\u00e7\u00e3o.";
  $("groupRoleBadge").textContent = isOwner ? "Respons\u00e1vel" : "Membro";
  const memberAmount = currentGroup.memberIds?.length || 0;
  $("groupMemberCount").textContent =
    `${memberAmount} ${memberAmount === 1 ? "membro" : "membros"} na equipe`;
  $("groupOwnerControls").classList.toggle("hidden", !isOwner);
  $("deleteGroupBtn").classList.toggle("hidden", !isOwner);
  $("leaveGroupBtn").classList.toggle("hidden", isOwner);
  $("memberPublicIdInput").value = "";

  $("groupMembersList").innerHTML = '<div class="muted">Carregando membros...</div>';
  $("groupRepertoireList").innerHTML = '<div class="muted">Carregando repert\u00F3rios...</div>';
  $("groupDetailsDialog").showModal();
  await loadGroupRepertoires(currentGroup.id);
  const members = await getGroupMembers(currentGroup);
  $("groupMembersList").innerHTML = members.map((member) => {
    const memberIsOwner = member.uid === currentGroup.ownerId;
    return `
      <div class="group-member-row">
        <div class="member-avatar">${safeText((member.name || "U")[0].toUpperCase())}</div>
        <div class="member-info">
          <strong>${safeText(member.name || "Usu\u00e1rio")}</strong>
          <small>${safeText(member.publicId || "")}</small>
        </div>
        <span class="role-badge">${memberIsOwner ? "Respons\u00e1vel" : "Membro"}</span>
        ${isOwner && !memberIsOwner
          ? `<button class="remove-member-button" data-remove-member="${member.uid}">Remover</button>`
          : ""}
      </div>
    `;
  }).join("");
}

$("addGroupMemberBtn").onclick = async () => {
  if (!currentGroup || currentGroup.ownerId !== currentUser.uid) return;

  const publicId = $("memberPublicIdInput").value.trim().toUpperCase();

  if (!/^IEB-[A-Z0-9]{6}$/.test(publicId)) {
    toast("Digite um ID v\u00e1lido, como IEB-8F4K2Q.");
    return;
  }

  const button = $("addGroupMemberBtn");
  button.disabled = true;
  button.textContent = "Buscando...";

  try {
    const profileQuery = query(
      collection(db, "publicProfiles"),
      where("publicId", "==", publicId)
    );
    const profileSnapshot = await getDocs(profileQuery);

    if (profileSnapshot.empty) {
      toast("Nenhuma pessoa foi encontrada com esse ID.");
      return;
    }

    const profile = profileSnapshot.docs[0].data();
    const uid = profile.uid;

    if (currentGroup.memberIds?.includes(uid)) {
      toast("Essa pessoa j\u00e1 participa do grupo.");
      return;
    }

    await updateDoc(doc(db, "groups", currentGroup.id), {
      memberIds: arrayUnion(uid),
      updatedAt: serverTimestamp()
    });

    toast(`${profile.name || "Pessoa"} foi adicionada ao grupo.`);
    await loadGroups();
    await openGroupDetails(currentGroup.id);
  } catch (error) {
    console.error(error);
    toast("N\u00e3o foi poss\u00edvel adicionar a pessoa.");
  } finally {
    button.disabled = false;
    button.textContent = "Adicionar";
  }
};

document.addEventListener("click", async (event) => {
  const removeButton = event.target.closest("[data-remove-member]");
  if (!removeButton || !currentGroup) return;

  if (!confirm("Deseja remover esta pessoa do grupo?")) return;

  try {
    await updateDoc(doc(db, "groups", currentGroup.id), {
      memberIds: arrayRemove(removeButton.dataset.removeMember),
      adminIds: arrayRemove(removeButton.dataset.removeMember),
      updatedAt: serverTimestamp()
    });

    toast("Pessoa removida do grupo.");
    await loadGroups();
    await openGroupDetails(currentGroup.id);
  } catch (error) {
    console.error(error);
    toast("N\u00e3o foi poss\u00edvel remover a pessoa.");
  }
});

$("leaveGroupBtn").onclick = async () => {
  if (!currentGroup || currentGroup.ownerId === currentUser.uid) return;
  if (!confirm("Deseja sair deste grupo?")) return;

  try {
    await updateDoc(doc(db, "groups", currentGroup.id), {
      memberIds: arrayRemove(currentUser.uid),
      adminIds: arrayRemove(currentUser.uid),
      updatedAt: serverTimestamp()
    });
    $("groupDetailsDialog").close();
    toast("Voc\u00ea saiu do grupo.");
    await loadGroups();
  } catch (error) {
    console.error(error);
    toast("N\u00e3o foi poss\u00edvel sair do grupo.");
  }
};

$("deleteGroupBtn").onclick = async () => {
  if (!currentGroup || currentGroup.ownerId !== currentUser.uid) return;
  if (!confirm("Excluir este grupo permanentemente?")) return;

  try {
    await deleteDoc(doc(db, "groups", currentGroup.id));
    $("groupDetailsDialog").close();
    toast("Grupo exclu\u00eddo.");
    await loadGroups();
  } catch (error) {
    console.error(error);
    toast("N\u00e3o foi poss\u00edvel excluir o grupo.");
  }
};

function normalizeImportedKey(value = "C") {
  const clean = String(value || "C").trim().replace(/\s+/g, "");
  return KEYS.includes(clean) ? clean : "C";
}

function stripChordMarkup(content = "") {
  return String(content)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[ \t]+\n/g, "\n");
}

function looksLikeChordToken(token = "") {
  return /^(?:N\.?C\.?|[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\([^)]+\))?(?:\/[A-G](?:#|b)?)?)$/i.test(token);
}

function looksLikeChordRow(line = "") {
  const tokens = String(line)
    .trim()
    .replace(/[|:]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  return tokens.length > 0 && tokens.every((token) =>
    looksLikeChordToken(token) || /^\(?\d+x\)?$/i.test(token)
  );
}

const IMPORTED_SECTION_NAMES = [
  "intro", "introdu\u00E7\u00E3o", "introducao",
  "primeira parte", "segunda parte", "terceira parte",
  "verso", "verso 1", "verso 2", "verso 3",
  "pr\u00E9-refr\u00E3o", "pre-refrao", "refr\u00E3o", "refrao",
  "ponte", "interl\u00FAdio", "interludio", "solo",
  "pausa", "ministra\u00E7\u00E3o", "ministracao",
  "espont\u00E2neo", "espontaneo", "modula\u00E7\u00E3o", "modulacao",
  "final", "coda"
];

function normalizeImportedSectionLine(line = "") {
  const trimmed = repairBrokenText(line).trim();
  const match = trimmed.match(/^\[([^\]]+)\]$/);

  if (!match) return trimmed;

  const label = match[1].trim();
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const isSection = IMPORTED_SECTION_NAMES.some((name) => {
    const normalizedName = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    return normalized === normalizedName ||
      normalized.startsWith(`${normalizedName} `);
  });

  return isSection ? `::${label.toUpperCase()}::` : trimmed;
}

function normalizeImportedStructure(content = "") {
  const lines = repairBrokenText(content)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(normalizeImportedSectionLine);

  const result = [];
  let previousWasBlank = false;

  lines.forEach((line) => {
    const cleaned = line
      .replace(/[ \t]+$/g, "")
      .replace(/^[ \t]{18,}/, "");

    const isBlank = !cleaned.trim();

    if (isBlank && previousWasBlank) return;

    result.push(cleaned);
    previousWasBlank = isBlank;
  });

  return result.join("\n").trim();
}

function convertChordRowsToBracketMarkup(content = "") {
  const lines = String(content).replace(/\r\n/g, "\n").split("\n");
  const result = [];

  for (let index = 0; index < lines.length; index += 1) {
    const chordLine = lines[index];
    const lyricLine = lines[index + 1];

    if (
      looksLikeChordRow(chordLine) &&
      lyricLine !== undefined &&
      lyricLine.trim() &&
      !looksLikeChordRow(lyricLine)
    ) {
      const chordMatches = [
        ...chordLine.matchAll(
          /[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\([^)]+\))?(?:\/[A-G](?:#|b)?)?|N\.?C\.?/gi
        )
      ];

      let convertedLyric = lyricLine;

      for (let matchIndex = chordMatches.length - 1; matchIndex >= 0; matchIndex -= 1) {
        const match = chordMatches[matchIndex];
        const position = Math.min(match.index || 0, convertedLyric.length);
        convertedLyric =
          convertedLyric.slice(0, position) +
          `[${match[0]}]` +
          convertedLyric.slice(position);
      }

      result.push(convertedLyric);
      index += 1;
      continue;
    }

    result.push(chordLine);
  }

  return result.join("\n");
}

async function extractPdfText(file) {
  const pdfjs = await import(
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs"
  );

  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

  const document = await pdfjs.getDocument({
    data: await file.arrayBuffer()
  }).promise;

  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();

    const rows = new Map();

    content.items.forEach((item) => {
      const y = Math.round(item.transform?.[5] || 0);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({
        x: item.transform?.[4] || 0,
        text: item.str || ""
      });
    });

    const pageText = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, rowItems]) =>
        rowItems
          .sort((a, b) => a.x - b.x)
          .map((item) => item.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean)
      .join("\n");

    pages.push(pageText);
  }

  return pages.join("\n\n");
}

async function extractDocxText(file) {
  const mammothModule = await import(
    "https://cdn.jsdelivr.net/npm/mammoth@1.9.1/+esm"
  );

  // No Safari/iPhone, o pacote pode expor a API dentro de "default".
  const mammoth = mammothModule.default || mammothModule;

  if (typeof mammoth.extractRawText !== "function") {
    throw new Error(
      "O leitor de DOCX n\u00E3o carregou corretamente. Feche a p\u00E1gina e tente novamente."
    );
  }

  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer()
  });

  return result?.value || "";
}

async function readImportedFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";

  if (extension === "pdf" || file.type === "application/pdf") {
    return extractPdfText(file);
  }

  if (
    extension === "docx" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractDocxText(file);
  }

  return file.text();
}

function inferSongFromFile(fileName, rawText) {
  const text = String(rawText || "").replace(/\r\n/g, "\n").trim();
  const baseName = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return [];

  if (fileName.toLowerCase().endsWith(".json")) {
    try {
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : [data];

      return items.map((item, index) => ({
        title: String(item.title || item.titulo || `${baseName} ${index + 1}`).trim(),
        artist: String(item.artist || item.artista || "").trim(),
        key: normalizeImportedKey(item.key || item.tom || "C"),
        capo: Number(item.capo || item.capotraste || 0) || 0,
        content: convertChordRowsToBracketMarkup(
          String(item.content || item.cifra || "").trim()
        ),
        sourceFileName: fileName
      })).filter((song) => song.title && song.content);
    } catch (error) {
      console.warn("JSON inv\u00E1lido:", fileName, error);
    }
  }

  const lines = text.split("\n");
  let title = "";
  let artist = "";
  let key = "C";
  let capo = 0;
  let contentStart = -1;

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (/^t[i\u00ED]tulo\s*:/i.test(trimmed)) {
      title = trimmed.replace(/^t[i\u00ED]tulo\s*:/i, "").trim();
    } else if (/^(artista|minist[e\u00E9]rio)\s*:/i.test(trimmed)) {
      artist = trimmed.replace(/^(artista|minist[e\u00E9]rio)\s*:/i, "").trim();
    } else if (/^tom\s*:/i.test(trimmed)) {
      key = normalizeImportedKey(trimmed.replace(/^tom\s*:/i, "").trim());
    } else if (/^capotraste\s*:/i.test(trimmed)) {
      capo = Number(trimmed.replace(/^capotraste\s*:/i, "").trim()) || 0;
    } else if (/^cifra\s*:/i.test(trimmed)) {
      contentStart = index + 1;
    }
  });

  const metadataPattern =
    /^(t[i\u00ED]tulo|artista|minist[e\u00E9]rio|tom|capotraste)\s*:/i;

  let rawContent = contentStart >= 0
    ? lines.slice(contentStart).join("\n").trim()
    : lines
        .filter((line) => !metadataPattern.test(line.trim()))
        .join("\n")
        .trim();

  // PDFs frequentemente repetem o t\u00EDtulo no come\u00E7o.
  if (!title && lines[0]?.trim()) {
    const firstLine = lines[0].trim();
    if (
      firstLine.length <= 100 &&
      !looksLikeChordRow(firstLine) &&
      !/\[[^\]]+\]/.test(firstLine) &&
      !/^(tom|capotraste|artista|minist\u00E9rio|titulo|t\u00EDtulo)\s*:/i.test(firstLine)
    ) {
      title = firstLine;
      rawContent = lines.slice(1).join("\n").trim();
    }
  }

  const content = normalizeImportedStructure(
    convertChordRowsToBracketMarkup(rawContent)
  );

  return [{
    title: title || baseName || "Cifra importada",
    artist,
    key,
    capo,
    content,
    sourceFileName: fileName
  }].filter((song) => song.content);
}

function setImportProgress(current, total, message) {
  const wrapper = $("bulkImportProgress");
  wrapper.classList.remove("hidden");
  $("bulkImportProgressText").textContent = message;
  $("bulkImportProgressCount").textContent = `${current}/${total}`;
  $("bulkImportProgressBar").style.width =
    `${total ? Math.round((current / total) * 100) : 0}%`;
}

function resetImportProgress() {
  $("bulkImportProgress").classList.add("hidden");
  $("bulkImportProgressBar").style.width = "0%";
}

function renderBulkImportSummary(items, failures = []) {
  const element = $("bulkImportSummary");
  element.classList.remove("hidden");

  const successHtml = items.length
    ? `<strong>${items.length} cifra(s) pronta(s) para importar</strong>
       <div class="bulk-song-list">
         ${items.map((song, index) => `
           <div class="bulk-song-item">
             <span>${index + 1}</span>
             <div>
               <strong>${safeText(song.title)}</strong>
               <small>${safeText(song.sourceFileName)} \u2022 Tom ${safeText(song.key)}</small>
             </div>
           </div>
         `).join("")}
       </div>`
    : "<strong>Nenhuma cifra v\u00E1lida foi encontrada.</strong>";

  const failuresHtml = failures.length
    ? `<div class="import-errors">
         <strong>${failures.length} arquivo(s) n\u00E3o puderam ser lidos</strong>
         ${failures.map((failure) => `
           <small>${safeText(failure.file)}: ${safeText(failure.reason)}</small>
         `).join("")}
       </div>`
    : "";

  element.innerHTML = successHtml + failuresHtml;
}

$("bulkImportBtn").onclick = () => {
  selectedBulkSongs = [];
  $("bulkImportFiles").value = "";
  $("bulkImportSummary").classList.add("hidden");
  $("bulkImportSummary").innerHTML = "";
  resetImportProgress();
  $("bulkImportDialog").showModal();
};

$("bulkImportFiles").addEventListener("change", async (event) => {
  selectedBulkSongs = [];
  const failures = [];
  const files = [...event.target.files];

  if (!files.length) return;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    setImportProgress(
      index,
      files.length,
      `Lendo ${file.name}...`
    );

    try {
      const rawText = await readImportedFile(file);
      const inferredSongs = inferSongFromFile(
        repairBrokenText(file.name),
        repairBrokenText(rawText)
      ).map(normalizeSongText);

      if (!inferredSongs.length) {
        failures.push({
          file: file.name,
          reason: "n\u00E3o foi encontrado texto selecion\u00E1vel; o PDF pode ser uma imagem digitalizada"
        });
      } else {
        selectedBulkSongs.push(...inferredSongs);
      }
    } catch (error) {
      console.error("Erro ao ler arquivo:", file.name, error);
      failures.push({
        file: file.name,
        reason: error?.message || "formato n\u00E3o reconhecido"
      });
    }

    setImportProgress(
      index + 1,
      files.length,
      index + 1 === files.length ? "Leitura conclu\u00EDda" : "Lendo arquivos..."
    );
  }

  renderBulkImportSummary(selectedBulkSongs, failures);
});

$("clearBulkFilesBtn").onclick = () => {
  selectedBulkSongs = [];
  $("bulkImportFiles").value = "";
  $("bulkImportSummary").classList.add("hidden");
  $("bulkImportSummary").innerHTML = "";
  resetImportProgress();
};

$("confirmBulkImportBtn").onclick = async () => {
  if (!selectedBulkSongs.length) {
    toast("Selecione pelo menos um arquivo de cifra.");
    return;
  }

  const button = $("confirmBulkImportBtn");
  button.disabled = true;

  let importedCount = 0;
  let failedCount = 0;

  for (let index = 0; index < selectedBulkSongs.length; index += 1) {
    const song = selectedBulkSongs[index];

    setImportProgress(
      index,
      selectedBulkSongs.length,
      `Salvando ${song.title}...`
    );

    try {
      await addDoc(collection(db, "songs"), {
        ownerId: currentUser.uid,
        title: song.title,
        artist: song.artist,
        key: song.key,
        capo: Math.max(0, Math.min(12, song.capo)),
        content: song.content,
        importedInBulk: true,
        sourceFileName: song.sourceFileName || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      importedCount += 1;
    } catch (error) {
      console.error("Erro ao salvar cifra importada:", error);
      failedCount += 1;
    }

    setImportProgress(
      index + 1,
      selectedBulkSongs.length,
      "Salvando cifras..."
    );
  }

  button.disabled = false;
  setImportProgress(
    selectedBulkSongs.length,
    selectedBulkSongs.length,
    "Importa\u00E7\u00E3o conclu\u00EDda"
  );

  $("songSearch").value = "";
  await loadSongs();
  renderSongs("");
  updateStats();

  if (importedCount > 0) {
    selectedBulkSongs = [];
    $("bulkImportFiles").value = "";
    window.setTimeout(() => $("bulkImportDialog").close(), 450);
    showView("library");

    toast(
      failedCount
        ? `${importedCount} cifra(s) na Biblioteca e ${failedCount} com erro.`
        : `${importedCount} cifra(s) adicionada(s) \u00E0 Biblioteca!`
    );
  } else {
    toast("N\u00E3o foi poss\u00EDvel importar as cifras.");
  }
};

$("textOnlyBtn").onclick=()=>{textOnlyMode=!textOnlyMode;$("textOnlyBtn").textContent=textOnlyMode?"Mostrar acordes":"Somente texto";$("textOnlyBtn").classList.toggle("active-mode",textOnlyMode);updatePreview();};


$("playerTextOnlyBtn").onclick = () => {
  playerTextOnlyMode = !playerTextOnlyMode;

  $("playerTextOnlyBtn").textContent =
    playerTextOnlyMode ? "Mostrar acordes" : "Somente texto";

  $("playerTextOnlyBtn").classList.toggle(
    "active-mode",
    playerTextOnlyMode
  );

  renderListSong();
};

$("playerFontUp").onclick = () => {
  playerFontSize = Math.min(40, playerFontSize + 2);
  renderListSong();
};

$("playerFontDown").onclick = () => {
  playerFontSize = Math.max(12, playerFontSize - 2);
  renderListSong();
};

function changePlayerKey(delta) {
  const scale = [
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B"
  ];

  let index = scale.indexOf(playerKey);
  if (index < 0) index = 0;

  playerKey = scale[(index + delta + 12) % 12];
  renderListSong();
}

$("playerTransposeDown").onclick = () => changePlayerKey(-1);
$("playerTransposeUp").onclick = () => changePlayerKey(1);

function getListScrollTarget() {
  const shell = $("listPlayerShell");
  const viewer = $("listPlayerSong");

  if (shell?.classList.contains("stage-mode")) {
    return {
      get position() { return viewer.scrollTop; },
      get maximum() { return Math.max(0, viewer.scrollHeight - viewer.clientHeight); },
      scrollBy(amount) { viewer.scrollTop += amount; }
    };
  }

  return {
    get position() { return window.scrollY; },
    get maximum() {
      return Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
    },
    scrollBy(amount) { window.scrollBy(0, amount); }
  };
}

$("playerAutoScrollBtn").onclick = () => {
  if (playerScrollFrame) {
    stopPlayerAutoScroll();
    return;
  }

  const speed = Number($("playerScrollSpeed").value) || 0.75;
  $("playerAutoScrollBtn").textContent = "Pausar";
  $("playerAutoScrollBtn").classList.add("is-scrolling");

  let previousTime = performance.now();

  const step = (currentTime) => {
    const elapsed = Math.min(50, currentTime - previousTime);
    previousTime = currentTime;

    const target = getListScrollTarget();
    target.scrollBy(speed * elapsed * 0.055);

    if (target.position >= target.maximum - 2) {
      stopPlayerAutoScroll();
      return;
    }

    playerScrollFrame = requestAnimationFrame(step);
  };

  playerScrollFrame = requestAnimationFrame(step);
};

function stopPlayerAutoScroll() {
  if (playerScrollFrame) cancelAnimationFrame(playerScrollFrame);
  playerScrollFrame = null;

  if ($("playerAutoScrollBtn")) {
    $("playerAutoScrollBtn").textContent = "Iniciar";
    $("playerAutoScrollBtn").classList.remove("is-scrolling");
  }
}

$("playerStageMode").onclick = () => {
  const shell = $("listPlayerShell");
  const entering = !shell.classList.contains("stage-mode");

  shell.classList.toggle("stage-mode", entering);
  document.body.style.overflow = entering ? "hidden" : "";

  $("playerStageMode").textContent =
    entering ? "Sair da tela cheia" : "Tela cheia";
};

async function loadGroupRepertoires(groupId) {
  const cacheArea = `groupRepertoires:${groupId}`;
  const cached = readLocalArea(cacheArea);

  if (Array.isArray(cached)) {
    groupRepertoires = cached;
    renderGroupRepertoires();
  }

  try {
    const snap = await getDocs(
      query(
        collection(db, "groupRepertoires"),
        where("groupId", "==", groupId)
      )
    );

    groupRepertoires = snap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

    saveLocalArea(cacheArea, groupRepertoires);
    renderGroupRepertoires();
  } catch (error) {
    console.error(error);

    if (!Array.isArray(cached)) {
      $("groupRepertoireList").innerHTML =
        '<p class="muted">Este repert\u00F3rio ainda n\u00E3o foi sincronizado neste aparelho.</p>';
    }
  }
}
function formatRepertoireDate(v){if(!v)return"Data n\u00E3o informada";const[y,m,d]=v.split("-");return`${d}/${m}/${y}`;}
function renderGroupRepertoires(){$("groupRepertoireList").innerHTML=groupRepertoires.length?groupRepertoires.map(r=>`<button class="repertoire-card" data-open-repertoire="${r.id}"><span class="repertoire-date">${safeText(formatRepertoireDate(r.date))}</span><strong>${safeText(r.name||"Repert\u00F3rio")}</strong><small>${r.songSnapshots?.length||r.songIds?.length||0} m\u00FAsica(s)</small></button>`).join(""):'<div class="empty-mini">Nenhum repert\u00F3rio criado neste grupo.</div>';}
function renderRepertoireSongOptions(searchTerm = "") {
  const selectedIds = new Set(
    [...$("repertoireSongOptions").querySelectorAll("input:checked")]
      .map((input) => input.value)
  );

  const queryText = repairBrokenText(searchTerm).trim().toLowerCase();
  const filteredSongs = songs.filter((song) => {
    const haystack = `${song.title || ""} ${song.artist || ""} ${song.key || ""}`.toLowerCase();
    return !queryText || haystack.includes(queryText);
  });

  $("repertoireSongOptions").innerHTML = filteredSongs.length
    ? filteredSongs.map((song) => `
        <label class="repertoire-song-option">
          <input type="checkbox" value="${song.id}" ${selectedIds.has(song.id) ? "checked" : ""}>
          <span class="repertoire-option-key">${safeText(song.key || "C")}</span>
          <span class="repertoire-option-copy">
            <strong>${safeText(song.title || "Sem t\u00EDtulo")}</strong>
            <small>${safeText(song.artist || "Artista n\u00E3o informado")}</small>
          </span>
          <span class="repertoire-option-check">\u2713</span>
        </label>
      `).join("")
    : `
      <div class="empty-mini">
        ${songs.length ? "Nenhuma cifra encontrada nessa busca." : "Voc\u00EA ainda n\u00E3o possui cifras."}
      </div>
    `;

  updateRepertoireSelectionCount();
}

function updateRepertoireSelectionCount() {
  const count = $("repertoireSongOptions").querySelectorAll("input:checked").length;
  if ($("repertoireSelectionCount")) {
    $("repertoireSelectionCount").textContent =
      `${count} ${count === 1 ? "selecionada" : "selecionadas"}`;
  }
}

$("newGroupRepertoireBtn").onclick = () => {
  if (!currentGroup) return;

  $("repertoireNameInput").value = "";
  $("repertoireDateInput").value = new Date().toISOString().slice(0, 10);
  $("repertoireSongSearchInput").value = "";
  renderRepertoireSongOptions();
  $("repertoireDialog").showModal();
};

$("repertoireSongSearchInput")?.addEventListener("input", (event) => {
  renderRepertoireSongOptions(event.target.value);
});

$("repertoireSongOptions")?.addEventListener("change", updateRepertoireSelectionCount);

$("clearRepertoireSelectionBtn")?.addEventListener("click", () => {
  $("repertoireSongOptions")
    .querySelectorAll("input:checked")
    .forEach((input) => {
      input.checked = false;
    });

  updateRepertoireSelectionCount();
});
$("saveRepertoireBtn").onclick=async()=>{
  if(!currentGroup)return;

  const name=$("repertoireNameInput").value.trim();
  const date=$("repertoireDateInput").value;
  const songIds=[...$("repertoireSongOptions").querySelectorAll("input:checked")].map(i=>i.value);

  if(!name){toast("Informe o nome do repert\u00F3rio.");return}
  if(!date){toast("Selecione a data.");return}
  if(!songIds.length){toast("Selecione pelo menos uma cifra.");return}

  const songSnapshots=songIds
    .map(id=>songs.find(song=>song.id===id))
    .filter(Boolean)
    .map(song=>({
      sourceSongId:song.id,
      sourceOwnerId:song.ownerId||currentUser.uid,
      title:song.title||"Sem t\u00EDtulo",
      artist:song.artist||"",
      key:song.key||"C",
      capo:Number(song.capo)||0,
      content:song.content||""
    }));

  await addDoc(collection(db,"groupRepertoires"),{
    groupId:currentGroup.id,
    name,
    date,
    songIds,
    songSnapshots,
    createdBy:currentUser.uid,
    createdAt:serverTimestamp(),
    updatedAt:serverTimestamp()
  });

  $("repertoireDialog").close();
  toast("Repert\u00F3rio criado!");
  await loadGroupRepertoires(currentGroup.id);
};

function getCurrentRepertoireSongs() {
  if (!currentRepertoire) return [];

  if (Array.isArray(currentRepertoire.songSnapshots) && currentRepertoire.songSnapshots.length) {
    return currentRepertoire.songSnapshots.map((song, index) => ({
      id: song.sourceSongId || `group-${currentRepertoire.id}-${index}`,
      sourceSongId: song.sourceSongId || "",
      sourceOwnerId: song.sourceOwnerId || "",
      title: song.title || "Sem t\u00EDtulo",
      artist: song.artist || "",
      key: song.key || "C",
      capo: Number(song.capo) || 0,
      content: song.content || "",
      fromGroupRepertoire: true
    }));
  }

  return (currentRepertoire.songIds || [])
    .map((songId) => songs.find((song) => song.id === songId))
    .filter(Boolean);
}

function groupSongAlreadyInLibrary(groupSong) {
  return songs.some((song) =>
    (groupSong.sourceSongId && song.importedFromGroupSongId === groupSong.sourceSongId) ||
    (
      song.title === groupSong.title &&
      song.artist === groupSong.artist &&
      song.content === groupSong.content
    )
  );
}

function openGroupRepertoireAt(index) {
  const repertoireSongs = getCurrentRepertoireSongs();

  if (!repertoireSongs.length) {
    toast("Nenhuma cifra dispon\u00EDvel neste repert\u00F3rio.");
    return;
  }

  listPlayer.songs = repertoireSongs;
  listPlayer.index = Math.max(0, Math.min(index, repertoireSongs.length - 1));
  playerTextOnlyMode = false;
  $("playerTextOnlyBtn").textContent = "Somente texto";
  $("repertoireDetailsDialog").close();
  $("groupDetailsDialog").close();
  renderListSong();
  showView("listPlayer");
}

document.addEventListener("click",(event)=>{
  const button=event.target.closest("[data-open-repertoire]");
  if(!button)return;

  currentRepertoire=groupRepertoires.find((item)=>item.id===button.dataset.openRepertoire);
  if(!currentRepertoire)return;

  $("repertoireDetailsName").textContent=currentRepertoire.name||"Repert\u00F3rio";
  $("repertoireDetailsDate").textContent=formatRepertoireDate(currentRepertoire.date);

  const repertoireSongs=getCurrentRepertoireSongs();

  $("repertoireDetailsSongs").innerHTML=repertoireSongs.length
    ? repertoireSongs.map((song,index)=>{
        const isOwnSong=song.sourceOwnerId===currentUser.uid || songs.some((item)=>item.id===song.sourceSongId);
        const alreadyAdded=groupSongAlreadyInLibrary(song);

        return `
          <div class="group-repertoire-song-card">
            <button class="repertoire-song-row" data-open-repertoire-index="${index}">
              <span>${index+1}</span>
              <div>
                <strong>${safeText(song.title)}</strong>
                <small>${safeText(song.artist||"Sem artista")} \u2022 Tom ${safeText(song.key||"C")}</small>
              </div>
            </button>
            ${isOwnSong
              ? '<span class="library-status">J\u00E1 \u00E9 sua</span>'
              : alreadyAdded
                ? '<span class="library-status added">Adicionada</span>'
                : `<button class="add-to-library-button" data-add-group-song="${index}">Adicionar \u00E0 minha biblioteca</button>`
            }
          </div>
        `;
      }).join("")
    : '<div class="empty-mini">Nenhuma cifra foi encontrada neste repert\u00F3rio.</div>';

  $("repertoireDetailsDialog").showModal();
});
document.addEventListener("click",(event)=>{
  const button=event.target.closest("[data-open-repertoire-index]");
  if(!button)return;
  openGroupRepertoireAt(Number(button.dataset.openRepertoireIndex)||0);
});
$("playGroupRepertoireBtn").onclick=()=>openGroupRepertoireAt(0);

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-add-group-song]");
  if (!button || !currentRepertoire) return;

  const repertoireSongs = getCurrentRepertoireSongs();
  const groupSong = repertoireSongs[Number(button.dataset.addGroupSong)];

  if (!groupSong) {
    toast("N\u00E3o foi poss\u00EDvel localizar essa cifra.");
    return;
  }

  if (groupSongAlreadyInLibrary(groupSong)) {
    toast("Essa cifra j\u00E1 est\u00E1 na sua biblioteca.");
    return;
  }

  button.disabled = true;
  button.textContent = "Adicionando...";

  try {
    await addDoc(collection(db, "songs"), {
      ownerId: currentUser.uid,
      title: groupSong.title,
      artist: groupSong.artist || "",
      key: groupSong.key || "C",
      capo: Number(groupSong.capo) || 0,
      content: groupSong.content || "",
      importedFromGroupId: currentGroup?.id || "",
      importedFromGroupRepertoireId: currentRepertoire.id,
      importedFromGroupSongId: groupSong.sourceSongId || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await loadSongs();
    updateStats();

    button.textContent = "Adicionada";
    button.classList.add("added");
    toast("Cifra adicionada \u00E0 sua biblioteca! Agora voc\u00EA pode edit\u00E1-la.");
  } catch (error) {
    console.error("Erro ao adicionar cifra do grupo:", error);
    button.disabled = false;
    button.textContent = "Adicionar \u00E0 minha biblioteca";
    toast("N\u00E3o foi poss\u00EDvel adicionar a cifra.");
  }
});

$("deleteRepertoireBtn").onclick=async()=>{if(!currentRepertoire||!confirm("Excluir este repert\u00F3rio?"))return;await deleteDoc(doc(db,"groupRepertoires",currentRepertoire.id));$("repertoireDetailsDialog").close();toast("Repert\u00F3rio exclu\u00EDdo.");await loadGroupRepertoires(currentGroup.id);};

window.addEventListener("beforeunload", (event) => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});


document.querySelectorAll("[data-mobile-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.mobileView;
    showView(view);

    document.querySelectorAll("[data-mobile-view]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
  });
});

document.querySelector("[data-mobile-menu]")?.addEventListener("click", () => {
  $("menuBtn")?.click();
});

document.addEventListener("click", (event) => {
  const readerButton = event.target.closest("[data-reader-action]");

  if (readerButton) {
    const action = readerButton.dataset.readerAction;
    const actions = {
      back: () => $("viewerBackBtn")?.click(),
      "key-down": () => $("viewerTransposeDown")?.click(),
      "key-up": () => $("viewerTransposeUp")?.click(),
      scroll: () => $("viewerAutoScrollBtn")?.click(),
      "font-down": () => $("viewerFontDown")?.click(),
      "font-up": () => $("viewerFontUp")?.click(),
      "text-only": () => $("viewerTextOnlyBtn")?.click(),
      fullscreen: () => $("viewerStageBtn")?.click(),
      edit: () => $("viewerEditBtn")?.click(),
      more: () => $("readerQuickPanel")?.classList.toggle("hidden")
    };
    actions[action]?.();
    return;
  }

  const listButton = event.target.closest("[data-list-action]");

  if (listButton) {
    const action = listButton.dataset.listAction;
    const actions = {
      previous: () => $("prevListSong")?.click(),
      next: () => $("nextListSong")?.click(),
      scroll: () => $("playerAutoScrollBtn")?.click(),
      "font-down": () => $("playerFontDown")?.click(),
      "font-up": () => $("playerFontUp")?.click(),
      "text-only": () => $("playerTextOnlyBtn")?.click(),
      fullscreen: () => $("playerStageMode")?.click(),
      exit: () => $("exitListPlayer")?.click(),
      more: () => $("listQuickPanel")?.classList.toggle("hidden")
    };
    actions[action]?.();
  }
});


window.addEventListener("pageshow", () => {
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});

document.addEventListener("touchstart", (event) => {
  const reader = event.target.closest(
    "#songViewerView, #listPlayerView"
  );

  if (!reader) return;

  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
}, { passive: true });


function syncReaderDockScrollState() {
  const button = document.querySelector(
    '[data-reader-action="scroll"]'
  );

  button?.classList.toggle("is-scrolling", Boolean(viewerScrollFrame));
}

function syncListDockScrollState() {
  const button = document.querySelector(
    '[data-list-action="scroll"]'
  );

  button?.classList.toggle("is-scrolling", Boolean(playerScrollFrame));
}

const originalStopViewerAutoScroll = stopViewerAutoScroll;
stopViewerAutoScroll = function() {
  originalStopViewerAutoScroll();
  syncReaderDockScrollState();
};

const originalStopPlayerAutoScroll = stopPlayerAutoScroll;
stopPlayerAutoScroll = function() {
  originalStopPlayerAutoScroll();
  syncListDockScrollState();
};

$("viewerAutoScrollBtn")?.addEventListener("click", () => {
  window.requestAnimationFrame(syncReaderDockScrollState);
});

$("playerAutoScrollBtn")?.addEventListener("click", () => {
  window.requestAnimationFrame(syncListDockScrollState);
});


let deferredInstallPrompt = null;

const OFFLINE_WRITE_SELECTORS = [
  "#newSongBtn",
  "[data-new-song]",
  "#bulkImportBtn",
  "#newListBtn",
  "[data-new-list]",
  "#newGroupBtn",
  "[data-new-group]",
  "#viewerEditBtn",
  "#saveSongBtn",
  "#saveListBtn",
  "#saveGroupBtn",
  "#saveRepertoireBtn",
  "#saveCustomChordBtn",
  "#newGroupRepertoireBtn",
  "#addGroupMemberBtn",
  "#importBulkConfirmBtn"
].join(",");

function isRunningAsInstalledApp() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function formatSyncDate(value) {
  if (!value) return "Ainda n\u00E3o sincronizado";

  const date = new Date(value);

  return `\u00DAltima sincroniza\u00E7\u00E3o: ${date.toLocaleDateString("pt-BR")} \u00E0s ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function markSuccessfulSync() {
  const now = new Date().toISOString();
  localStorage.setItem("cifrasIebLastSync", now);
  updateConnectivityUI();
}

function updateConnectivityUI() {
  const online = navigator.onLine;
  const banner = $("connectivityBanner");
  const statusDot = $("connectionStatusDot");
  const statusText = $("connectionStatusText");
  const lastSyncText = $("lastSyncText");

  document.body.classList.toggle("offline-mode", !online);
  banner?.classList.toggle("hidden", online);

  if (statusDot) statusDot.classList.toggle("offline", !online);
  if (statusText) statusText.textContent = online ? "Online" : "Offline";
  if (lastSyncText) {
    lastSyncText.textContent = formatSyncDate(
      localStorage.getItem("cifrasIebLastSync")
    );
  }

  document.querySelectorAll(OFFLINE_WRITE_SELECTORS).forEach((element) => {
    element.toggleAttribute("disabled", !online);
    element.setAttribute("aria-disabled", String(!online));
  });
}

async function preloadOfflineGroupRepertoires() {
  if (!navigator.onLine || !groups.length) return;

  const tasks = groups.map((group) =>
    getDocs(
      query(
        collection(db, "groupRepertoires"),
        where("groupId", "==", group.id)
      )
    ).catch((error) => {
      console.warn(`N\u00E3o foi poss\u00EDvel preparar o grupo ${group.id} para uso offline.`, error);
      return null;
    })
  );

  await Promise.allSettled(tasks);
}

document.addEventListener("click", (event) => {
  if (navigator.onLine) return;

  const writeTarget = event.target.closest(OFFLINE_WRITE_SELECTORS);

  if (writeTarget) {
    event.preventDefault();
    event.stopImmediatePropagation();
    toast("Conecte-se \u00E0 internet para criar, editar ou sincronizar.");
  }
}, true);

window.addEventListener("online", async () => {
  updateConnectivityUI();
  toast("Conex\u00E3o restaurada. Sincronizando dados...");

  try {
    await loadAll();
    toast("Dados sincronizados com sucesso.");
  } catch (error) {
    console.error("Erro ao sincronizar depois de voltar \u00E0 internet:", error);
  }
});

window.addEventListener("offline", () => {
  updateConnectivityUI();
  toast("Voc\u00EA est\u00E1 offline. O conte\u00FAdo sincronizado continua dispon\u00EDvel.");
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $("installAppBtn")?.classList.add("install-ready");
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  $("installAppDialog")?.close();
  toast("Cifras IEB instalado com sucesso.");
});

$("installAppBtn")?.addEventListener("click", () => {
  const dialog = $("installAppDialog");

  $("androidInstallInstructions").classList.add("hidden");
  $("iosInstallInstructions").classList.add("hidden");
  $("installedAppMessage").classList.add("hidden");

  if (isRunningAsInstalledApp()) {
    $("installedAppMessage").classList.remove("hidden");
  } else if (isIosDevice()) {
    $("iosInstallInstructions").classList.remove("hidden");
  } else {
    $("androidInstallInstructions").classList.remove("hidden");
  }

  dialog.showModal();
});

$("confirmInstallBtn")?.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    toast("Abra o menu do navegador e escolha Instalar aplicativo.");
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        "./service-worker.js?v=5.1.0",
        { scope: "./" }
      );

      registration.update().catch(() => {});
    } catch (error) {
      console.error("N\u00E3o foi poss\u00EDvel registrar o modo offline:", error);
    }
  });
}

updateConnectivityUI();
