import SwiftUI

struct TodayView: View {
    @EnvironmentObject var viewModel: TodayViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                HStack {
                    Text("今日概览")
                        .font(.title2)
                        .fontWeight(.bold)
                    Spacer()
                    DetectionStatusBadge(status: viewModel.detectionStatus)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)

                // Stat Cards Grid
                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 12) {
                    StatCard(
                        title: "AI使用时长",
                        value: viewModel.detectedActiveDuration,
                        icon: "clock.fill",
                        color: .blue
                    )
                    StatCard(
                        title: "检测次数",
                        value: "\(viewModel.detectedSessionCount)次",
                        icon: "number.circle.fill",
                        color: .purple
                    )
                    StatCard(
                        title: "待补全",
                        value: "\(viewModel.pendingSessionCount)条",
                        icon: "tray.fill",
                        color: viewModel.pendingSessionCount > 0 ? .orange : .gray
                    )
                    StatCard(
                        title: "净收益",
                        value: viewModel.netGainFormatted,
                        icon: "chart.line.uptrend.xyaxis",
                        color: viewModel.netGainMinutes >= 0 ? .green : .red
                    )
                    StatCard(
                        title: "疲劳指数",
                        value: viewModel.fatigueLevelDescription,
                        icon: "bolt.heart.fill",
                        color: fatigueColor
                    )
                    StatCard(
                        title: "补全率",
                        value: viewModel.completionRatePercent,
                        icon: "checkmark.circle.fill",
                        color: viewModel.completionRate >= 0.5 ? .green : .orange
                    )
                }
                .padding(.horizontal, 20)

                // Recent Sessions Section
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("最近检测")
                            .font(.headline)
                        Spacer()
                        Text("\(viewModel.detectedSessionCount)条")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 20)

                    if viewModel.recentSessions.isEmpty {
                        EmptyStateView(
                            icon: "magnifyingglass",
                            title: "暂无检测记录",
                            subtitle: "使用AI工具时会自动检测"
                        )
                    } else {
                        LazyVStack(spacing: 0) {
                            ForEach(viewModel.recentSessions) { session in
                                SessionRow(session: session)
                                if session.id != viewModel.recentSessions.last?.id {
                                    Divider().padding(.leading, 56)
                                }
                            }
                        }
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(8)
                        .padding(.horizontal, 20)
                    }
                }

                // Recent Entries Section
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("最近补全")
                            .font(.headline)
                        Spacer()
                        Text("\(viewModel.netGainFormatted)")
                            .font(.caption)
                            .foregroundColor(viewModel.netGainMinutes >= 0 ? .green : .red)
                    }
                    .padding(.horizontal, 20)

                    if viewModel.recentEntries.isEmpty {
                        EmptyStateView(
                            icon: "square.and.pencil",
                            title: "暂无补全记录",
                            subtitle: "完成待补全会话后显示"
                        )
                    } else {
                        LazyVStack(spacing: 0) {
                            ForEach(viewModel.recentEntries) { entry in
                                EntryRow(entry: entry)
                                if entry.id != viewModel.recentEntries.last?.id {
                                    Divider().padding(.leading, 56)
                                }
                            }
                        }
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(8)
                        .padding(.horizontal, 20)
                    }
                }

                Spacer(minLength: 20)
            }
        }
        .onAppear {
            viewModel.loadTodayData()
        }
    }

    private var fatigueColor: Color {
        if viewModel.fatigueScore < 20 { return .green }
        if viewModel.fatigueScore < 40 { return .blue }
        if viewModel.fatigueScore < 60 { return .yellow }
        if viewModel.fatigueScore < 80 { return .orange }
        return .red
    }
}

// MARK: - Stat Card

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(color)

            Text(value)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.primary)

            Text(title)
                .font(.system(size: 11))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(color.opacity(0.05))
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(color.opacity(0.2), lineWidth: 1)
        )
    }
}

// MARK: - Empty State View

struct EmptyStateView: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 36))
                .foregroundColor(.secondary.opacity(0.5))
            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.secondary)
            Text(subtitle)
                .font(.system(size: 12))
                .foregroundColor(.secondary.opacity(0.7))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}
