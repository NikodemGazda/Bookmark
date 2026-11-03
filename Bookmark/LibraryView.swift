import SwiftUI
import UniformTypeIdentifiers

struct LibraryView: View {
    @EnvironmentObject var model: PlayerModel
    @Environment(\.dismiss) private var dismiss
    @State private var showImporter = false
    @State private var importError: String?

    var body: some View {
        NavigationStack {
            Group {
                if model.books.isEmpty {
                    ContentUnavailableView(
                        "No audiobooks",
                        systemImage: "book",
                        description: Text("Tap the import button to add an audio file.")
                    )
                } else {
                    List {
                        ForEach(model.books) { book in
                            Button {
                                model.load(book: book)
                                dismiss()
                            } label: {
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(book.title)
                                            .font(.body)
                                            .foregroundStyle(.primary)
                                        Text(formatTime(book.lastPosition))
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if model.currentBook?.fileName == book.fileName {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(.tint)
                                    }
                                }
                            }
                        }
                        .onDelete(perform: delete)
                    }
                }
            }
            .navigationTitle("Library")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showImporter = true
                    } label: {
                        Image(systemName: "square.and.arrow.down")
                    }
                }
            }
            .fileImporter(
                isPresented: $showImporter,
                allowedContentTypes: [.mp3, .mpeg4Audio, .audio],
                allowsMultipleSelection: true
            ) { result in
                switch result {
                case .success(let urls):
                    importFiles(urls)
                case .failure(let error):
                    importError = error.localizedDescription
                }
            }
            .alert(
                "Import failed",
                isPresented: .init(
                    get: { importError != nil },
                    set: { if !$0 { importError = nil } }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(importError ?? "")
            }
        }
    }

    private func delete(at offsets: IndexSet) {
        for index in offsets {
            model.delete(book: model.books[index])
        }
    }

    private func importFiles(_ urls: [URL]) {
        for url in urls {
            importFile(url)
        }
    }

    private func importFile(_ url: URL) {
        let didAccess = url.startAccessingSecurityScopedResource()
        defer { if didAccess { url.stopAccessingSecurityScopedResource() } }

        let originalName = url.lastPathComponent
        let uniqueName = Storage.uniqueFileName(for: originalName)
        let destination = Storage.documentsDirectory.appendingPathComponent(uniqueName)

        do {
            try FileManager.default.copyItem(at: url, to: destination)
            model.addBook(named: uniqueName)
        } catch {
            importError = error.localizedDescription
        }
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
