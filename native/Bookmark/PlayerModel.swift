import AVFoundation
import MediaPlayer
import Combine

@MainActor
final class PlayerModel: ObservableObject {
    @Published var books: [Book] = []
    @Published var currentBook: Book?
    @Published var isPlaying = false
    @Published var currentTime: Double = 0
    @Published var duration: Double = 0

    private let player = AVPlayer()
    private let store = ProgressStore()

    private var timeObserver: Any?
    private var saveTimer: Timer?
    private var endObserver: NSObjectProtocol?
    private var interruptionObserver: NSObjectProtocol?
    private var statusObservation: NSKeyValueObservation?
    private var pendingSeekPosition: Double?
    private var wasPlayingBeforeInterruption = false

    init() {
        configureAudioSession()
        setupRemoteCommands()
        observeInterruptions()
        observeEndOfItem()

        books = store.loadBooks()

        if let lastFileName = store.lastPlayedFileName(),
           let book = books.first(where: { $0.fileName == lastFileName }) {
            load(book: book)
        }
    }

    // MARK: - Audio session

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
        } catch {
            print("Audio session error: \(error)")
        }
    }

    // MARK: - Loading

    func load(book: Book) {
        currentBook = book
        let url = Storage.url(forFileName: book.fileName)
        guard FileManager.default.fileExists(atPath: url.path) else {
            currentTime = 0
            duration = 0
            return
        }

        let item = AVPlayerItem(url: url)
        player.replaceCurrentItem(with: item)
        isPlaying = false
        currentTime = 0
        duration = 0

        pendingSeekPosition = book.lastPosition
        observeStatus(of: item)

        Task {
            do {
                let loaded = try await item.asset.load(.duration)
                duration = loaded.seconds
            } catch {
                duration = 0
            }
        }

        store.setLastPlayed(book.fileName)
        updateNowPlayingInfo()
    }

    private func observeStatus(of item: AVPlayerItem) {
        statusObservation?.invalidate()
        statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            guard let self else { return }
            Task { @MainActor in
                guard item.status == .readyToPlay, let position = self.pendingSeekPosition else { return }
                self.pendingSeekPosition = nil
                self.seek(to: position)
            }
        }
    }

    // MARK: - Playback controls

    func togglePlayPause() {
        isPlaying ? pause() : play()
    }

    func play() {
        configureAudioSession()
        player.play()
        isPlaying = true
        startSaveTimer()
        updateNowPlayingInfo()
    }

    func pause() {
        player.pause()
        isPlaying = false
        stopSaveTimer()
        saveProgress()
        updateNowPlayingInfo()
    }

    func seek(to seconds: Double) {
        let clamped = max(0, min(seconds, duration))
        let time = CMTime(seconds: clamped, preferredTimescale: 600)
        player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            Task { @MainActor in
                self?.currentTime = clamped
                self?.updateNowPlayingInfo()
            }
        }
        currentTime = clamped
        saveProgress()
    }

    func skipBack() {
        seek(to: currentTime - 10)
    }

    func skipForward() {
        seek(to: currentTime + 10)
    }

    // MARK: - Progress saving

    func saveProgress() {
        guard let book = currentBook else { return }
        store.setLastPlayed(book.fileName)
        books = store.upsertPosition(fileName: book.fileName, position: currentTime)
        currentBook?.lastPosition = currentTime
    }

    private func startSaveTimer() {
        stopSaveTimer()
        saveTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.saveProgress()
            }
        }
    }

    private func stopSaveTimer() {
        saveTimer?.invalidate()
        saveTimer = nil
    }

    // MARK: - Time observation

    private func observeEndOfItem() {
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.handlePlaybackFinished()
            }
        }

        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            Task { @MainActor in
                self?.currentTime = time.seconds
                self?.updateNowPlayingInfo()
            }
        }
    }

    private func handlePlaybackFinished() {
        currentTime = duration
        isPlaying = false
        stopSaveTimer()
        saveProgress()
        updateNowPlayingInfo()
    }

    // MARK: - Interruptions

    private func observeInterruptions() {
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            Task { @MainActor in
                self?.handleInterruption(notification)
            }
        }
    }

    private func handleInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }

        switch type {
        case .began:
            wasPlayingBeforeInterruption = isPlaying
            pause()
        case .ended:
            if let rawOptions = info[AVAudioSessionInterruptionOptionKey] as? UInt,
               AVAudioSession.InterruptionOptions(rawValue: rawOptions).contains(.shouldResume),
               wasPlayingBeforeInterruption {
                play()
            }
            wasPlayingBeforeInterruption = false
        @unknown default:
            break
        }
    }

    // MARK: - Now Playing

    private func updateNowPlayingInfo() {
        var info: [String: Any] = [
            MPMediaItemPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
            MPMediaItemPropertyTitle: currentBook?.title ?? "",
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
        ]
        if duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = duration
        }
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    // MARK: - Remote commands

    private func setupRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget { [weak self] _ in
            self?.play()
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            self?.pause()
            return .success
        }
        center.skipForwardCommand.preferredIntervals = [10]
        center.skipForwardCommand.addTarget { [weak self] _ in
            self?.skipForward()
            return .success
        }
        center.skipBackwardCommand.preferredIntervals = [10]
        center.skipBackwardCommand.addTarget { [weak self] _ in
            self?.skipBack()
            return .success
        }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self, let event = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            self.seek(to: event.positionTime)
            return .success
        }
    }

    // MARK: - Library

    func addBook(named fileName: String) {
        books = store.upsertPosition(fileName: fileName, position: 0)
    }

    func delete(book: Book) {
        books = store.removeBook(fileName: book.fileName)
        let url = Storage.url(forFileName: book.fileName)
        try? FileManager.default.removeItem(at: url)
        if currentBook?.fileName == book.fileName {
            currentBook = nil
            player.replaceCurrentItem(with: nil)
            currentTime = 0
            duration = 0
            isPlaying = false
            stopSaveTimer()
        }
    }

    func book(forFileName fileName: String) -> Book? {
        books.first { $0.fileName == fileName }
    }

    deinit {
        if let timeObserver {
            player.removeTimeObserver(timeObserver)
        }
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
        }
        if let interruptionObserver {
            NotificationCenter.default.removeObserver(interruptionObserver)
        }
    }
}
