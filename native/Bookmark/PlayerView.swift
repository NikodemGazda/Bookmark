import SwiftUI

struct PlayerView: View {
    @EnvironmentObject var model: PlayerModel
    @State private var showLibrary = false
    @State private var scrubValue: Double = 0
    @State private var isScrubbing = false

    private var sliderRange: ClosedRange<Double> {
        0...max(model.duration, 0.01)
    }

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            Text(model.currentBook?.title ?? "No book loaded")
                .font(.title2)
                .fontWeight(.semibold)
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .minimumScaleFactor(0.7)

            VStack(spacing: 8) {
                Slider(value: $scrubValue, in: sliderRange) { editing in
                    if editing {
                        isScrubbing = true
                    } else {
                        isScrubbing = false
                        model.seek(to: scrubValue)
                    }
                }
                .disabled(model.currentBook == nil)

                HStack {
                    Text(formatTime(scrubValue))
                    Spacer()
                    Text(formatTime(model.duration))
                }
                .font(.footnote)
                .monospacedDigit()
                .foregroundStyle(.secondary)
            }

            HStack(spacing: 48) {
                controlButton(systemName: "gobackward.10", action: model.skipBack)
                controlButton(systemName: model.isPlaying ? "pause.fill" : "play.fill", action: model.togglePlayPause)
                    .font(.system(size: 64))
                controlButton(systemName: "goforward.10", action: model.skipForward)
            }

            Spacer()
        }
        .padding(.horizontal, 24)
        .navigationTitle("Bookmark")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showLibrary = true
                } label: {
                    Image(systemName: "books.vertical")
                }
            }
        }
        .sheet(isPresented: $showLibrary) {
            LibraryView()
        }
        .onChange(of: model.currentTime) { _, newValue in
            if !isScrubbing {
                scrubValue = newValue
            }
        }
        .onChange(of: model.duration) { _, newValue in
            if !isScrubbing {
                scrubValue = model.currentTime
            }
            if newValue > 0, scrubValue > newValue {
                scrubValue = newValue
            }
        }
    }

    private func controlButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 44, weight: .medium))
                .frame(width: 80, height: 80)
        }
        .disabled(model.currentBook == nil)
        .foregroundStyle(.primary)
    }

    private func formatTime(_ seconds: Double) -> String {
        let total = Int(max(0, seconds))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }
}
