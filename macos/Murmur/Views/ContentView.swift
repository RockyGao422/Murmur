import SwiftUI

struct ContentView: View {
    @EnvironmentObject var todayViewModel: TodayViewModel
    @EnvironmentObject var inboxViewModel: InboxViewModel
    @EnvironmentObject var statsViewModel: StatsViewModel
    @EnvironmentObject var toolsViewModel: ToolsViewModel
    @EnvironmentObject var reviewViewModel: ReviewViewModel
    @EnvironmentObject var settingsViewModel: SettingsViewModel

    @State private var selectedTab: NavigationTab = .today

    enum NavigationTab: String, CaseIterable {
        case today = "今日"
        case inbox = "待补全"
        case stats = "统计"
        case tools = "工具"
        case review = "复盘"
        case settings = "设置"

        var icon: String {
            switch self {
            case .today: return "sun.max.fill"
            case .inbox: return "tray.full.fill"
            case .stats: return "chart.bar.fill"
            case .tools: return "wrench.and.screwdriver.fill"
            case .review: return "doc.text.magnifyingglass"
            case .settings: return "gearshape.fill"
            }
        }
    }

    var body: some View {
        NavigationSplitView {
            // Sidebar
            List(selection: $selectedTab) {
                ForEach(NavigationTab.allCases, id: \.self) { tab in
                    NavigationLink(value: tab) {
                        Label(tab.rawValue, systemImage: tab.icon)
                            .font(.system(size: 14))
                    }
                    .padding(.vertical, 2)
                }
            }
            .listStyle(.sidebar)
            .frame(minWidth: 160)
            .onChange(of: selectedTab) { _ in
                loadDataForTab()
            }
        } detail: {
            // Content area
            switch selectedTab {
            case .today:
                TodayView()
            case .inbox:
                InboxView()
            case .stats:
                StatsView()
            case .tools:
                ToolsView()
            case .review:
                ReviewView()
            case .settings:
                SettingsView()
            }
        }
        .onAppear {
            loadDataForTab()
        }
    }

    private func loadDataForTab() {
        switch selectedTab {
        case .today:
            todayViewModel.loadTodayData()
        case .inbox:
            inboxViewModel.loadInbox()
        case .stats:
            statsViewModel.loadStats()
        case .tools:
            toolsViewModel.loadTools()
        case .review:
            reviewViewModel.loadWeekReview()
        case .settings:
            settingsViewModel.loadSettings()
        }
    }
}
