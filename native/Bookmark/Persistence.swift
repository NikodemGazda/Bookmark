import Foundation

enum Storage {
    static var documentsDirectory: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    static func url(forFileName fileName: String) -> URL {
        documentsDirectory.appendingPathComponent(fileName)
    }

    static func uniqueFileName(for fileName: String) -> String {
        let url = documentsDirectory.appendingPathComponent(fileName)
        guard FileManager.default.fileExists(atPath: url.path) else { return fileName }
        let base = (fileName as NSString).deletingPathExtension
        let ext = (fileName as NSString).pathExtension
        var counter = 2
        while true {
            let candidate = "\(base)-\(counter).\(ext)"
            if !FileManager.default.fileExists(atPath: documentsDirectory.appendingPathComponent(candidate).path) {
                return candidate
            }
            counter += 1
        }
    }
}

final class ProgressStore {
    private let defaults: UserDefaults
    private let booksKey = "bookmark.books"
    private let lastPlayedKey = "bookmark.lastPlayedFileName"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func loadBooks() -> [Book] {
        guard let data = defaults.data(forKey: booksKey) else { return [] }
        return (try? JSONDecoder().decode([Book].self, from: data)) ?? []
    }

    func saveBooks(_ books: [Book]) {
        guard let data = try? JSONEncoder().encode(books) else { return }
        defaults.set(data, forKey: booksKey)
    }

    func upsertPosition(fileName: String, position: Double) -> [Book] {
        var books = loadBooks()
        if let index = books.firstIndex(where: { $0.fileName == fileName }) {
            books[index].lastPosition = position
        } else {
            books.append(Book(fileName: fileName, lastPosition: position))
        }
        saveBooks(books)
        return books
    }

    func removeBook(fileName: String) -> [Book] {
        var books = loadBooks()
        books.removeAll { $0.fileName == fileName }
        saveBooks(books)
        return books
    }

    func setLastPlayed(_ fileName: String) {
        defaults.set(fileName, forKey: lastPlayedKey)
    }

    func lastPlayedFileName() -> String? {
        defaults.string(forKey: lastPlayedKey)
    }
}
