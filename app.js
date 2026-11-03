"use strict";

const DB_NAME = "bookmark";
const STORE = "files";
const STATE_KEY = "bookmark.state";

const audio = new Audio();
audio.preload = "metadata";

let db = null;
let state = {
  accounts: [{ id: "nikodem", name: "nikodem" }],
  activeAccountId: "nikodem",
  data: {
    nikodem: { books: {}, lastPlayed: null },
  },
};

let currentBook = null; // title currently loaded
let isPlaying = false;
let dragging = false;
let pendingSeek = null;
let saveTimer = null;

// DOM
const playerView = document.getElementById("playerView");
const libraryView = document.getElementById("libraryView");
const bookTitle = document.getElementById("bookTitle");
const seek = document.getElementById("seek");
const currentTimeEl = document.getElementById("currentTime");
const durationTimeEl = document.getElementById("durationTime");
const playButton = document.getElementById("playButton");
const playIcon = document.getElementById("playIcon");
const pauseIcon = document.getElementById("pauseIcon");
const backButton = document.getElementById("backButton");
const forwardButton = document.getElementById("forwardButton");
const libraryButton = document.getElementById("libraryButton");
const doneButton = document.getElementById("doneButton");
const importButton = document.getElementById("importButton");
const emptyImportButton = document.getElementById("emptyImportButton");
const fileInput = document.getElementById("fileInput");
const bookList = document.getElementById("bookList");
const emptyState = document.getElementById("emptyState");
const accountButton = document.getElementById("accountButton");
const accountNameEl = document.getElementById("accountName");
const accountPanel = document.getElementById("accountPanel");
const accountList = document.getElementById("accountList");
const addAccountButton = document.getElementById("addAccountButton");
const addAccountForm = document.getElementById("addAccountForm");
const accountNameInput = document.getElementById("accountNameInput");
const toast = document.getElementById("toast");

init();

async function init() {
  db = await openDB();
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
  loadState();
  ensureActiveAccount();
  setupAudioEvents();
  setupMediaSession();
  renderLibrary();
  renderAccounts();
  updateAccountUI();

  const d = activeData();
  if (d.lastPlayed && d.books[d.lastPlayed]) {
    await loadBook(d.lastPlayed, false);
  }
}

// ---------- Accounts ----------

function ensureActiveAccount() {
  if (!state.accounts.length) {
    state.accounts = [{ id: "nikodem", name: "nikodem" }];
  }
  if (!state.accounts.some((a) => a.id === state.activeAccountId)) {
    state.activeAccountId = state.accounts[0].id;
  }
  if (!state.data[state.activeAccountId]) {
    state.data[state.activeAccountId] = { books: {}, lastPlayed: null };
  }
  saveState();
}

function activeAccount() {
  return state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0];
}

function activeData() {
  const id = state.activeAccountId;
  if (!state.data[id]) state.data[id] = { books: {}, lastPlayed: null };
  return state.data[id];
}

function addAccount(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  state.accounts.push({ id, name: trimmed });
  state.data[id] = { books: {}, lastPlayed: null };
  switchAccount(id);
}

function switchAccount(id) {
  stopAudio();
  currentBook = null;
  bookTitle.textContent = "No book loaded";
  updateTimeUI();
  updatePlayButton();

  state.activeAccountId = id;
  if (!state.data[id]) state.data[id] = { books: {}, lastPlayed: null };
  saveState();

  renderAccounts();
  renderLibrary();
  updateAccountUI();
  updateMediaSession();

  const d = activeData();
  if (d.lastPlayed && d.books[d.lastPlayed]) {
    loadBook(d.lastPlayed, false);
  }
}

function updateAccountUI() {
  accountNameEl.textContent = activeAccount().name;
}

function renderAccounts() {
  accountList.innerHTML = "";
  for (const acc of state.accounts) {
    const row = document.createElement("div");
    row.className = "account-row";

    const avatar = document.createElement("div");
    avatar.className = "account-avatar";
    avatar.textContent = (acc.name[0] || "?").toUpperCase();

    const name = document.createElement("div");
    name.className = "account-row-name";
    name.textContent = acc.name;

    row.appendChild(avatar);
    row.appendChild(name);

    if (acc.id === state.activeAccountId) {
      const check = document.createElement("div");
      check.className = "book-check";
      check.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
      row.appendChild(check);
    }

    row.addEventListener("click", () => {
      closeAccountPanel();
      switchAccount(acc.id);
    });

    accountList.appendChild(row);
  }
}

// ---------- State persistence ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.accounts && parsed.accounts.length) {
        state = parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to load state", e);
  }
  if (!state.accounts) state.accounts = [];
  if (!state.data) state.data = {};
}

function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to save state", e);
  }
}

function savePosition() {
  if (!currentBook) return;
  const d = activeData();
  if (!d.books[currentBook]) d.books[currentBook] = {};
  d.books[currentBook].position = finiteCurrentTime();
  d.lastPlayed = currentBook;
  saveState();
}

function finiteCurrentTime() {
  const t = audio.currentTime;
  return Number.isFinite(t) ? t : activeData().books[currentBook]?.position || 0;
}

// ---------- IndexedDB ----------

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function blobKey(title) {
  return state.activeAccountId + "::" + title;
}

function putBlob(id, blob) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getBlob(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error);
  });
}

function deleteBlob(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Audio events ----------

function setupAudioEvents() {
  audio.addEventListener("loadedmetadata", () => {
    updateDuration();
    if (pendingSeek != null) {
      const pos = pendingSeek;
      pendingSeek = null;
      seekTo(pos, false);
    }
    updateTimeUI();
    updateMediaSession();
  });

  audio.addEventListener("timeupdate", () => {
    if (!dragging) updateTimeUI();
    updateMediaSession();
  });

  audio.addEventListener("play", () => {
    isPlaying = true;
    startSaveTimer();
    updatePlayButton();
    updateMediaSession();
  });

  audio.addEventListener("pause", () => {
    isPlaying = false;
    stopSaveTimer();
    savePosition();
    updatePlayButton();
    updateMediaSession();
  });

  audio.addEventListener("ended", () => {
    isPlaying = false;
    stopSaveTimer();
    if (currentBook) {
      const d = activeData();
      if (!d.books[currentBook]) d.books[currentBook] = {};
      d.books[currentBook].position = audio.duration || d.books[currentBook].position || 0;
      saveState();
    }
    updatePlayButton();
    updateMediaSession();
  });

  audio.addEventListener("error", () => {
    isPlaying = false;
    stopSaveTimer();
    updatePlayButton();
    showToast("Couldn't play this file.");
  });

  window.addEventListener("pagehide", savePosition);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") savePosition();
  });
}

// ---------- Playback ----------

async function loadBook(title, autoplay) {
  const key = blobKey(title);
  const blob = await getBlob(key);
  if (!blob) {
    showToast("Audio data not found for \u201c" + title + "\u201d. Try importing it again.");
    return;
  }

  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.src = URL.createObjectURL(blob);

  currentBook = title;
  const d = activeData();
  d.lastPlayed = title;
  saveState();

  pendingSeek = d.books[title]?.position || 0;
  bookTitle.textContent = title;
  updatePlayButton();
  renderLibrary();
  updateMediaSession();

  if (autoplay) {
    audio.play().catch(() => {});
  }
}

function togglePlay() {
  if (!currentBook) return;
  if (audio.paused) audio.play().catch(() => showToast("Playback blocked."));
  else audio.pause();
}

function skip(seconds) {
  if (!currentBook) return;
  seekTo(finiteCurrentTime() + seconds, true);
}

function seekTo(seconds, save) {
  const duration = audio.duration;
  if (!Number.isFinite(duration)) {
    pendingSeek = seconds;
    return;
  }
  const clamped = Math.max(0, Math.min(seconds, duration));
  audio.currentTime = clamped;
  if (save) savePosition();
  updateTimeUI();
}

function stopAudio() {
  audio.pause();
  stopSaveTimer();
  isPlaying = false;
  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.removeAttribute("src");
  audio.load();
  updatePlayButton();
}

// ---------- UI ----------

function updateDuration() {
  const d = audio.duration;
  if (Number.isFinite(d)) {
    seek.max = String(d);
  }
}

function updateTimeUI() {
  const t = finiteCurrentTime();
  const d = audio.duration;
  if (!dragging) {
    seek.value = String(Number.isFinite(t) ? t : 0);
  }
  currentTimeEl.textContent = formatTime(t);
  durationTimeEl.textContent = formatTime(Number.isFinite(d) ? d : 0);
}

function updatePlayButton() {
  playIcon.hidden = isPlaying;
  pauseIcon.hidden = !isPlaying;
  playButton.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

let toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 4000);
}

function showPlayer() {
  closeAccountPanel();
  libraryView.hidden = true;
  playerView.hidden = false;
}

function showLibrary() {
  closeAccountPanel();
  playerView.hidden = true;
  libraryView.hidden = false;
}

function renderLibrary() {
  bookList.innerHTML = "";
  const d = activeData();
  const titles = Object.keys(d.books);
  const hasBooks = titles.length > 0;
  bookList.hidden = !hasBooks;
  emptyState.hidden = hasBooks;

  for (const title of titles) {
    const row = document.createElement("div");
    row.className = "book-row";

    const info = document.createElement("div");
    info.className = "book-info";

    const name = document.createElement("div");
    name.className = "book-name";
    name.textContent = title;

    const position = document.createElement("div");
    position.className = "book-position";
    position.textContent = formatTime(d.books[title]?.position || 0);

    info.appendChild(name);
    info.appendChild(position);

    if (currentBook === title) {
      const check = document.createElement("div");
      check.className = "book-check";
      check.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
      row.appendChild(check);
    }

    const del = document.createElement("button");
    del.className = "delete-button";
    del.setAttribute("aria-label", "Delete");
    del.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteBook(title);
    });

    row.appendChild(info);
    row.appendChild(del);
    row.addEventListener("click", () => {
      loadBook(title, false).then(showPlayer);
    });

    bookList.appendChild(row);
  }
}

// ---------- Library ----------

async function deleteBook(title) {
  const d = activeData();
  const wasCurrent = currentBook === title;
  delete d.books[title];
  if (d.lastPlayed === title) {
    d.lastPlayed = Object.keys(d.books)[0] || null;
  }
  if (wasCurrent) {
    stopAudio();
    currentBook = null;
    bookTitle.textContent = "No book loaded";
    updateTimeUI();
    updatePlayButton();
  }
  await deleteBlob(blobKey(title));
  saveState();
  renderLibrary();
}

function mimeForName(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    m4b: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    flac: "audio/flac",
    ogg: "audio/ogg",
  };
  return map[ext] || "audio/mpeg";
}

async function importFiles(fileList) {
  const files = Array.from(fileList).filter(
    (f) => /\.(mp3|m4a|m4b|aac|wav|flac|ogg)$/i.test(f.name) || f.type.startsWith("audio/")
  );
  if (!files.length) return;

  const d = activeData();

  if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      const available = (est.quota || 0) - (est.usage || 0);
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      if (est.quota && totalSize > available) {
        showToast("This file may be too large for this device\u2019s available storage.");
      }
    } catch (e) {}
  }

  for (const file of files) {
    const title = file.name.replace(/\.[^.]+$/, "");
    const type = file.type && file.type.startsWith("audio/") ? file.type : mimeForName(file.name);
    const blob = new Blob([file], { type });

    try {
      await putBlob(blobKey(title), blob);
    } catch (err) {
      console.error("Store failed", err);
      showToast(
        "Couldn\u2019t store \u201c" + title + "\u201d. Not enough storage space on this device."
      );
      continue;
    }

    if (!d.books[title]) {
      d.books[title] = { position: 0 };
    }
    d.books[title].size = file.size;
  }

  saveState();
  renderLibrary();
  showToast(files.length === 1 ? "Imported." : "Imported " + files.length + " files.");
}

// ---------- Media Session (lock screen / Control Center) ----------

function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;

  ms.setActionHandler("play", () => audio.play());
  ms.setActionHandler("pause", () => audio.pause());
  ms.setActionHandler("previoustrack", () => skip(-10));
  ms.setActionHandler("nexttrack", () => skip(10));
  ms.setActionHandler("seekbackward", (details) => skip(-(details.seekOffset || 10)));
  ms.setActionHandler("seekforward", (details) => skip(details.seekOffset || 10));
  ms.setActionHandler("seekto", (details) => {
    if (details.seekTime != null) seekTo(details.seekTime, true);
  });
}

function updateMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;

  try {
    ms.metadata = new MediaMetadata({
      title: currentBook || "Bookmark",
      artist: activeAccount().name,
      album: "Bookmark",
      artwork: [{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }],
    });
  } catch (e) {}

  ms.playbackState = isPlaying ? "playing" : "paused";

  const d = audio.duration;
  if (Number.isFinite(d) && d > 0) {
    try {
      ms.setPositionState({
        duration: d,
        playbackRate: 1,
        position: Math.max(0, Math.min(finiteCurrentTime(), d)),
      });
    } catch (e) {}
  }
}

// ---------- Save timer ----------

function startSaveTimer() {
  stopSaveTimer();
  saveTimer = setInterval(savePosition, 5000);
}

function stopSaveTimer() {
  if (saveTimer) {
    clearInterval(saveTimer);
    saveTimer = null;
  }
}

// ---------- Event wiring ----------

playButton.addEventListener("click", togglePlay);
backButton.addEventListener("click", () => skip(-10));
forwardButton.addEventListener("click", () => skip(10));

seek.addEventListener("input", () => {
  dragging = true;
  currentTimeEl.textContent = formatTime(parseFloat(seek.value));
});

seek.addEventListener("change", () => {
  dragging = false;
  seekTo(parseFloat(seek.value), true);
});

libraryButton.addEventListener("click", showLibrary);
doneButton.addEventListener("click", showPlayer);
importButton.addEventListener("click", () => fileInput.click());
emptyImportButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  importFiles(fileInput.files);
  fileInput.value = "";
});

accountButton.addEventListener("click", () => {
  accountPanel.hidden = false;
});
accountPanel.addEventListener("click", (e) => {
  if (e.target === accountPanel) closeAccountPanel();
});
function closeAccountPanel() {
  accountPanel.hidden = true;
  addAccountForm.hidden = true;
  accountNameInput.value = "";
}
addAccountButton.addEventListener("click", () => {
  addAccountForm.hidden = false;
  accountNameInput.focus();
});
addAccountForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addAccount(accountNameInput.value);
  closeAccountPanel();
});
