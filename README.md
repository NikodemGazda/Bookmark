# Bookmark

A minimal, personal audiobook player that runs as a website you can add to your iPhone's Home Screen (PWA). Plays `.mp3`, `.m4a`, and `.m4b` files you import, remembers your position per book, and gives you lock-screen / Control Center controls. No install, no signing, no 7-day expiry.

The original native SwiftUI app is preserved under [`native/`](native/) if you ever want it.

## How it works

- A static site (`index.html`, `styles.css`, `app.js`) — no build step, no dependencies.
- Imported audio files are stored in the browser's **IndexedDB**, positions and book list in **localStorage**.
- Playback uses an HTML `<audio>` element, and the **Media Session API** provides lock-screen / Control Center controls (play, pause, ±10s, scrub) and shows the title.
- Progress saves every 5 seconds while playing, on pause, on seek/skip/scrub, and when the page is hidden or backgrounded. On reopen, the last book reloads at its saved position, paused and ready.

## Set up GitHub Pages

1. Push this repo to GitHub (it's already at `NikodemGazda/Bookmark`).
2. The repo must be **public** for free GitHub Pages (private repos need GitHub Pro).
3. In the repo: **Settings → Pages** → under *Build and deployment* set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`, then **Save**.
4. After a minute, the site is live at:

   ```
   https://nikodemgazda.github.io/Bookmark/
   ```

## Add it to your iPhone (Home Screen "app")

1. On your iPhone, open the URL above in **Safari**.
2. Tap the **Share** button → **Add to Home Screen**.
3. Name it (e.g. "Bookmark") and tap **Add**.

It now opens full-screen like a native app, with its own icon, and audio keeps playing with the screen locked (start playback first, then lock).

## Using it

- **Library** (top-right book icon) → **Import** (download icon) → pick one or more `.mp3`/`.m4a`/`.m4b` files. They're copied into the browser's storage.
- Tap a book to open it; it starts paused at your saved position. Play/pause, back/forward 10s, and drag the scrubber.

### Accounts

- Tap your name (top-right) to switch or add accounts. Accounts are just a name — no password — and each keeps its own library and progress.
- A `nikodem` account is created automatically.
- Progress is matched by the imported file's **title**, so re-importing the same file picks up where you left off.

## Important caveats (browser storage)

- **Books live in your browser's storage, not in the repo.** If you clear Safari website data, or use a different browser/device, your imported books and positions are gone. There's no sync (by design).
- **Storage limits:** iOS Safari caps per-site IndexedDB storage (roughly ~1GB, and the OS may evict data when space is low). Very large `.m4b` files (many hundreds of MB) may fail to import or be evicted. This is fine for typical books, but it's the main tradeoff vs. the native app.
- **Import is per-device.** Re-import books on each device you use.

## Development

Just edit the static files and push — no tooling required. To test locally:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`. (IndexedDB works fine over `localhost`.)
