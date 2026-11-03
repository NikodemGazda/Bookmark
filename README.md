# Bookmark

A minimal, personal audiobook player that runs as a website you can add to your iPhone's Home Screen (PWA). Plays `.mp3`, `.m4a`, and `.m4b` files you import, remembers your position per book, and gives you lock-screen / Control Center controls. No install, no signing, no 7-day expiry.

The original native SwiftUI app is preserved under [`native/`](native/) if you ever want it.

## How it works

- A static site (`index.html`, `styles.css`, `app.js`) — no build step, no dependencies.
- **Your audio files are never uploaded or stored anywhere.** The site only remembers each book's **title** and its **last-played timestamp** (in `localStorage`). When you import a file, it plays directly from your device for that session; re-import the same file later and it resumes from the saved timestamp.
- Playback uses an HTML `<audio>` element, and the **Media Session API** provides lock-screen / Control Center controls (play, pause, ±10s, scrub) and shows the title.
- Progress saves every 5 seconds while playing, on pause, on seek/skip/scrub, and when the page is hidden or backgrounded.

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

- **Library** (top-right book icon) → **Import** (download icon) → pick one or more `.mp3`/`.m4a`/`.m4b` files. They play directly from your device; nothing is uploaded.
- Tap a book to open it. If its file was imported this session, it plays; otherwise it shows its saved position and asks you to re-import. Play/pause, back/forward 10s, and drag the scrubber.

### Accounts

- Tap your name (top-right) to switch or add accounts. Accounts are just a name — no password — and each keeps its own library and progress.
- A `nikodem` account is created automatically.
- Progress is matched by the imported file's **title**, so re-importing the same file picks up where you left off.

## Important caveats

- **Only timestamps are saved** — not your files. Clearing Safari website data, or using a different device, wipes the saved positions (not your audio, which always stays on your device). There's no sync (by design).
- **Re-import each session:** after you close/reopen the app, you'll need to import the file again (once) to keep listening; it resumes from where you left off.

## Development

Just edit the static files and push — no tooling required. To test locally:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
