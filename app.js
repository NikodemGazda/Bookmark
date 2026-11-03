"use strict";

const DB_NAME = "bookmark";
const STORE = "files";
const STATE_KEY = "bookmark.state";

const audio = new Audio();
audio.preload = "metadata";

let db = null;
let books = [];       // [{ id, name, size }]
let positions = {};   // id -> seconds
let lastPlayedId = null;
let currentBook = null;
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

init();

async function init() {
  db = await openDB();
  loadState();

  setupAudioEvents();
  setupMediaSession();

  renderLibrary();

  if (lastPlayedId) {
    const book = books.find((b) => b.id === lastPlayedId);
    if (book) await loadBook(book, false);
  }
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

// ---------- State persistence ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      books = state.books || [];
      positions = state.positions || {};
      lastPlayedId = state.lastPlayedId || null;
    }
  } catch (e) {
    console.warn("Failed to load state", e);
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ books, positions, lastPlayedId })
    );
  } catch (e) {
    console.warn("Failed to save state", e);
  }
}

function savePosition() {
  if (!currentBook) return;
  positions[currentBook.id] = finiteCurrentTime();
  lastPlayedId = currentBook.id;
  saveState();
}

function finiteCurrentTime() {
  const t = audio.currentTime;
  return Number.isFinite(t) ? t : (positions[currentBook?.id] || 0);
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
      positions[currentBook.id] = audio.duration || positions[currentBook.id] || 0;
      saveState();
    }
    updatePlayButton();
    updateMediaSession();
  });

  audio.addEventListener("error", () => {
    isPlaying = false;
    stopSaveTimer();
    updatePlayButton();
  });

  window.addEventListener("pagehide", savePosition);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") savePosition();
  });
}

// ---------- Playback ----------

async function loadBook(book, autoplay) {
  const blob = await getBlob(book.id);
  if (!blob) return;

  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.src = URL.createObjectURL(blob);

  currentBook = book;
  lastPlayedId = book.id;
  saveState();

  pendingSeek = positions[book.id] || 0;
  bookTitle.textContent = book.name;
  updatePlayButton();
  renderLibrary();
  updateMediaSession();

  if (autoplay) {
    audio.play().catch(() => {});
  }
}

function togglePlay() {
  if (!currentBook) return;
  if (audio.paused) audio.play().catch(() => {});
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

function showPlayer() {
  libraryView.hidden = true;
  playerView.hidden = false;
}

function showLibrary() {
  playerView.hidden = true;
  libraryView.hidden = false;
}

function renderLibrary() {
  bookList.innerHTML = "";
  const hasBooks = books.length > 0;
  bookList.hidden = !hasBooks;
  emptyState.hidden = hasBooks;

  for (const book of books) {
    const row = document.createElement("div");
    row.className = "book-row";

    const info = document.createElement("div");
    info.className = "book-info";

    const name = document.createElement("div");
    name.className = "book-name";
    name.textContent = book.name;

    const position = document.createElement("div");
    position.className = "book-position";
    position.textContent = formatTime(positions[book.id] || 0);

    info.appendChild(name);
    info.appendChild(position);

    if (currentBook && currentBook.id === book.id) {
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
      deleteBook(book.id);
    });

    row.appendChild(info);
    row.appendChild(del);
    row.addEventListener("click", () => {
      loadBook(book, false).then(showPlayer);
    });

    bookList.appendChild(row);
  }
}

// ---------- Library ----------

async function deleteBook(id) {
  const wasCurrent = currentBook && currentBook.id === id;
  books = books.filter((b) => b.id !== id);
  delete positions[id];
  if (lastPlayedId === id) {
    lastPlayedId = books.length ? books[0].id : null;
  }
  if (wasCurrent) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    currentBook = null;
    bookTitle.textContent = "No book loaded";
    updateTimeUI();
    updatePlayButton();
  }
  await deleteBlob(id);
  saveState();
  renderLibrary();
}

function importFiles(fileList) {
  const files = Array.from(fileList).filter(
    (f) => /\.(mp3|m4a|m4b)$/i.test(f.name) || f.type.startsWith("audio/")
  );
  if (!files.length) return;

  (async () => {
    for (const file of files) {
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
      await putBlob(id, file);
      books.push({ id, name: file.name.replace(/\.[^.]+$/, ""), size: file.size });
      positions[id] = 0;
    }
    saveState();
    renderLibrary();
  })();
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
      title: currentBook ? currentBook.name : "Bookmark",
      artist: "Audiobook",
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
