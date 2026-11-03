# Bookmark

A minimal, personal-use audiobook player for iOS, built with SwiftUI. Plays `.mp3`, `.m4a`, and `.m4b` files imported from Files, remembers your position per book, and supports background playback + lock screen / Control Center controls.

No third-party dependencies. iOS 17+, Swift 5.9.

## Project layout

- `project.yml` — XcodeGen spec (regenerate the project with `xcodegen generate`).
- `Bookmark/BookmarkApp.swift` — app entry point + scene-phase progress saving.
- `Bookmark/Models.swift` — `Book` model.
- `Bookmark/Persistence.swift` — progress store (`UserDefaults`) + file storage helpers.
- `Bookmark/PlayerModel.swift` — playback, background audio, lock-screen/remote commands, saving.
- `Bookmark/PlayerView.swift` — main player screen.
- `Bookmark/LibraryView.swift` — book list, import, swipe-to-delete.

## Run it on your iPhone (Personal Team, no paid account)

### 1. Open the project
- Open `Bookmark.xcodeproj` in Xcode.
- If you edited `project.yml`, first run `xcodegen generate` (install with `brew install xcodegen`).

### 2. Sign in with your Apple ID
- Xcode menu → **Settings → Accounts** → **+** → *Apple ID*, and sign in.

### 3. Choose your Personal Team
- Select the **Bookmark** target → **Signing & Capabilities**.
- Tick **Automatically manage signing**.
- Set **Team** to your name **(Personal Team)**.
- `DEVELOPMENT_TEAM` is intentionally left blank in the project; you set it here.

### 4. Change the bundle identifier (optional but recommended)
- Default is `com.example.bookmark`. If you want it unique, edit the **Bundle Identifier** field here, or change `PRODUCT_BUNDLE_IDENTIFIER` in `project.yml` and re-run `xcodegen generate`.

### 5. Enable Developer Mode on your iPhone
- On the phone: **Settings → Privacy & Security → Developer Mode** → toggle **On**, then restart the phone when prompted.

### 6. Connect and run
- Plug the iPhone into the Mac with a USB cable. Trust the computer if the phone asks.
- In Xcode, set the run destination to your iPhone (top toolbar), then press **Run** (⌘R).
- The first build installs the app and may prompt for your Mac login password (keychain access for signing).

### 7. Trust the developer profile (one time)
- On the phone: **Settings → General → VPN & Device Management**.
- Tap your Apple ID under *Developer App* and tap **Trust**.

## Free-account limitation: 7-day expiry

A free Personal Team signs apps with a **development** profile that expires after **7 days**. After that the app won't open. To renew it:

1. Reconnect your iPhone to the Mac.
2. Open the project in Xcode and press **Run** (⌘R) again.

This re-signs and reinstalls over the existing app **without deleting it**, so your imported books and saved positions are preserved. You do *not* need to remove the app or re-import anything. Just remember to do this before the 7 days are up if you want uninterrupted use.

## About AirDrop (and why it won't work here)

You can't install this app by AirDropping an `.ipa` to your iPhone with a free account. AirDrop just copies the file, and iOS will not install a development-signed `.ipa` that way — free-account apps must be installed and re-signed by Xcode (or a sideloading tool like AltStore/Sideloadly, which still carries the same 7-day limit). The reliable path is the Run-from-Xcode flow above, and re-running every 7 days.

## How progress is saved

Position is written to `UserDefaults` (JSON): every ~5 seconds while playing, immediately on pause, on every seek/skip/scrub, on interruption (calls/Siri), and when the app goes to background or inactive. On launch the last-played book loads at its saved position, paused and ready.
