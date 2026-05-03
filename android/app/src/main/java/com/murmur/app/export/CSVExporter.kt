package com.murmur.app.export

import com.murmur.app.domain.model.DetectedSession
import com.murmur.app.domain.model.LedgerEntry
import java.io.StringWriter

/**
 * Exports sessions and ledger entries to CSV format.
 * Uses Android Sharesheet or file save for distribution.
 */
object CSVExporter {

    /**
     * Export sessions to CSV.
     */
    fun exportSessions(sessions: List<DetectedSession>): String {
        val writer = StringWriter()
        writer.appendLine("ID,工具名称,包名,平台,来源类型,本地日期,开始时间,结束时间,活跃秒数,状态,置信度,检测时间,创建时间,更新时间")

        for (session in sessions) {
            writer.appendLine(
                listOf(
                    session.id.toString(),
                    escapeCsv(session.toolName),
                    escapeCsv(session.packageName),
                    session.sourcePlatform.value,
                    session.sourceKind.value,
                    session.localDate,
                    formatTimestamp(session.startedAt),
                    formatTimestamp(session.endedAt),
                    session.activeSeconds.toString(),
                    session.status.value,
                    "%.2f".format(session.confidence),
                    formatTimestamp(session.detectedAt),
                    formatTimestamp(session.createdAt),
                    formatTimestamp(session.updatedAt)
                ).joinToString(",")
            )
        }

        return writer.toString()
    }

    /**
     * Export ledger entries to CSV.
     */
    fun exportEntries(entries: List<LedgerEntry>): String {
        val writer = StringWriter()
        writer.appendLine("ID,会话ID,工具ID,工具名称,平台,本地日期,活跃秒数,使用场景,产出质量,使用心情,节省时间秒,额外耗时秒,净收益秒,需要返工,输入次数,输出次数,备注,创建时间,更新时间")

        for (entry in entries) {
            writer.appendLine(
                listOf(
                    entry.id.toString(),
                    entry.sessionId.toString(),
                    escapeCsv(entry.toolId),
                    escapeCsv(entry.toolName),
                    entry.sourcePlatform.value,
                    entry.localDate,
                    entry.activeSeconds.toString(),
                    escapeCsv(entry.useCase),
                    entry.quality.label,
                    entry.mood.label,
                    entry.timeSavedSeconds.toString(),
                    entry.extraCostSeconds.toString(),
                    entry.netGainSeconds.toString(),
                    if (entry.hasRework) "是" else "否",
                    entry.inputCount.toString(),
                    entry.outputCount.toString(),
                    escapeCsv(entry.notes),
                    formatTimestamp(entry.createdAt),
                    formatTimestamp(entry.updatedAt)
                ).joinToString(",")
            )
        }

        return writer.toString()
    }

    /**
     * Export combined sessions and entries report.
     */
    fun exportReport(
        sessions: List<DetectedSession>,
        entries: List<LedgerEntry>
    ): Pair<String, String> {
        val sessionCsv = exportSessions(sessions)
        val entryCsv = exportEntries(entries)

        // Combined report with summary header
        val totalDuration = sessions.sumOf { it.activeSeconds }
        val totalNetGain = entries.sumOf { it.netGainSeconds }
        val totalTimeSaved = entries.sumOf { it.timeSavedSeconds }
        val totalExtraCost = entries.sumOf { it.extraCostSeconds }

        val summary = buildString {
            appendLine("Murmur 数据导出报告")
            appendLine("导出时间,${formatTimestamp(System.currentTimeMillis())}")
            appendLine("总会话数,${sessions.size}")
            appendLine("总时长(秒),$totalDuration")
            appendLine("补全记录数,${entries.size}")
            appendLine("净收益(秒),$totalNetGain")
            appendLine("总节省时间(秒),$totalTimeSaved")
            appendLine("总额外耗时(秒),$totalExtraCost")
            appendLine()
        }

        return Pair("$summary\n$sessionCsv", entryCsv)
    }

    fun exportAllData(
        sessions: List<DetectedSession>,
        entries: List<LedgerEntry>
    ): String {
        val (sessionCsv, entryCsv) = exportReport(sessions, entries)
        return buildString {
            appendLine("=== Murmur 数据导出 ===")
            appendLine()
            appendLine("--- 会话记录 ---")
            append(sessionCsv)
            appendLine()
            appendLine("--- 补全记录 ---")
            append(entryCsv)
        }
    }

    private fun escapeCsv(value: String): String {
        return if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            "\"${value.replace("\"", "\"\"")}\""
        } else {
            value
        }
    }

    private fun formatTimestamp(millis: Long): String {
        if (millis == 0L) return ""
        return java.time.Instant.ofEpochMilli(millis)
            .atZone(java.time.ZoneId.systemDefault())
            .toLocalDateTime()
            .toString()
            .replace("T", " ")
    }
}
