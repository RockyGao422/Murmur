import SwiftUI

struct ReviewView: View {
    @EnvironmentObject var viewModel: ReviewViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header with week selector
                HStack {
                    Text("周复盘")
                        .font(.title2)
                        .fontWeight(.bold)
                    Spacer()

                    HStack(spacing: 12) {
                        Button(action: { viewModel.previousWeek() }) {
                            Image(systemName: "chevron.left")
                        }
                        .buttonStyle(.plain)

                        Text(viewModel.weekLabel)
                            .font(.system(size: 13, weight: .medium))
                            .frame(minWidth: 200)

                        Button(action: { viewModel.nextWeek() }) {
                            Image(systemName: "chevron.right")
                        }
                        .buttonStyle(.plain)
                        .disabled(!viewModel.canGoNext)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color(NSColor.controlBackgroundColor))
                    .cornerRadius(8)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)

                if let review = viewModel.currentWeekReview {
                    // Detection Overview
                    VStack(alignment: .leading, spacing: 8) {
                        Text("自动检测概览")
                            .font(.headline)

                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible()),
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: 8) {
                            ReviewStatItem(label: "检测会话", value: "\(review.detectionSummary.totalDetectedSessions)")
                            ReviewStatItem(label: "活跃时长", value: "\(review.detectionSummary.totalDetectedActiveMinutes)分钟")
                            ReviewStatItem(label: "使用工具", value: "\(review.detectionSummary.distinctToolsUsed)种")
                            ReviewStatItem(label: "夜间使用", value: "\(review.detectionSummary.nightSessionCount)次")
                            ReviewStatItem(label: "待补全", value: "\(review.detectionSummary.totalPendingSessions)条")
                            ReviewStatItem(label: "已补全", value: "\(review.detectionSummary.totalCompletedEntries)条")
                            ReviewStatItem(label: "补全率", value: String(format: "%.0f%%", review.detectionSummary.completionRate * 100))
                        }
                    }
                    .padding(.horizontal, 20)

                    // Ledger Summary (only if there are entries)
                    if review.detectionSummary.totalCompletedEntries > 0 {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("账本摘要")
                                .font(.headline)

                            LazyVGrid(columns: [
                                GridItem(.flexible()),
                                GridItem(.flexible()),
                                GridItem(.flexible()),
                                GridItem(.flexible())
                            ], spacing: 8) {
                                ReviewStatItem(label: "预估节省", value: "\(review.ledgerSummary.totalEstimatedSavedMinutes)分钟", color: .green)
                                ReviewStatItem(label: "额外投入", value: "\(review.ledgerSummary.totalExtraCostMinutes)分钟", color: .orange)
                                ReviewStatItem(label: "净收益", value: "\(review.ledgerSummary.netGainMinutes)分钟", color: review.ledgerSummary.netGainMinutes >= 0 ? .green : .red)
                                ReviewStatItem(label: "返工率", value: String(format: "%.0f%%", review.ledgerSummary.reworkRate * 100), color: review.ledgerSummary.reworkRate > 0.3 ? .red : .green)
                                ReviewStatItem(label: "平均质量", value: String(format: "%.1f/4", review.ledgerSummary.avgQualityScore))
                                ReviewStatItem(label: "返工时长", value: "\(review.ledgerSummary.totalReworkMinutes)分钟")
                            }
                        }
                        .padding(.horizontal, 20)
                    } else {
                        EmptyStateView(
                            icon: "tray",
                            title: "暂无补全数据",
                            subtitle: "完成待补全会话后显示账本摘要"
                        )
                    }

                    // Insights
                    if !review.insights.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("本周洞察")
                                .font(.headline)

                            ForEach(review.insights) { insight in
                                InsightCard(insight: insight)
                            }
                        }
                        .padding(.horizontal, 20)
                    }

                    // Recommendations
                    if !review.recommendations.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("建议")
                                .font(.headline)

                            ForEach(Array(review.recommendations.enumerated()), id: \.offset) { index, recommendation in
                                HStack(spacing: 8) {
                                    Image(systemName: "lightbulb.fill")
                                        .foregroundColor(.yellow)
                                        .font(.system(size: 12))
                                    Text(recommendation)
                                        .font(.system(size: 13))
                                    Spacer()
                                }
                                .padding(10)
                                .background(Color.yellow.opacity(0.05))
                                .cornerRadius(6)
                            }
                        }
                        .padding(.horizontal, 20)
                    }

                } else {
                    EmptyStateView(
                        icon: "calendar.badge.exclamationmark",
                        title: "暂无数据",
                        subtitle: "该周没有检测到AI使用记录"
                    )
                }

                // Past reviews
                if !viewModel.pastReviews.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("历史周报")
                            .font(.headline)

                        ForEach(viewModel.pastReviews.prefix(5)) { review in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(review.weekStart) - \(review.weekEnd)")
                                        .font(.system(size: 12, weight: .medium))
                                    Text("\(review.detectionSummary.totalDetectedSessions)次检测 | \(review.ledgerSummary.netGainMinutes)分钟净收益")
                                        .font(.system(size: 11))
                                        .foregroundColor(.secondary)
                                }
                                Spacer()
                                Text(String(format: "%.0f%%补全", review.detectionSummary.completionRate * 100))
                                    .font(.system(size: 11))
                                    .foregroundColor(.blue)
                            }
                            .padding(10)
                            .background(Color(NSColor.controlBackgroundColor))
                            .cornerRadius(6)
                            .onTapGesture {
                                viewModel.selectWeek(start: review.weekStart, end: review.weekEnd)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                }

                Spacer(minLength: 20)
            }
        }
        .onAppear {
            viewModel.loadWeekReview()
        }
    }
}

// MARK: - Review Stat Item

struct ReviewStatItem: View {
    let label: String
    let value: String
    var color: Color = .primary

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(color)
            Text(label)
                .font(.system(size: 10))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(color.opacity(0.05))
        .cornerRadius(6)
    }
}

// MARK: - Insight Card

struct InsightCard: View {
    let insight: WeeklyReviewEngine.Insight

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: insightIcon)
                .font(.system(size: 16))
                .foregroundColor(insightColor)
                .frame(width: 32, height: 32)
                .background(insightColor.opacity(0.1))
                .cornerRadius(8)

            VStack(alignment: .leading, spacing: 2) {
                Text(insight.title)
                    .font(.system(size: 12, weight: .semibold))
                Text(insight.message)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }

            Spacer()
        }
        .padding(10)
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(8)
    }

    private var insightColor: Color {
        switch insight.type {
        case "high_frequency_tool": return .blue
        case "high_switch": return .orange
        case "pending_backlog": return .yellow
        case "best_use_case": return .green
        case "worst_use_case": return .red
        default: return .gray
        }
    }

    private var insightIcon: String {
        switch insight.type {
        case "high_frequency_tool": return "flame.fill"
        case "high_switch": return "arrow.triangle.swap"
        case "pending_backlog": return "tray.full.fill"
        case "best_use_case": return "hand.thumbsup.fill"
        case "worst_use_case": return "hand.thumbsdown.fill"
        default: return "info.circle.fill"
        }
    }
}
