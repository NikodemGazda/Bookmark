"use strict";

const STATE_KEY = "bookmark.state";

const audio = new Audio();
audio.preload = "metadata";

let state = {
  accounts: [{ id: "nikodem", name: "nikodem" }],
  activeAccountId: "nikodem",
  data: {
    nikodem: { books: {}, lastPlayed: null },
  },
};

const sessionFiles = new Map(); // title -> File (in-memory, this session only)

let currentBook = null; // title currently selected
let fileLoaded = false; // whether audio currently has a file
let isPlaying = false;
let dragging = false;
let pendingSeek = null;
let saveTimer = null;

// DOM
const playerView = document.getElementById("playerView");
const libraryView = document.getElementById("libraryView");
const bookTitle = document.getElementById("bookTitle");
const hint = document.getElementById("hint");
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

function init() {
  loadState();
  ensureActiveAccount();
  setupAudioEvents();
  setupMediaSession();
  renderLibrary();
  renderAccounts();
  updateAccountUI();

  const d = activeData();
  if (d.lastPlayed) {
    selectBook(d.lastPlayed, false);
  }
}

// ---------- Accounts ----------

function ensureActiveAccount() {
  if (!state.accounts || !state.accounts.length) {
    state.accounts = [{ id: "nikodem", name: "nikodem" }];
  }
  if (!state.accounts.some((a) => a.id === state.activeAccountId)) {
    state.activeAccountId = state.accounts[0].id;
  }
  if (!state.data) state.data = {};
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
  hideHint();
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
  if (d.lastPlayed) {
    selectBook(d.lastPlayed, false);
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

// ---------- State persistence (localStorage only) ----------

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
  if (!currentBook || !fileLoaded) return;
  const d = activeData();
  if (!d.books[currentBook]) d.books[currentBook] = {};
  d.books[currentBook].position = finiteCurrentTime();
  d.lastPlayed = currentBook;
  saveState();
}

function finiteCurrentTime() {
  if (fileLoaded) {
    const t = audio.currentTime;
    if (Number.isFinite(t)) return t;
  }
  return activeData().books[currentBook]?.position || 0;
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
    showToast("Couldn\u2019t play this file.");
  });

  window.addEventListener("pagehide", savePosition);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") savePosition();
  });
}

// ---------- Playback ----------

function titleOf(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
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

// Select a book. If its file is loaded this session, play it; otherwise just
// show its title + saved position and prompt to re-import.
function selectBook(title, autoplay) {
  const d = activeData();
  currentBook = title;
  if (!d.books[title]) d.books[title] = { position: 0 };
  d.lastPlayed = title;
  saveState();

  bookTitle.textContent = title;
  renderLibrary();
  updateMediaSession();

  const file = sessionFiles.get(title);
  if (file) {
    startFilePlayback(file, autoplay);
  } else {
    stopAudio();
    showHint();
    updateTimeUI();
    updatePlayButton();
  }
}

function startFilePlayback(file, autoplay) {
  const type = file.type && file.type.startsWith("audio/") ? file.type : mimeForName(file.name);
  const blob = new Blob([file], { type });
  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.src = URL.createObjectURL(blob);

  fileLoaded = true;
  hideHint();
  pendingSeek = activeData().books[currentBook]?.position || 0;
  updatePlayButton();

  if (autoplay) {
    audio.play().catch(() => {});
  }
}

function togglePlay() {
  if (!currentBook) return;
  if (!fileLoaded) {
    showToast("Re-import this file to continue listening.");
    return;
  }
  if (audio.paused) audio.play().catch(() => showToast("Playback blocked."));
  else audio.pause();
}

function skip(seconds) {
  if (!currentBook || !fileLoaded) return;
  seekTo(finiteCurrentTime() + seconds, true);
}

function seekTo(seconds, save) {
  if (!fileLoaded) return;
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
  fileLoaded = false;
  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.removeAttribute("src");
  audio.load();
  updatePlayButton();
}

// ---------- UI ----------

function showHint() {
  hint.hidden = false;
}

function hideHint() {
  hint.hidden = true;
}

function updateDuration() {
  const d = audio.duration;
  if (Number.isFinite(d)) {
    seek.max = String(d);
  }
}

function updateTimeUI() {
  const d = activeData();
  const pos = currentBook ? d.books[currentBook]?.position || 0 : 0;

  if (fileLoaded) {
    const t = finiteCurrentTime();
    if (!dragging) seek.value = String(t);
    currentTimeEl.textContent = formatTime(t);
    const dur = audio.duration;
    durationTimeEl.textContent = formatTime(Number.isFinite(dur) ? dur : 0);
  } else {
    if (!dragging) seek.value = "0";
    currentTimeEl.textContent = formatTime(pos);
    durationTimeEl.textContent = "\u2013";
  }
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
      selectBook(title, false);
      showPlayer();
    });

    bookList.appendChild(row);
  }
}

// ---------- Library ----------

function deleteBook(title) {
  const d = activeData();
  const wasCurrent = currentBook === title;
  delete d.books[title];
  sessionFiles.delete(title);
  if (d.lastPlayed === title) {
    d.lastPlayed = Object.keys(d.books)[0] || null;
  }
  if (wasCurrent) {
    stopAudio();
    currentBook = null;
    bookTitle.textContent = "No book loaded";
    hideHint();
    updateTimeUI();
    updatePlayButton();
  }
  saveState();
  renderLibrary();
}

function importFiles(fileList) {
  const files = Array.from(fileList).filter(
    (f) => /\.(mp3|m4a|m4b|aac|wav|flac|ogg)$/i.test(f.name) || f.type.startsWith("audio/")
  );
  if (!files.length) return;

  const d = activeData();

  for (const file of files) {
    const title = titleOf(file.name);
    if (!d.books[title]) d.books[title] = { position: 0 };
    d.books[title].size = file.size;
    sessionFiles.set(title, file);
  }

  saveState();
  renderLibrary();

  const first = files[0];
  selectBook(titleOf(first.name), false);
  showPlayer();
  showToast(files.length === 1 ? "Imported." : "Imported " + files.length + " files.");
}

// ---------- Media Session (lock screen / Control Center) ----------

function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;

  ms.setActionHandler("play", () => togglePlay());
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
  if (!fileLoaded) return;
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
