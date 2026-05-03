package com.murmur.app.export

import com.murmur.app.domain.model.DetectedSession
import com.murmur.app.domain.model.DailySummary
import com.murmur.app.domain.model.LedgerEntry
import com.murmur.app.domain.model.SessionStatus
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.WeekFields
import java.util.Locale

/**
 * Generates Markdown weekly review reports for export.
 * Uses domain models returned by repositories.
 */
object MarkdownExporter {

    data class WeeklyData(
        val weekStart: LocalDate,
        val weekEnd: LocalDate,
        val sessions: List<DetectedSession>,
        val entries: List<LedgerEntry>,
        val dailySummaries: List<DailySummary>
    )

    fun exportMarkdown(data: WeeklyData): String {
        val sb = StringBuilder()
        sb.appendLine("# Murmur 周报")
        sb.appendLine()
        sb.appendLine("**周期**: ${formatDate(data.weekStart)} ~ ${formatDate(data.weekEnd)}")
        sb.appendLine()
        sb.appendLine("---")
        sb.appendLine()
        sb.append(detectionSection(data.sessions))
        sb.append(ledgerSection(data.entries))
        sb.append(pendingSection(data.sessions))
        sb.append(bestUseCasesSection(data.entries))
        sb.append(highFrictionSection(data.entries))
        sb.append(recommendationsSection(data))
        sb.appendLine()
        sb.appendLine("---")
        sb.appendLine()
        sb.appendLine("*由 Murmur 自动生成，数据仅保存在本地。*")
        return sb.toString()
    }

    private fun detectionSection(sessions: List<DetectedSession>): String {
        val totalSessions = sessions.size
        val totalActiveMinutes = sessions.sumOf { it.activeSeconds } / 60
        val uniqueTools = sessions.map { it.toolName }.distinct().size
        val nightCount = sessions.count { isNightSession(it) }
        val completedCount = sessions.count { it.status == SessionStatus.COMPLETED }
        val pendingCount = sessions.count {
            it.status == SessionStatus.PENDING || it.status == SessionStatus.SUSPECTED
        }
        val completionRate = if (totalSessions > 0) completedCount * 100 / totalSessions else 0

        val sb = StringBuilder()
        sb.appendLine("## 自动检测概览")
        sb.appendLine()
        sb.appendLine("| 指标 | 数值 |")
        sb.appendLine("|------|------|")
        sb.appendLine("| 检测会话数 | $totalSessions |")
        sb.appendLine("| AI 使用总时长 | $totalActiveMinutes 分钟 |")
        sb.appendLine("| 使用的 AI 工具 | $uniqueTools 个 |")
        sb.appendLine("| 夜间使用次数 | $nightCount |")
        sb.appendLine("| 已补全 | $completedCount ($completionRate%) |")
        sb.appendLine("| 待补全 | $pendingCount |")
        sb.appendLine()

        val toolGroups = sessions.groupBy { it.toolName }
        val sortedTools = toolGroups.map { (tool, items) ->
            Triple(tool, items.size, items.sumOf { it.activeSeconds } / 60)
        }.sortedByDescending { it.second }

        if (sortedTools.isNotEmpty()) {
            sb.appendLine("### 工具使用分布")
            sb.appendLine()
            sb.appendLine("| 工具 | 会话数 | 使用时长(分钟) |")
            sb.appendLine("|------|--------|---------------|")
            sortedTools.take(10).forEach { (tool, count, minutes) ->
                sb.appendLine("| $tool | $count | $minutes |")
            }
            sb.appendLine()
        }

        return sb.toString()
    }

    private fun ledgerSection(entries: List<LedgerEntry>): String {
        if (entries.isEmpty()) {
            return "## 已补全收益\n\n*本周尚无已补全记录。*\n\n"
        }

        val totalSavedMinutes = entries.sumOf { it.timeSavedSeconds } / 60
        val totalCostMinutes = entries.sumOf { it.extraCostSeconds } / 60
        val netGainMinutes = entries.sumOf { it.netGainSeconds } / 60
        val reworkRate = entries.count { it.hasRework } * 100 / maxOf(entries.size, 1)

        val sb = StringBuilder()
        sb.appendLine("## 已补全收益")
        sb.appendLine()
        sb.appendLine("| 指标 | 数值 |")
        sb.appendLine("|------|------|")
        sb.appendLine("| 补全记录数 | ${entries.size} |")
        sb.appendLine("| 估计节省时间 | $totalSavedMinutes 分钟 |")
        sb.appendLine("| 额外成本 | $totalCostMinutes 分钟 |")
        sb.appendLine("| 净收益 | $netGainMinutes 分钟 |")
        sb.appendLine("| 返工率 | $reworkRate% |")
        sb.appendLine()

        val topEntries = entries.sortedByDescending { it.netGainSeconds }.take(3)
        if (topEntries.isNotEmpty()) {
            sb.appendLine("### 最高收益记录")
            sb.appendLine()
            topEntries.forEach { entry ->
                sb.appendLine("- **${entry.toolName}** · ${entry.useCase}: 净收益 ${entry.netGainSeconds / 60} 分钟")
            }
            sb.appendLine()
        }

        return sb.toString()
    }

    private fun pendingSection(sessions: List<DetectedSession>): String {
        val pending = sessions.filter {
            it.status == SessionStatus.PENDING || it.status == SessionStatus.SUSPECTED
        }
        if (pending.isEmpty()) return ""

        val pendingMinutes = pending.sumOf { it.activeSeconds } / 60
        val sb = StringBuilder()
        sb.appendLine("## 待补全会话")
        sb.appendLine()
        sb.appendLine("还有 **${pending.size}** 条会话待补全（共 $pendingMinutes 分钟），补全后可获得更完整的收益分析。")
        sb.appendLine()

        val groupedByTool = pending.groupBy { it.toolName }
        groupedByTool.entries.sortedByDescending { it.value.size }.forEach { (tool, toolSessions) ->
            sb.appendLine("- $tool: ${toolSessions.size} 条待补全")
        }
        sb.appendLine()
        return sb.toString()
    }

    private fun bestUseCasesSection(entries: List<LedgerEntry>): String {
        val grouped = entries.groupBy { it.useCase }
        val stats = grouped.mapNotNull { (useCase, items) ->
            if (items.size < 3) return@mapNotNull null
            val avgNetSeconds = items.sumOf { it.netGainSeconds } / items.size
            if (avgNetSeconds <= 0) return@mapNotNull null
            Triple(useCase, items.size, avgNetSeconds / 60)
        }.sortedByDescending { it.third }

        if (stats.isEmpty()) return ""

        val sb = StringBuilder()
        sb.appendLine("## 最省力场景")
        sb.appendLine()
        sb.appendLine("| 场景 | 记录数 | 平均净收益 |")
        sb.appendLine("|------|--------|-----------|")
        stats.forEach { (useCase, count, avgNetMin) ->
            sb.appendLine("| $useCase | $count | $avgNetMin 分钟 |")
        }
        sb.appendLine()
        return sb.toString()
    }

    private fun highFrictionSection(entries: List<LedgerEntry>): String {
        val grouped = entries.groupBy { it.toolName }
        val friction = grouped.filter { (_, items) ->
            items.size >= 3 && items.sumOf { it.netGainSeconds } / items.size < 0
        }

        if (friction.isEmpty()) return ""

        val sb = StringBuilder()
        sb.appendLine("## 高摩擦工具")
        sb.appendLine()
        sb.appendLine("以下工具的平均净收益为负，建议评估使用方式：")
        sb.appendLine()
        friction.entries.sortedBy { (_, items) -> items.sumOf { it.netGainSeconds } / items.size }
            .forEach { (tool, items) ->
                val avgNetMin = items.sumOf { it.netGainSeconds } / items.size / 60
                val reworkRate = items.count { it.hasRework } * 100 / items.size
                sb.appendLine("- **$tool**: 平均净收益 $avgNetMin 分钟，返工率 $reworkRate%")
            }
        sb.appendLine()
        return sb.toString()
    }

    private fun recommendationsSection(data: WeeklyData): String {
        val sb = StringBuilder()
        sb.appendLine("## 下周建议")
        sb.appendLine()

        val recs = mutableListOf<String>()

        val pendingCount = data.sessions.count {
            it.status == SessionStatus.PENDING || it.status == SessionStatus.SUSPECTED
        }
        if (pendingCount >= 5) {
            recs.add("补全 $pendingCount 条待补全会话以获取更完整的周报")
        }

        val nightCount = data.sessions.count { isNightSession(it) }
        if (nightCount >= 5) {
            recs.add("减少深夜 AI 使用，避免影响睡眠质量")
        }

        if (data.entries.isNotEmpty()) {
            val reworkRate = data.entries.count { it.hasRework } * 100 / data.entries.size
            if (reworkRate > 40) {
                recs.add("返工率较高（$reworkRate%），建议更精确的 prompt 或分步骤输出")
            }
        }

        if (recs.isEmpty()) {
            recs.add("保持良好的 AI 使用习惯，继续记录以获取更多洞察")
        }

        recs.forEachIndexed { index, rec ->
            sb.appendLine("${index + 1}. $rec")
        }
        sb.appendLine()

        return sb.toString()
    }

    private fun isNightSession(session: DetectedSession): Boolean {
        if (session.startedAt <= 0) return false
        val instant = Instant.ofEpochMilli(session.startedAt)
        val hour = instant.atZone(ZoneId.systemDefault()).hour
        return hour >= 22 || hour < 6
    }

    private fun formatDate(date: LocalDate): String {
        return date.format(DateTimeFormatter.ISO_LOCAL_DATE)
    }

    fun getWeekStart(date: LocalDate): LocalDate {
        val weekField = WeekFields.of(Locale.getDefault()).dayOfWeek()
        return date.with(weekField, 1)
    }

    fun getWeekEnd(weekStart: LocalDate): LocalDate {
        return weekStart.plusDays(6)
    }
}
