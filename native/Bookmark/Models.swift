import Foundation

struct Book: Codable, Identifiable, Equatable {
    let id: UUID
    var fileName: String
    var lastPosition: Double

    init(fileName: String, lastPosition: Double = 0) {
        self.id = UUID()
        self.fileName = fileName
        self.lastPosition = lastPosition
    }

    var title: String {
        (fileName as NSString).deletingPathExtension
    }
}
