import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
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
let editingSong = null;
let editingList = null;
let previewKey = "C";
let fontSize = 18;
let scrollFrame = null;
let listPlayer = { songs: [], index: 0 };
let authMode = "login";
let touchStartX = 0;
let isDirty = false;

const views = ["library", "lists", "shared", "editor", "listPlayer"];

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

function initials(name = "UsuÃ¡rio") {
  const pieces = name.trim().split(/\s+/).filter(Boolean);
  return (pieces[0]?.[0] || "U").toUpperCase();
}

function setDirty(value) {
  isDirty = value;
  $("saveStateText").textContent = value ? "AlteraÃ§Ãµes nÃ£o salvas" : "Tudo salvo";
  $("saveStateDot").parentElement.classList.toggle("saved", !value);
}

function firebaseMessage(code) {
  const messages = {
    "auth/invalid-credential": "E-mail ou senha invÃ¡lidos.",
    "auth/email-already-in-use": "Este e-mail jÃ¡ estÃ¡ cadastrado.",
    "auth/weak-password": "Use uma senha com pelo menos 6 caracteres.",
    "auth/invalid-email": "Informe um e-mail vÃ¡lido.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "permission-denied": "VocÃª nÃ£o tem permissÃ£o para realizar esta aÃ§Ã£o."
  };
  return messages[code] || "NÃ£o foi possÃ­vel concluir. Tente novamente.";
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
    : "JÃ¡ tenho uma conta";
  $("authHint").textContent = authMode === "login"
    ? "Entre usando seu e-mail e sua senha."
    : "Seu repertÃ³rio ficarÃ¡ salvo somente na sua conta.";
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
      const name = $("nameInput").value.trim() || "UsuÃ¡rio";
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

  const name = user.displayName || "UsuÃ¡rio";
  const firstName = name.split(/\s+/)[0];
  $("userName").textContent = name;
  $("userEmail").textContent = user.email || "";
  $("profileInitial").textContent = initials(name);
  $("sidebarInitial").textContent = initials(name);
  $("welcomeTitle").textContent = `OlÃ¡, ${firstName}! O que vamos tocar hoje?`;

  await handleSharedLink();
  await loadAll();
});

async function loadAll() {
  await Promise.all([loadSongs(), loadLists(), loadShared()]);
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
    toast("NÃ£o foi possÃ­vel carregar as cifras. Talvez seja necessÃ¡rio criar um Ã­ndice no Firestore.");
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
      <h3>${safeText(song.title || "Sem tÃ­tulo")}</h3>
      <p>${safeText(song.artist || "Artista nÃ£o informado")}</p>
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
        <p>${list.songIds?.length || 0} mÃºsica(s) nesta lista</p>
      </div>
      <div>
        <span class="meta">Atualizada em ${formatDate(list.updatedAt)}</span>
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
      toast("Lista excluÃ­da.");
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
  if (isDirty && !confirm("Existem alteraÃ§Ãµes nÃ£o salvas. Deseja sair mesmo assim?")) return;
  showView("library");
};
$("saveSongBtn").onclick = saveSong;

$("deleteSongBtn").onclick = async () => {
  if (!editingSong?.id || !confirm("Deseja excluir esta cifra permanentemente?")) return;
  await deleteDoc(doc(db, "songs", editingSong.id));
  toast("Cifra excluÃ­da.");
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
  const content = transposeContent($("songContent").value, semitones, preferFlats);
  const title = $("songTitle").value.trim();
  const artist = $("songArtist").value.trim();

  $("currentKeyLabel").textContent = previewKey;
  $("previewSongTitle").textContent = title || "PrÃ©via da cifra";
  $("previewSongArtist").textContent = artist || "A visualizaÃ§Ã£o aparece enquanto vocÃª digita.";
  $("songPreview").style.fontSize = `${fontSize}px`;

  if (!content.trim()) {
    $("songPreview").innerHTML = `
      <div class="preview-empty">
        <div>
          <strong>Sua cifra aparecerÃ¡ aqui</strong>
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
    toast("Informe o tÃ­tulo da mÃºsica.");
    $("songTitle").focus();
    return;
  }

  if (!content) {
    toast("Digite ou importe o conteÃºdo da cifra.");
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
      toast("O Firestore precisa de um Ã­ndice para concluir esta aÃ§Ã£o.");
    } else {
      toast("NÃ£o foi possÃ­vel salvar a cifra. Tente novamente.");
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
    toast("NÃ£o foi possÃ­vel gerar o link.");
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
      toast("Este link nÃ£o estÃ¡ mais disponÃ­vel.");
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
      toast("Cifra adicionada Ã s compartilhadas.");
    }

    history.replaceState({}, document.title, location.pathname);
  } catch (error) {
    console.error(error);
    toast("NÃ£o foi possÃ­vel abrir o compartilhamento.");
  }
}

function showChord(chord) {
  $("chordName").textContent = chord;
  $("chordDiagram").innerHTML = drawChordDiagram(chord);
  $("chordHelp").textContent = "Ã indica uma corda que nÃ£o deve ser tocada. â indica corda solta.";
  $("chordDialog").showModal();
}

$("autoScrollBtn").onclick = () => {
  if (scrollFrame) {
    stopAutoScroll();
    return;
  }

  $("autoScrollBtn").textContent = "â¸ Pausar";
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
  if ($("autoScrollBtn")) $("autoScrollBtn").textContent = "â¶ Iniciar";
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
  $("listDialogTitle").textContent = list ? "Editar lista" : "Nova lista";
  $("listName").value = list?.name || "";

  if (!songs.length) {
    $("listSongOptions").innerHTML = `
      <div class="empty-state">
        <p>Crie uma cifra antes de montar uma lista.</p>
      </div>`;
  } else {
    $("listSongOptions").innerHTML = songs.map((song) => `
      <label class="check-row">
        <input type="checkbox" value="${song.id}" ${list?.songIds?.includes(song.id) ? "checked" : ""}>
        <span>${safeText(song.title)} â ${safeText(song.artist || "Sem artista")}</span>
      </label>
    `).join("");
  }

  $("listDialog").showModal();
}

$("saveListBtn").onclick = async () => {
  const name = $("listName").value.trim();
  if (!name) {
    toast("Informe o nome da lista.");
    return;
  }

  const songIds = [...$("listSongOptions").querySelectorAll("input:checked")]
    .map((input) => input.value);

  if (!songIds.length) {
    toast("Selecione pelo menos uma mÃºsica.");
    return;
  }

  const data = {
    ownerId: currentUser.uid,
    name,
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
  toast("Lista salva.");
  await loadLists();
  updateStats();
};

function startList(id) {
  const list = lists.find((item) => item.id === id);
  if (!list) return;

  listPlayer.songs = list.songIds.map((songId) => songs.find((song) => song.id === songId)).filter(Boolean);
  listPlayer.index = 0;

  if (!listPlayer.songs.length) {
    toast("Esta lista estÃ¡ vazia.");
    return;
  }

  renderListSong();
  showView("listPlayer");
}

function renderListSong() {
  const song = listPlayer.songs[listPlayer.index];
  $("listProgress").textContent = `${listPlayer.index + 1} de ${listPlayer.songs.length} â¢ ${song.title}`;
  $("listPlayerSong").innerHTML = `
    <h1>${safeText(song.title)}</h1>
    <p class="muted">${safeText(song.artist || "")} â¢ Tom ${safeText(song.key || "C")}</p>
    ${renderChordMarkup(song.content)}
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

window.addEventListener("beforeunload", (event) => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});
