import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { KEYS, transposeContent, semitoneDistance, renderChordMarkup } from "./chord-engine.js";
import { drawChordDiagram } from "./chord-diagrams.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
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
let authMode = "login";
let touchStartX = 0;
let isDirty = false;

const views = ["library", "lists", "groups", "shared", "editor", "listPlayer"];

function showView(name) {
  views.forEach((view) => $(`${view}View`).classList.toggle("hidden", view !== name));
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === name);
  });
  stopAutoScroll();
  closeSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
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
    "auth/invalid-credential": "E-mail ou senha inv\u00E1lidos.",
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

$("togglePassword").onclick = () => {
  const input = $("passwordInput");
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  $("togglePassword").textContent = visible ? "Ver" : "Ocultar";
};

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

  await handleSharedLink();
  await loadAll();
});

async function loadAll() {
  await Promise.all([loadSongs(), loadLists(), loadGroups(), loadShared()]);
  updateStats();
}

async function loadSongs() {
  try {
    const snapshot = await getDocs(
      query(collection(db, "songs"), where("ownerId", "==", currentUser.uid), orderBy("updatedAt", "desc"))
    );
    songs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderSongs();
  } catch (error) {
    console.error(error);
    toast("N\u00E3o foi poss\u00EDvel carregar as cifras. Talvez seja necess\u00E1rio criar um \u00EDndice no Firestore.");
  }
}

async function loadLists() {
  try {
    const snapshot = await getDocs(
      query(collection(db, "lists"), where("ownerId", "==", currentUser.uid), orderBy("updatedAt", "desc"))
    );
    lists = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderLists();
  } catch (error) {
    console.error(error);
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
      return result.exists() ? { id: result.id, ...result.data(), readOnly: true } : null;
    }))).filter(Boolean);

    renderShared();
  } catch (error) {
    console.error(error);
  }
}

function updateStats() {
  $("songCount").textContent = songs.length;
  $("listCount").textContent = lists.length;
  $("sharedCount").textContent = sharedSongs.length;
}

function songCard(song, shared = false) {
  return `<article class="card">
    <div>
      <span class="song-card-key">${safeText(song.key || "C")}</span>
      <h3>${safeText(song.title || "Sem t\u00EDtulo")}</h3>
      <p>${safeText(song.artist || "Artista n\u00E3o informado")}</p>
    </div>
    <div>
      <span class="meta">Atualizada em ${formatDate(song.updatedAt)}</span>
      <div class="card-actions">
        <button class="primary" data-open-song="${song.id}" data-shared="${shared}">
          ${shared ? "Visualizar" : "Abrir cifra"}
        </button>
      </div>
    </div>
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
  $("listGrid").innerHTML = lists.map((list) => `
    <article class="card">
      <div>
        <span class="song-card-key">${list.songIds?.length || 0}</span>
        <h3>${safeText(list.name)}</h3>
        <p>${list.date ? `Repert\u00F3rio de ${formatRepertoireDate(list.date)}` : "Repert\u00F3rio sem data definida"}</p>
        <p>${list.songIds?.length || 0} m\u00FAsica(s) neste repert\u00F3rio</p>
      </div>
      <div>
        <span class="meta">Atualizado em ${formatDate(list.updatedAt)}</span>
        <div class="card-actions">
          <button class="primary" data-play-list="${list.id}">Abrir lista</button>
          <button class="secondary-button" data-edit-list="${list.id}">Editar</button>
          <button class="danger-button" data-delete-list="${list.id}">Excluir</button>
        </div>
      </div>
    </article>
  `).join("");

  $("emptyLists").classList.toggle("hidden", lists.length > 0);
}

$("songSearch").oninput = (event) => renderSongs(event.target.value);

document.addEventListener("click", async (event) => {
  const openSongButton = event.target.closest("[data-open-song]");
  if (openSongButton) {
    openSong(openSongButton.dataset.openSong, openSongButton.dataset.shared === "true");
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

  if (event.target.closest("[data-new-song]")) openSong();
  if (event.target.closest("[data-new-list]")) openListDialog();
  if (event.target.closest("[data-go-library]")) showView("library");
});

$("newSongBtn").onclick = () => openSong();
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

function openSong(id = null, readOnly = false) {
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
      title,
      artist: $("songArtist").value.trim(),
      key: $("songKey").value,
      capo: Number($("songCapo").value) || 0,
      content: $("songContent").value,
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

  $("autoScrollBtn").textContent = "\u23F8 Pausar";
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
  if ($("autoScrollBtn")) $("autoScrollBtn").textContent = "\u25B6 Iniciar";
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
$("playerStageMode").onclick = () => toggleStageMode($("listPlayerSong"));

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

  if (!listPlayer.songs.length) {
    toast("Esta lista est\u00E1 vazia.");
    return;
  }

  renderListSong();
  showView("listPlayer");
}

function renderListSong() {
  const song = listPlayer.songs[listPlayer.index];
  $("listProgress").textContent = `${listPlayer.index + 1} de ${listPlayer.songs.length} \u2022 ${song.title}`;
  $("listPlayerSong").innerHTML = `
    <h1>${safeText(song.title)}</h1>
    <p class="muted">${safeText(song.artist || "")} \u2022 Tom ${safeText(song.key || "C")}</p>
    ${playerTextOnlyMode ? safeText(stripChordMarkup(song.content)) : renderChordMarkup(song.content)}
  `;

  $("prevListSong").disabled = listPlayer.index === 0;
  $("nextListSong").disabled = listPlayer.index === listPlayer.songs.length - 1;
  $("listPlayerSong").scrollTop = 0;
}

function moveList(direction) {
  const nextIndex = listPlayer.index + direction;
  if (nextIndex < 0 || nextIndex >= listPlayer.songs.length) return;
  listPlayer.index = nextIndex;
  renderListSong();
}

$("prevListSong").onclick = () => moveList(-1);
$("nextListSong").onclick = () => moveList(1);
$("exitListPlayer").onclick = () => showView("lists");

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



function generatePublicId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "IEB-";
  for (let index = 0; index < 6; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

async function ensurePublicProfile(user) {
  const userReference = doc(db, "users", user.uid);
  const profileReference = doc(db, "publicProfiles", user.uid);
  const [userSnapshot, profileSnapshot] = await Promise.all([
    getDoc(userReference),
    getDoc(profileReference)
  ]);

  let publicId = userSnapshot.exists() ? userSnapshot.data().publicId : "";

  if (!publicId) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generatePublicId();
      const duplicateQuery = query(
        collection(db, "publicProfiles"),
        where("publicId", "==", candidate)
      );
      const duplicateSnapshot = await getDocs(duplicateQuery);

      if (duplicateSnapshot.empty) {
        publicId = candidate;
        break;
      }
    }
  }

  if (!publicId) throw new Error("N\u00e3o foi poss\u00edvel gerar um ID.");

  const name = user.displayName || userSnapshot.data()?.name || "Usu\u00e1rio";

  await setDoc(userReference, {
    name,
    email: user.email || "",
    publicId,
    updatedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(profileReference, {
    uid: user.uid,
    publicId,
    name,
    updatedAt: serverTimestamp()
  }, { merge: true });

  currentPublicId = publicId;
  $("userPublicId").textContent = publicId;
  $("groupPageUserId").textContent = publicId;
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
    renderGroups();
  } catch (error) {
    console.error("Erro ao carregar grupos:", error);
    toast("N\u00e3o foi poss\u00edvel carregar os grupos.");
  }
}

function renderGroups() {
  $("groupGrid").innerHTML = groups.map((group) => {
    const isOwner = group.ownerId === currentUser.uid;
    return `
      <article class="card">
        <div>
          <span class="song-card-key">${group.memberIds?.length || 1}</span>
          <h3>${safeText(group.name || "Grupo sem nome")}</h3>
          <p>${safeText(group.description || "Sem descri\u00e7\u00e3o")}</p>
        </div>
        <div>
          <span class="meta">${isOwner ? "Voc\u00ea \u00e9 o respons\u00e1vel" : "Voc\u00ea participa deste grupo"}</span>
          <div class="card-actions">
            <button class="primary" data-open-group="${group.id}">Abrir grupo</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  $("emptyGroups").classList.toggle("hidden", groups.length > 0);
}

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
  $("groupMemberCount").textContent = `${currentGroup.memberIds?.length || 0} membro(s)`;
  $("groupOwnerControls").classList.toggle("hidden", !isOwner);
  $("deleteGroupBtn").classList.toggle("hidden", !isOwner);
  $("leaveGroupBtn").classList.toggle("hidden", isOwner);
  $("memberPublicIdInput").value = "";

  $("groupMembersList").innerHTML = '<div class="muted">Carregando membros...</div>';
  $("groupRepertoireList").innerHTML = '<div class="muted">Carregando repertÃ³rios...</div>';
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

function normalizeImportedKey(value = "C") { const clean=value.trim().replace(/\s+/g,""); return KEYS.includes(clean)?clean:"C"; }
function stripChordMarkup(content=""){ return content.replace(/\[[^\]]+\]/g,"").replace(/[ \t]+\n/g,"\n"); }
function inferSongFromFile(fileName,rawText){
 const text=rawText.replace(/\r\n/g,"\n").trim(), baseName=fileName.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").trim();
 if(fileName.toLowerCase().endsWith(".json")){try{const data=JSON.parse(text), arr=Array.isArray(data)?data:[data]; return arr.map((item,i)=>({title:String(item.title||item.titulo||`${baseName} ${i+1}`).trim(),artist:String(item.artist||item.artista||"").trim(),key:normalizeImportedKey(String(item.key||item.tom||"C")),capo:Number(item.capo||item.capotraste||0)||0,content:String(item.content||item.cifra||"").trim(),sourceFileName:fileName})).filter(s=>s.title&&s.content);}catch(e){console.warn(e)}}
 const lines=text.split("\n"); let title="",artist="",key="C",capo=0,contentStart=-1;
 lines.forEach((line,i)=>{const t=line.trim(); if(/^t[iÃ­]tulo\s*:/i.test(t))title=t.replace(/^t[iÃ­]tulo\s*:/i,"").trim(); else if(/^(artista|minist[eÃ©]rio)\s*:/i.test(t))artist=t.replace(/^(artista|minist[eÃ©]rio)\s*:/i,"").trim(); else if(/^tom\s*:/i.test(t))key=normalizeImportedKey(t.replace(/^tom\s*:/i,"").trim()); else if(/^capotraste\s*:/i.test(t))capo=Number(t.replace(/^capotraste\s*:/i,"").trim())||0; else if(/^cifra\s*:/i.test(t))contentStart=i+1;});
 const meta=/^(t[iÃ­]tulo|artista|minist[eÃ©]rio|tom|capotraste)\s*:/i; const content=contentStart>=0?lines.slice(contentStart).join("\n").trim():lines.filter(l=>!meta.test(l.trim())).join("\n").trim();
 return [{title:title||baseName||"Cifra importada",artist,key,capo,content,sourceFileName:fileName}].filter(s=>s.content);
}
function renderBulkImportSummary(items){const el=$("bulkImportSummary");el.classList.remove("hidden");el.innerHTML=items.length?`<strong>${items.length} cifra(s) pronta(s) para importar</strong><div class="bulk-song-list">${items.map((s,i)=>`<div class="bulk-song-item"><span>${i+1}</span><div><strong>${safeText(s.title)}</strong><small>${safeText(s.sourceFileName)} â¢ Tom ${safeText(s.key)}</small></div></div>`).join("")}</div>`:"<strong>Nenhuma cifra vÃ¡lida encontrada.</strong>";}
$("bulkImportBtn").onclick=()=>{selectedBulkSongs=[];$("bulkImportFiles").value="";$("bulkImportSummary").classList.add("hidden");$("bulkImportDialog").showModal();};
$("bulkImportFiles").addEventListener("change",async e=>{selectedBulkSongs=[];for(const file of [...e.target.files]){try{selectedBulkSongs.push(...inferSongFromFile(file.name,await file.text()));}catch(err){console.error(err)}}renderBulkImportSummary(selectedBulkSongs);});
$("clearBulkFilesBtn").onclick=()=>{selectedBulkSongs=[];$("bulkImportFiles").value="";$("bulkImportSummary").classList.add("hidden");};
$("confirmBulkImportBtn").onclick=async()=>{if(!selectedBulkSongs.length){toast("Selecione pelo menos um arquivo de cifra.");return;}const b=$("confirmBulkImportBtn");b.disabled=true;let ok=0,fail=0;for(let i=0;i<selectedBulkSongs.length;i++){const s=selectedBulkSongs[i];b.textContent=`Importando ${i+1} de ${selectedBulkSongs.length}...`;try{await addDoc(collection(db,"songs"),{ownerId:currentUser.uid,title:s.title,artist:s.artist,key:s.key,capo:Math.max(0,Math.min(12,s.capo)),content:s.content,importedInBulk:true,sourceFileName:s.sourceFileName||"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});ok++;}catch(e){fail++;console.error(e)}}b.disabled=false;b.textContent="Importar arquivos";await loadSongs();updateStats();if(ok){$("bulkImportDialog").close();showView("library");toast(fail?`${ok} importada(s) e ${fail} com erro.`:`${ok} cifra(s) importada(s)!`);}else toast("NÃ£o foi possÃ­vel importar os arquivos.");};
$("textOnlyBtn").onclick=()=>{textOnlyMode=!textOnlyMode;$("textOnlyBtn").textContent=textOnlyMode?"Mostrar acordes":"Somente texto";$("textOnlyBtn").classList.toggle("active-mode",textOnlyMode);updatePreview();};
$("playerTextOnlyBtn").onclick=()=>{playerTextOnlyMode=!playerTextOnlyMode;$("playerTextOnlyBtn").textContent=playerTextOnlyMode?"Mostrar acordes":"Somente texto";$("playerTextOnlyBtn").classList.toggle("active-mode",playerTextOnlyMode);renderListSong();};
async function loadGroupRepertoires(groupId){try{const snap=await getDocs(query(collection(db,"groupRepertoires"),where("groupId","==",groupId)));groupRepertoires=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")));renderGroupRepertoires();}catch(e){console.error(e);$("groupRepertoireList").innerHTML='<p class="muted">NÃ£o foi possÃ­vel carregar os repertÃ³rios.</p>';}}
function formatRepertoireDate(v){if(!v)return"Data nÃ£o informada";const[y,m,d]=v.split("-");return`${d}/${m}/${y}`;}
function renderGroupRepertoires(){$("groupRepertoireList").innerHTML=groupRepertoires.length?groupRepertoires.map(r=>`<button class="repertoire-card" data-open-repertoire="${r.id}"><span class="repertoire-date">${safeText(formatRepertoireDate(r.date))}</span><strong>${safeText(r.name||"RepertÃ³rio")}</strong><small>${r.songSnapshots?.length||r.songIds?.length||0} mÃºsica(s)</small></button>`).join(""):'<div class="empty-mini">Nenhum repertÃ³rio criado neste grupo.</div>';}
$("newGroupRepertoireBtn").onclick=()=>{if(!currentGroup)return;$("repertoireNameInput").value="";$("repertoireDateInput").value=new Date().toISOString().slice(0,10);$("repertoireSongOptions").innerHTML=songs.length?songs.map(s=>`<label class="check-row"><input type="checkbox" value="${s.id}"><span>${safeText(s.title)} â ${safeText(s.artist||"Sem artista")}</span></label>`).join(""):'<div class="empty-mini">VocÃª ainda nÃ£o possui cifras.</div>';$("repertoireDialog").showModal();};
$("saveRepertoireBtn").onclick=async()=>{
  if(!currentGroup)return;

  const name=$("repertoireNameInput").value.trim();
  const date=$("repertoireDateInput").value;
  const songIds=[...$("repertoireSongOptions").querySelectorAll("input:checked")].map(i=>i.value);

  if(!name){toast("Informe o nome do repertÃ³rio.");return}
  if(!date){toast("Selecione a data.");return}
  if(!songIds.length){toast("Selecione pelo menos uma cifra.");return}

  const songSnapshots=songIds
    .map(id=>songs.find(song=>song.id===id))
    .filter(Boolean)
    .map(song=>({
      sourceSongId:song.id,
      sourceOwnerId:song.ownerId||currentUser.uid,
      title:song.title||"Sem tÃ­tulo",
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
  toast("RepertÃ³rio criado!");
  await loadGroupRepertoires(currentGroup.id);
};

function getCurrentRepertoireSongs() {
  if (!currentRepertoire) return [];

  if (Array.isArray(currentRepertoire.songSnapshots) && currentRepertoire.songSnapshots.length) {
    return currentRepertoire.songSnapshots.map((song, index) => ({
      id: song.sourceSongId || `group-${currentRepertoire.id}-${index}`,
      sourceSongId: song.sourceSongId || "",
      sourceOwnerId: song.sourceOwnerId || "",
      title: song.title || "Sem tÃ­tulo",
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
    toast("Nenhuma cifra disponÃ­vel neste repertÃ³rio.");
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

  $("repertoireDetailsName").textContent=currentRepertoire.name||"RepertÃ³rio";
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
                <small>${safeText(song.artist||"Sem artista")} â¢ Tom ${safeText(song.key||"C")}</small>
              </div>
            </button>
            ${isOwnSong
              ? '<span class="library-status">JÃ¡ Ã© sua</span>'
              : alreadyAdded
                ? '<span class="library-status added">Adicionada</span>'
                : `<button class="add-to-library-button" data-add-group-song="${index}">Adicionar Ã  minha biblioteca</button>`
            }
          </div>
        `;
      }).join("")
    : '<div class="empty-mini">Nenhuma cifra foi encontrada neste repertÃ³rio.</div>';

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
    toast("NÃ£o foi possÃ­vel localizar essa cifra.");
    return;
  }

  if (groupSongAlreadyInLibrary(groupSong)) {
    toast("Essa cifra jÃ¡ estÃ¡ na sua biblioteca.");
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
    toast("Cifra adicionada Ã  sua biblioteca! Agora vocÃª pode editÃ¡-la.");
  } catch (error) {
    console.error("Erro ao adicionar cifra do grupo:", error);
    button.disabled = false;
    button.textContent = "Adicionar Ã  minha biblioteca";
    toast("NÃ£o foi possÃ­vel adicionar a cifra.");
  }
});

$("deleteRepertoireBtn").onclick=async()=>{if(!currentRepertoire||!confirm("Excluir este repertÃ³rio?"))return;await deleteDoc(doc(db,"groupRepertoires",currentRepertoire.id));$("repertoireDetailsDialog").close();toast("RepertÃ³rio excluÃ­do.");await loadGroupRepertoires(currentGroup.id);};

window.addEventListener("beforeunload", (event) => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});
