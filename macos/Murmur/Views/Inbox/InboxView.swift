import SwiftUI

struct InboxView: View {
    @EnvironmentObject var viewModel: InboxViewModel
    @State private var showCompletionSheet: Bool = false
    @State private var selectedSession: DetectedSession?
    @State private var selectedTab: InboxTab = .pending

    enum InboxTab: String, CaseIterable {
        case pending = "待补全"
        case suspected = "疑似"
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("待补全")
                    .font(.title2)
                    .fontWeight(.bold)
                Spacer()

                // Batch actions toolbar
                if !viewModel.pendingSessions.isEmpty {
                    HStack(spacing: 12) {
                        Button(action: batchIgnore) {
                            Label("批量忽略", systemImage: "xmark.circle")
                                .font(.system(size: 12))
                        }
                        .disabled(viewModel.pendingSessions.isEmpty)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 8)

            // Merge Suggestions Banner
            if !viewModel.mergeSuggestions.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(viewModel.mergeSuggestions.prefix(3), id: \.session1.id) { suggestion in
                        MergeSuggestionBanner(
                            session1: suggestion.session1,
                            session2: suggestion.session2,
                            reason: suggestion.reason,
                            onMerge: {
                                viewModel.mergeSessions(source: suggestion.session1, target: suggestion.session2)
                            }
                        )
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 8)
            }

            // Tab Picker
            Picker("", selection: $selectedTab) {
                ForEach(InboxTab.allCases, id: \.self) { tab in
                    Text("\(tab.rawValue) (\(tab == .pending ? viewModel.totalPending : viewModel.totalSuspected))")
                        .tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 20)
            .padding(.bottom, 8)

            // Content
            if selectedTab == .pending {
                pendingContent
            } else {
                suspectedContent
            }
        }
        .onAppear {
            viewModel.loadInbox()
        }
        .sheet(isPresented: $showCompletionSheet) {
            if let session = selectedSession {
                CompletionView(session: session)
                    .onDisappear {
                        viewModel.loadInbox()
                    }
            }
        }
    }

    // MARK: - Pending Content

    private var pendingContent: some View {
        Group {
            if viewModel.pendingSessions.isEmpty {
                EmptyStateView(
                    icon: "tray.full",
                    title: "没有待补全的会话",
                    subtitle: "使用AI工具时会自动检测并显示在这里"
                )
            } else {
                List {
                    ForEach(viewModel.pendingGroupedByDate, id: \.date) { group in
                        Section(header: Text(formatGroupDate(group.date))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)
                        ) {
                            ForEach(group.sessions) { session in
                                SessionRow(
                                    session: session,
                                    showActions: true,
                                    onComplete: {
                                        selectedSession = session
                                        showCompletionSheet = true
                                    },
                                    onIgnore: {
                                        viewModel.ignoreSession(session)
                                    }
                                )
                            }
                        }
                    }
                }
                .listStyle(.inset)
            }
        }
    }

    // MARK: - Suspected Content

    private var suspectedContent: some View {
        Group {
            if viewModel.suspectedSessions.isEmpty {
                EmptyStateView(
                    icon: "questionmark.circle",
                    title: "没有疑似会话",
                    subtitle: "置信度较低或时长较短的会话会显示在这里"
                )
            } else {
                List {
                    ForEach(viewModel.suspectedSessions) { session in
                        SessionRow(
                            session: session,
                            showActions: true,
                            onComplete: {
                                selectedSession = session
                                showCompletionSheet = true
                            },
                            onIgnore: {
                                viewModel.ignoreSession(session)
                            }
                        )
                    }
                }
                .listStyle(.inset)
            }
        }
    }

    // MARK: - Actions

    private func batchIgnore() {
        viewModel.batchIgnore(viewModel.pendingSessions)
    }

    private func formatGroupDate(_ dateStr: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: dateStr) else { return dateStr }

        let today = formatter.string(from: Date())
        let yesterday = formatter.string(from: Calendar.current.date(byAdding: .day, value: -1, to: Date())!)

        if dateStr == today {
            return "今天"
        } else if dateStr == yesterday {
            return "昨天"
        } else {
            let displayFormatter = DateFormatter()
            displayFormatter.dateFormat = "M月d日 EEEE"
            return displayFormatter.string(from: date)
        }
    }
}

// MARK: - Merge Suggestion Banner

struct MergeSuggestionBanner: View {
    let session1: DetectedSession
    let session2: DetectedSession
    let reason: String
    let onMerge: () -> Void

    var body: some View {
        HStack {
            Image(systemName: "arrow.triangle.merge")
                .foregroundColor(.blue)
                .font(.system(size: 14))

            VStack(alignment: .leading, spacing: 2) {
                Text("建议合并")
                    .font(.system(size: 12, weight: .semibold))
                Text(reason)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            Spacer()

            Button("合并") {
                onMerge()
            }
            .font(.system(size: 11))
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
        }
        .padding(10)
        .background(Color.blue.opacity(0.05))
        .cornerRadius(8)
    }
}
