import SwiftUI

@main
struct BookmarkApp: App {
    @StateObject private var model = PlayerModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                PlayerView()
            }
            .environmentObject(model)
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .inactive || newPhase == .background {
                    model.saveProgress()
                }
            }
        }
    }
}
