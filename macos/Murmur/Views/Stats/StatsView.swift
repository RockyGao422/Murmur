import SwiftUI

struct StatsView: View {
    @EnvironmentObject var viewModel: StatsViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                HStack {
                    Text("统计")
                        .font(.title2)
                        .fontWeight(.bold)
                    Spacer()
                    Picker("天数", selection: Binding(
                        get: { viewModel.selectedDays },
                        set: { viewModel.loadStats(days: $0) }
                    )) {
                        Text("7天").tag(7)
                        Text("14天").tag(14)
                        Text("30天").tag(30)
                        Text("90天").tag(90)
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 250)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)

                // Summary stats
                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 12) {
                    StatCard(title: "总检测", value: "\(viewModel.totalDetectedSessions)次", icon: "number.circle.fill", color: .blue)
                    StatCard(title: "总时长", value: "\(viewModel.totalDetectedMinutes)分钟", icon: "clock.fill", color: .purple)
                    StatCard(title: "总净收益", value: "\(viewModel.totalNetGain)分钟", icon: "chart.line.uptrend.xyaxis", color: viewModel.totalNetGain >= 0 ? .green : .red)
                    StatCard(title: "平均疲劳", value: String(format: "%.0f分", viewModel.averageFatigueScore), icon: "bolt.heart.fill", color: .orange)
                }
                .padding(.horizontal, 20)

                // Charts section
                VStack(alignment: .leading, spacing: 8) {
                    Text("每日检测趋势")
                        .font(.headline)
                        .padding(.horizontal, 20)

                    // Session Count Chart
                    VStack(alignment: .leading, spacing: 4) {
                        Text("检测次数")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                            .padding(.leading, 20)

                        BarChartView(
                            data: viewModel.dailySessionCountTrend.map { ($0.date, Double($0.count)) },
                            maxValue: Double(viewModel.maxSessionCount),
                            color: .blue
                        )
                        .frame(height: 120)
                        .padding(.horizontal, 20)
                    }

                    // Active Minutes Chart
                    VStack(alignment: .leading, spacing: 4) {
                        Text("活跃时长（分钟）")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                            .padding(.leading, 20)

                        BarChartView(
                            data: viewModel.dailyActiveMinutesTrend.map { ($0.date, Double($0.minutes)) },
                            maxValue: Double(viewModel.maxActiveMinutes),
                            color: .purple
                        )
                        .frame(height: 120)
                        .padding(.horizontal, 20)
                    }
                }

                // Distribution sections
                HStack(alignment: .top, spacing: 20) {
                    // Tool distribution
                    VStack(alignment: .leading, spacing: 8) {
                        Text("工具分布")
                            .font(.headline)

                        if viewModel.toolDistribution.isEmpty {
                            Text("暂无数据")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        } else {
                            ForEach(viewModel.toolDistribution.prefix(10), id: \.toolName) { item in
                                DistributionBar(
                                    label: item.toolName,
                                    count: item.count,
                                    total: viewModel.toolDistribution.map(\.count).max() ?? 1,
                                    color: .blue
                                )
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)

                    // Platform distribution
                    VStack(alignment: .leading, spacing: 8) {
                        Text("平台分布")
                            .font(.headline)

                        if viewModel.platformDistribution.isEmpty {
                            Text("暂无数据")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        } else {
                            ForEach(viewModel.platformDistribution, id: \.platform) { item in
                                DistributionBar(
                                    label: item.platform,
                                    count: item.count,
                                    total: viewModel.platformDistribution.map(\.count).max() ?? 1,
                                    color: .green
                                )
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)

                    // Quality distribution
                    VStack(alignment: .leading, spacing: 8) {
                        Text("质量分布")
                            .font(.headline)

                        if viewModel.qualityDistribution.isEmpty {
                            Text("暂无数据")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        } else {
                            ForEach(viewModel.qualityDistribution, id: \.quality) { item in
                                DistributionBar(
                                    label: item.quality,
                                    count: item.count,
                                    total: viewModel.qualityDistribution.map(\.count).max() ?? 1,
                                    color: .orange
                                )
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .padding(.horizontal, 20)

                // Mood distribution
                if !viewModel.moodDistribution.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("使用感受分布")
                            .font(.headline)

                        ForEach(viewModel.moodDistribution, id: \.mood) { item in
                            DistributionBar(
                                label: item.mood,
                                count: item.count,
                                total: viewModel.moodDistribution.map(\.count).max() ?? 1,
                                color: .pink
                            )
                        }
                    }
                    .padding(.horizontal, 20)
                }

                Spacer(minLength: 20)
            }
        }
        .onAppear {
            viewModel.loadStats()
        }
    }
}

// MARK: - Bar Chart View

struct BarChartView: View {
    let data: [(label: String, value: Double)]
    let maxValue: Double
    let color: Color

    var body: some View {
        GeometryReader { geometry in
            HStack(alignment: .bottom, spacing: 2) {
                ForEach(0..<data.count, id: \.self) { index in
                    VStack(spacing: 2) {
                        Rectangle()
                            .fill(color.opacity(0.7))
                            .frame(
                                width: max(4, (geometry.size.width / CGFloat(data.count)) - 2),
                                height: maxValue > 0 ? CGFloat(data[index].value / maxValue) * geometry.size.height : 0
                            )
                            .cornerRadius(1)

                        // Show date label every 7th bar
                        if index % 7 == 0 {
                            Text(formatShortDate(data[index].label))
                                .font(.system(size: 8))
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
            }
        }
    }

    private func formatShortDate(_ dateStr: String) -> String {
        guard dateStr.count >= 10 else { return dateStr }
        let start = dateStr.index(dateStr.startIndex, offsetBy: 5)
        return String(dateStr[start..<dateStr.endIndex])
    }
}

// MARK: - Distribution Bar

struct DistributionBar: View {
    let label: String
    let count: Int
    let total: Int
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            HStack {
                Text(label)
                    .font(.system(size: 11))
                    .lineLimit(1)
                Spacer()
                Text("\(count)")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
            }
            GeometryReader { geometry in
                Rectangle()
                    .fill(color.opacity(0.6))
                    .frame(width: CGFloat(count) / CGFloat(max(1, total)) * geometry.size.width)
                    .cornerRadius(2)
            }
            .frame(height: 6)
        }
    }
}
