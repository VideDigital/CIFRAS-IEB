import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { KEYS, transposeContent, semitoneDistance, renderChordMarkup } from "./chord-engine.js";
import { drawChordDiagram } from "./chord-diagrams.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const $ = id => document.getElementById(id);

let currentUser = null, songs = [], lists = [], sharedSongs = [];
let editingSong = null, editingList = null, previewKey = "C";
let fontSize = 18, scrollTimer = null, listPlayer = {songs:[], index:0};
let authMode = "login", touchStartX = 0;

const views = ["library","lists","shared","editor","listPlayer"];
function showView(name){
  views.forEach(v => $(`${v}View`).classList.toggle("hidden", v !== name));
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===name));
  closeSidebar();
}
function toast(message){ const el=$("toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2600); }
function formatDate(value){ try{return value?.toDate().toLocaleDateString("pt-BR")||"Agora";}catch{return "Agora";} }
function safeText(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}

KEYS.forEach(k=>$("songKey").insertAdjacentHTML("beforeend",`<option>${k}</option>`));

$("toggleAuthMode").onclick=()=>{
  authMode=authMode==="login"?"register":"login";
  $("nameInput").parentElement.classList.toggle("hidden",authMode==="login");
  $("toggleAuthMode").textContent=authMode==="login"?"Ainda nÃ£o tenho conta":"JÃ¡ tenho uma conta";
  $("authHint").textContent=authMode==="login"?"Para entrar, informe e-mail e senha.":"Crie seu acesso pessoal.";
};
$("nameInput").parentElement.classList.add("hidden");

$("authForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    const email=$("emailInput").value.trim(), password=$("passwordInput").value;
    if(authMode==="register"){
      const cred=await createUserWithEmailAndPassword(auth,email,password);
      const name=$("nameInput").value.trim()||"UsuÃ¡rio";
      await updateProfile(cred.user,{displayName:name});
      await setDoc(doc(db,"users",cred.user.uid),{name,email,createdAt:serverTimestamp()});
    }else await signInWithEmailAndPassword(auth,email,password);
  }catch(err){toast(firebaseMessage(err.code));}
};
$("logoutBtn").onclick=()=>signOut(auth);

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  $("authScreen").classList.toggle("hidden",!!user);
  $("app").classList.toggle("hidden",!user);
  if(user){
    $("userName").textContent=user.displayName||"UsuÃ¡rio";
    $("userEmail").textContent=user.email;
    await handleSharedLink();
    await loadAll();
  }
});

function firebaseMessage(code){
  const map={"auth/invalid-credential":"E-mail ou senha invÃ¡lidos.","auth/email-already-in-use":"Este e-mail jÃ¡ estÃ¡ cadastrado.","auth/weak-password":"Use uma senha com pelo menos 6 caracteres.","auth/invalid-email":"E-mail invÃ¡lido.","permission-denied":"VocÃª nÃ£o tem permissÃ£o para esta aÃ§Ã£o."};
  return map[code]||"NÃ£o foi possÃ­vel concluir. Verifique os dados e o Firebase.";
}

async function loadAll(){ await Promise.all([loadSongs(),loadLists(),loadShared()]); }
async function loadSongs(){
  const snap=await getDocs(query(collection(db,"songs"),where("ownerId","==",currentUser.uid),orderBy("updatedAt","desc")));
  songs=snap.docs.map(d=>({id:d.id,...d.data()})); renderSongs();
}
async function loadLists(){
  const snap=await getDocs(query(collection(db,"lists"),where("ownerId","==",currentUser.uid),orderBy("updatedAt","desc")));
  lists=snap.docs.map(d=>({id:d.id,...d.data()})); renderLists();
}
async function loadShared(){
  const snap=await getDocs(query(collection(db,"shares"),where("viewerIds","array-contains",currentUser.uid)));
  const ids=[...new Set(snap.docs.map(d=>d.data().songId))];
  sharedSongs=(await Promise.all(ids.map(async id=>{const s=await getDoc(doc(db,"songs",id));return s.exists()?{id:s.id,...s.data(),readOnly:true}:null;}))).filter(Boolean);
  renderShared();
}

function songCard(song,shared=false){
  return `<article class="card">
    <div><span class="meta">Tom ${safeText(song.key||"C")}</span><h3>${safeText(song.title||"Sem tÃ­tulo")}</h3><p>${safeText(song.artist||"Artista nÃ£o informado")}</p></div>
    <div class="card-actions"><button class="primary small" data-open-song="${song.id}" data-shared="${shared}">${shared?"Visualizar":"Abrir"}</button></div>
  </article>`;
}
function renderSongs(filter=""){
  const term=filter.toLowerCase();
  const visible=songs.filter(s=>`${s.title} ${s.artist}`.toLowerCase().includes(term));
  $("songGrid").innerHTML=visible.map(s=>songCard(s)).join("");
  $("emptyLibrary").classList.toggle("hidden",visible.length>0);
}
function renderShared(){
  $("sharedGrid").innerHTML=sharedSongs.map(s=>songCard(s,true)).join("");
  $("emptyShared").classList.toggle("hidden",sharedSongs.length>0);
}
function renderLists(){
  $("listGrid").innerHTML=lists.map(l=>`<article class="card">
   <div><span class="meta">${l.songIds?.length||0} mÃºsica(s)</span><h3>${safeText(l.name)}</h3><p>Atualizada em ${formatDate(l.updatedAt)}</p></div>
   <div class="card-actions"><button class="primary small" data-play-list="${l.id}">Abrir</button><button class="ghost small" data-edit-list="${l.id}">Editar</button><button class="danger small" data-delete-list="${l.id}">Excluir</button></div>
  </article>`).join("");
  $("emptyLists").classList.toggle("hidden",lists.length>0);
}
$("songSearch").oninput=e=>renderSongs(e.target.value);

document.addEventListener("click",async e=>{
  const open=e.target.closest("[data-open-song]"); if(open){openSong(open.dataset.openSong,open.dataset.shared==="true");return;}
  const play=e.target.closest("[data-play-list]"); if(play){startList(play.dataset.playList);return;}
  const edit=e.target.closest("[data-edit-list]"); if(edit){openListDialog(lists.find(l=>l.id===edit.dataset.editList));return;}
  const del=e.target.closest("[data-delete-list]"); if(del){if(confirm("Excluir esta lista?")){await deleteDoc(doc(db,"lists",del.dataset.deleteList));await loadLists();}return;}
  const chord=e.target.closest(".chord"); if(chord){showChord(chord.dataset.chord);return;}
  if(e.target.matches("[data-close-dialog]")) e.target.closest("dialog").close();
});

$("newSongBtn").onclick=()=>openSong();
$("backToLibrary").onclick=()=>showView("library");
$("saveSongBtn").onclick=saveSong;
$("deleteSongBtn").onclick=async()=>{
  if(!editingSong?.id||!confirm("Excluir esta cifra?"))return;
  await deleteDoc(doc(db,"songs",editingSong.id)); toast("Cifra excluÃ­da."); await loadSongs(); showView("library");
};

function openSong(id=null,readOnly=false){
  editingSong=id?[...songs,...sharedSongs].find(s=>s.id===id):null;
  const s=editingSong||{title:"",artist:"",key:"C",capo:0,content:""};
  $("songTitle").value=s.title||"";$("songArtist").value=s.artist||"";$("songKey").value=s.key||"C";$("songCapo").value=s.capo||0;$("songContent").value=s.content||"";
  previewKey=s.key||"C";
  ["songTitle","songArtist","songKey","songCapo","songContent"].forEach(id=>$ (id).disabled=readOnly);
  $("saveSongBtn").classList.toggle("hidden",readOnly);$("deleteSongBtn").classList.toggle("hidden",readOnly||!editingSong);
  $("shareBtn").classList.toggle("hidden",readOnly||!editingSong);$("importBtn").classList.toggle("hidden",readOnly);
  updatePreview();showView("editor");
}
function updatePreview(){
  const original=$("songKey").value||"C";
  const semis=semitoneDistance(original,previewKey);
  const preferFlats=/b/.test(previewKey);
  const transformed=transposeContent($("songContent").value,semis,preferFlats);
  $("currentKeyLabel").textContent=`Tom: ${previewKey}`;
  $("songPreview").style.fontSize=`${fontSize}px`;
  $("songPreview").innerHTML=renderChordMarkup(transformed)||'<div class="empty">A prÃ©via aparecerÃ¡ aqui.</div>';
}
["songContent","songKey","songTitle","songArtist"].forEach(id=>$(id).addEventListener("input",()=>{if(id==="songKey")previewKey=$(id).value;updatePreview();}));
$("transposeUp").onclick=()=>changeKey(1);$("transposeDown").onclick=()=>changeKey(-1);
function changeKey(delta){const base=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];let i=base.indexOf(previewKey);if(i<0)i=0;previewKey=base[(i+delta+12)%12];updatePreview();}
$("fontUp").onclick=()=>{fontSize=Math.min(34,fontSize+2);updatePreview();};
$("fontDown").onclick=()=>{fontSize=Math.max(12,fontSize-2);updatePreview();};

async function saveSong(){
  const data={ownerId:currentUser.uid,title:$("songTitle").value.trim()||"Sem tÃ­tulo",artist:$("songArtist").value.trim(),key:$("songKey").value,capo:Number($("songCapo").value)||0,content:$("songContent").value,updatedAt:serverTimestamp()};
  if(editingSong?.id)await updateDoc(doc(db,"songs",editingSong.id),data);
  else{data.createdAt=serverTimestamp();const ref=await addDoc(collection(db,"songs"),data);editingSong={id:ref.id,...data};}
  toast("Cifra salva.");await loadSongs();openSong(editingSong.id);
}

$("importBtn").onclick=()=>$("importDialog").showModal();
$("confirmImportBtn").onclick=()=>{$("songContent").value=$("importText").value;updatePreview();$("importDialog").close();toast("Cifra importada para o editor.");};

$("shareBtn").onclick=async()=>{
  if(!editingSong?.id)return;
  const token=crypto.randomUUID().replaceAll("-","");
  await setDoc(doc(db,"publicShares",token),{songId:editingSong.id,ownerId:currentUser.uid,active:true,createdAt:serverTimestamp()});
  const url=`${location.origin}${location.pathname}?share=${token}`;
  $("shareLink").value=url;$("shareDialog").showModal();
};
$("copyShareLink").onclick=async()=>{await navigator.clipboard.writeText($("shareLink").value);toast("Link copiado.");};

async function handleSharedLink(){
  const token=new URLSearchParams(location.search).get("share"); if(!token)return;
  try{
    const share=await getDoc(doc(db,"publicShares",token));
    if(!share.exists()||!share.data().active)return toast("Link invÃ¡lido ou desativado.");
    const data=share.data();
    if(data.ownerId===currentUser.uid)return;
    await setDoc(doc(db,"shares",`${data.songId}_${currentUser.uid}`),{songId:data.songId,ownerId:data.ownerId,viewerIds:arrayUnion(currentUser.uid),createdAt:serverTimestamp()},{merge:true});
    history.replaceState({},document.title,location.pathname);toast("Cifra adicionada Ã s compartilhadas.");
  }catch{toast("NÃ£o foi possÃ­vel abrir o compartilhamento.");}
}

function showChord(chord){$("chordName").textContent=chord;$("chordDiagram").innerHTML=drawChordDiagram(chord);$("chordHelp").textContent="Os nÃºmeros representam as casas. Ã indica corda que nÃ£o deve ser tocada.";$("chordDialog").showModal();}

$("autoScrollBtn").onclick=()=>{
  if(scrollTimer){cancelAnimationFrame(scrollTimer);scrollTimer=null;$("autoScrollBtn").textContent="â¶ Rolagem";return;}
  $("autoScrollBtn").textContent="â¸ Pausar";
  let last=performance.now();
  const step=now=>{const dt=(now-last)/16.67;last=now;$("songPreview").scrollTop+=Number($("scrollSpeed").value)*dt;scrollTimer=requestAnimationFrame(step);};
  scrollTimer=requestAnimationFrame(step);
};

$("newListBtn").onclick=()=>openListDialog();
function openListDialog(list=null){
  editingList=list;
  $("listDialogTitle").textContent=list?"Editar lista":"Nova lista";
  $("listName").value=list?.name||"";
  $("listSongOptions").innerHTML=songs.map(s=>`<label class="check-row"><input type="checkbox" value="${s.id}" ${list?.songIds?.includes(s.id)?"checked":""}><span>${safeText(s.title)} â ${safeText(s.artist||"Sem artista")}</span></label>`).join("");
  $("listDialog").showModal();
}
$("saveListBtn").onclick=async()=>{
  const name=$("listName").value.trim();if(!name)return toast("Informe o nome da lista.");
  const songIds=[...$("listSongOptions").querySelectorAll("input:checked")].map(i=>i.value);
  const data={ownerId:currentUser.uid,name,songIds,updatedAt:serverTimestamp()};
  if(editingList)await updateDoc(doc(db,"lists",editingList.id),data);else{data.createdAt=serverTimestamp();await addDoc(collection(db,"lists"),data);}
  $("listDialog").close();toast("Lista salva.");await loadLists();
};

function startList(id){
  const list=lists.find(l=>l.id===id);if(!list)return;
  listPlayer.songs=list.songIds.map(id=>songs.find(s=>s.id===id)).filter(Boolean);listPlayer.index=0;
  if(!listPlayer.songs.length)return toast("Esta lista estÃ¡ vazia.");
  renderListSong();showView("listPlayer");
}
function renderListSong(){
  const song=listPlayer.songs[listPlayer.index], semis=0;
  $("listProgress").textContent=`${listPlayer.index+1} de ${listPlayer.songs.length} â¢ ${song.title}`;
  $("listPlayerSong").innerHTML=`<h2>${safeText(song.title)}</h2><p class="muted">${safeText(song.artist||"")}</p>${renderChordMarkup(transposeContent(song.content,semis))}`;
  $("prevListSong").disabled=listPlayer.index===0;$("nextListSong").disabled=listPlayer.index===listPlayer.songs.length-1;
  $("listPlayerSong").scrollTop=0;
}
function moveList(delta){const next=listPlayer.index+delta;if(next<0||next>=listPlayer.songs.length)return;listPlayer.index=next;renderListSong();}
$("prevListSong").onclick=()=>moveList(-1);$("nextListSong").onclick=()=>moveList(1);$("exitListPlayer").onclick=()=>showView("lists");
$("listPlayerSong").addEventListener("touchstart",e=>touchStartX=e.changedTouches[0].screenX,{passive:true});
$("listPlayerSong").addEventListener("touchend",e=>{const dx=e.changedTouches[0].screenX-touchStartX;if(Math.abs(dx)>70)moveList(dx<0?1:-1);},{passive:true});

document.querySelectorAll(".nav-btn").forEach(btn=>btn.onclick=()=>showView(btn.dataset.view));
$("menuBtn").onclick=()=>{$("sidebar").classList.toggle("open");$("sidebarBackdrop").classList.toggle("hidden");};
$("sidebarBackdrop").onclick=closeSidebar;
function closeSidebar(){$("sidebar").classList.remove("open");$("sidebarBackdrop").classList.add("hidden");}
