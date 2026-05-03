package com.murmur.app.domain.calculator

import com.murmur.app.domain.model.*

/**
 * Generates weekly insights and stats from detected sessions and ledger entries.
 */
object WeeklyReviewEngine {

    fun generateReview(
        startDate: String,
        endDate: String,
        sessions: List<DetectedSession>,
        entries: List<LedgerEntry>,
        previousSessions: List<DetectedSession> = emptyList(),
        previousEntries: List<LedgerEntry> = emptyList()
    ): WeeklyReview {
        val completedEntries = entries.filter { it.sessionId > 0 }
        val totalActiveSeconds = sessions.sumOf { it.activeSeconds }
        val netGainSeconds = completedEntries.sumOf { it.netGainSeconds }

        // Calculate average fatigue for the week
        val dailyDates = sessions.map { it.localDate }.distinct()
        val avgFatigue = if (dailyDates.isNotEmpty()) {
            var totalFatigue = 0
            for (date in dailyDates) {
                val daySessions = sessions.filter { it.localDate == date }
                val dayEntries = entries.filter { it.localDate == date }
                totalFatigue += FatigueCalculator.calculate(daySessions, dayEntries)
            }
            totalFatigue / dailyDates.size
        } else 0

        // Top tools by usage
        val toolGroups = entries.groupBy { it.toolId }
        val totalEntryCount = entries.size.toFloat()
        val topTools = toolGroups.map { (toolId, toolEntries) ->
            val tool = toolEntries.first()
            ToolUsage(
                toolId = toolId,
                toolName = tool.toolName,
                sessionCount = toolEntries.size,
                totalSeconds = toolEntries.sumOf { it.activeSeconds },
                percentage = if (totalEntryCount > 0) toolEntries.size.toFloat() / totalEntryCount else 0.0f
            )
        }.sortedByDescending { it.sessionCount }.take(5)

        // Generate insights
        val insights = generateInsights(
            sessions, entries, previousSessions, previousEntries,
            totalActiveSeconds, netGainSeconds
        )

        // Comparison with previous week
        val comparison = generateComparison(sessions, entries, previousSessions, previousEntries)

        return WeeklyReview(
            startDate = startDate,
            endDate = endDate,
            totalSessions = sessions.size,
            totalActiveSeconds = totalActiveSeconds,
            completedSessions = completedEntries.size,
            netGainSeconds = netGainSeconds,
            avgFatigueScore = avgFatigue,
            topTools = topTools,
            insights = insights,
            comparisonWithPrevious = comparison
        )
    }

    private fun generateInsights(
        sessions: List<DetectedSession>,
        entries: List<LedgerEntry>,
        previousSessions: List<DetectedSession>,
        previousEntries: List<LedgerEntry>,
        totalActiveSeconds: Long,
        netGainSeconds: Long
    ): List<Insight> {
        val insights = mutableListOf<Insight>()

        // Net gain insight
        if (netGainSeconds > 3600) {
            insights.add(
                Insight(
                    title = "高效的一周",
                    description = "本周 AI 使用净节省超过 1 小时时间，继续保持！",
                    type = InsightType.POSITIVE
                )
            )
        } else if (netGainSeconds < 0 && entries.isNotEmpty()) {
            insights.add(
                Insight(
                    title = "AI 使用效率偏低",
                    description = "本周 AI 使用花费的时间超过了节省的时间，建议关注产出质量。",
                    type = InsightType.WARNING
                )
            )
        }

        // Usage trend
        if (previousSessions.isNotEmpty()) {
            val currentCount = sessions.size
            val previousCount = previousSessions.size
            val change = ((currentCount - previousCount).toFloat() / previousCount * 100).toInt()

            if (change > 30) {
                insights.add(
                    Insight(
                        title = "AI 使用量显著增加",
                        description = "与上周相比，AI 使用次数增加了 ${change}%。",
                        type = InsightType.WARNING
                    )
                )
            } else if (change < -20) {
                insights.add(
                    Insight(
                        title = "AI 使用量减少",
                        description = "与上周相比，AI 使用次数减少了 ${-change}%。",
                        type = InsightType.NEUTRAL
                    )
                )
            }
        }

        // Rework insight
        val reworkCount = entries.count { it.hasRework }
        if (entries.isNotEmpty() && reworkCount.toFloat() / entries.size > 0.5f) {
            insights.add(
                Insight(
                    title = "返工比例较高",
                    description = "超过一半的 AI 产出需要修改，建议优化提示词或降低期望。",
                    type = InsightType.WARNING
                )
            )
        }

        // Top tool insight
        val topTool = entries.groupBy { it.toolId }.maxByOrNull { it.value.size }
        if (topTool != null && entries.size >= 5) {
            val percentage = (topTool.value.size * 100) / entries.size
            if (percentage >= 50) {
                insights.add(
                    Insight(
                        title = "最常用工具：${topTool.value.first().toolName}",
                        description = "本周 ${percentage}% 的 AI 使用都集中在 ${topTool.value.first().toolName} 上。",
                        type = InsightType.NEUTRAL
                    )
                )
            }
        }

        // Quality insight
        if (entries.isNotEmpty()) {
            val avgQuality = entries.map { OutputQuality.qualityScores[it.quality] ?: 0.7f }.average()
            if (avgQuality >= 0.85f) {
                insights.add(
                    Insight(
                        title = "AI 产出质量高",
                        description = "大部分 AI 产出可以直接使用，说明你的用法很高效。",
                        type = InsightType.POSITIVE
                    )
                )
            } else if (avgQuality <= 0.4f) {
                insights.add(
                    Insight(
                        title = "AI 产出质量偏低",
                        description = "建议尝试不同的提示方式或工具来提升产出质量。",
                        type = InsightType.WARNING
                    )
                )
            }
        }

        // If no sessions at all
        if (sessions.isEmpty()) {
            insights.add(
                Insight(
                    title = "本周无 AI 使用记录",
                    description = "开始使用 AI 工具吧，Murmur 会帮你追踪使用情况。",
                    type = InsightType.NEUTRAL
                )
            )
        }

        return insights
    }

    private fun generateComparison(
        sessions: List<DetectedSession>,
        entries: List<LedgerEntry>,
        previousSessions: List<DetectedSession>,
        previousEntries: List<LedgerEntry>
    ): String {
        if (previousSessions.isEmpty() && previousEntries.isEmpty()) {
            return "这是第一周使用 Murmur，暂无对比数据。"
        }

        val currentTotal = sessions.size
        val previousTotal = previousSessions.size
        val sessionChange = currentTotal - previousTotal

        val currentNetGain = entries.sumOf { it.netGainSeconds }
        val previousNetGain = previousEntries.sumOf { it.netGainSeconds }

        val parts = mutableListOf<String>()

        if (sessionChange > 0) {
            parts.add("会话数增加 $sessionChange 次")
        } else if (sessionChange < 0) {
            parts.add("会话数减少 ${-sessionChange} 次")
        }

        if (previousNetGain != 0L) {
            val gainChange = ((currentNetGain - previousNetGain).toFloat() / previousNetGain * 100).toInt()
            if (gainChange > 0) {
                parts.add("净收益提升 ${gainChange}%")
            } else if (gainChange < 0) {
                parts.add("净收益下降 ${-gainChange}%")
            }
        }

        return if (parts.isNotEmpty()) parts.joinToString("；") else "与上周基本持平"
    }
}
