import SwiftUI

@main
struct MurmurApp: App {
    @StateObject private var detectionManager = DetectionManager()
    @StateObject private var storageManager = StorageManager()
    @StateObject private var todayViewModel: TodayViewModel
    @StateObject private var inboxViewModel: InboxViewModel
    @StateObject private var statsViewModel: StatsViewModel
    @StateObject private var toolsViewModel: ToolsViewModel
    @StateObject private var reviewViewModel: ReviewViewModel
    @StateObject private var settingsViewModel: SettingsViewModel

    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    init() {
        let storage = StorageManager()
        let detection = DetectionManager()

        let todayVM = TodayViewModel(storageManager: storage, detectionManager: detection)
        let inboxVM = InboxViewModel(storageManager: storage)
        let statsVM = StatsViewModel(storageManager: storage)
        let toolsVM = ToolsViewModel(storageManager: storage)
        let reviewVM = ReviewViewModel(storageManager: storage)
        let settingsVM = SettingsViewModel(storageManager: storage, detectionManager: detection)

        _storageManager = StateObject(wrappedValue: storage)
        _detectionManager = StateObject(wrappedValue: detection)
        _todayViewModel = StateObject(wrappedValue: todayVM)
        _inboxViewModel = StateObject(wrappedValue: inboxVM)
        _statsViewModel = StateObject(wrappedValue: statsVM)
        _toolsViewModel = StateObject(wrappedValue: toolsVM)
        _reviewViewModel = StateObject(wrappedValue: reviewVM)
        _settingsViewModel = StateObject(wrappedValue: settingsVM)

        // Wire app delegate with detection manager
        appDelegate = AppDelegate()
        appDelegate.detectionManager = detection
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(detectionManager)
                .environmentObject(storageManager)
                .environmentObject(todayViewModel)
                .environmentObject(inboxViewModel)
                .environmentObject(statsViewModel)
                .environmentObject(toolsViewModel)
                .environmentObject(reviewViewModel)
                .environmentObject(settingsViewModel)
                .frame(minWidth: 900, minHeight: 640)
        }
        .windowStyle(.automatic)
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("关于 Murmur") {
                    // About window
                }
            }
        }
    }
}
