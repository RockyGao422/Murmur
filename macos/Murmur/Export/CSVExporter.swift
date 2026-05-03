import Foundation

class CSVExporter {

    private let dateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = TimeZone.current
        return formatter
    }()

    // MARK: - Export Sessions

    func exportSessions(_ sessions: [DetectedSession], to url: URL) throws {
        let headers = [
            "id", "source_platform", "source_kind", "detector_id",
            "tool_id", "tool_name", "raw_app_name", "raw_bundle_id",
            "raw_package_name", "raw_domain", "raw_url_pattern",
            "window_title_hash", "started_at", "ended_at",
            "active_seconds", "idle_seconds", "local_date",
            "timezone", "is_night", "confidence", "status",
            "merged_into_session_id", "prompt_count",
            "created_at", "updated_at"
        ]

        var csv = headers.joined(separator: ",") + "\n"

        for session in sessions {
            let row = [
                csvEscape(session.id),
                csvEscape(session.sourcePlatform.rawValue),
                csvEscape(session.sourceKind.rawValue),
                csvEscape(session.detectorId),
                csvEscape(session.toolId ?? ""),
                csvEscape(session.toolName ?? ""),
                csvEscape(session.rawAppName ?? ""),
                csvEscape(session.rawBundleId ?? ""),
                csvEscape(session.rawPackageName ?? ""),
                csvEscape(session.rawDomain ?? ""),
                csvEscape(session.rawUrlPattern ?? ""),
                csvEscape(session.windowTitleHash ?? ""),
                csvEscape(dateFormatter.string(from: session.startedAt)),
                csvEscape(dateFormatter.string(from: session.endedAt)),
                "\(session.activeSeconds)",
                "\(session.idleSeconds)",
                csvEscape(session.localDate),
                csvEscape(session.timezone),
                session.isNight ? "true" : "false",
                String(format: "%.2f", session.confidence),
                csvEscape(session.status.rawValue),
                csvEscape(session.mergedIntoSessionId ?? ""),
                "\(session.promptCount)",
                csvEscape(dateFormatter.string(from: session.createdAt)),
                csvEscape(dateFormatter.string(from: session.updatedAt))
            ]
            csv += row.joined(separator: ",") + "\n"
        }

        try csv.write(to: url, atomically: true, encoding: .utf8)
    }

    // MARK: - Export Entries

    func exportEntries(_ entries: [LedgerEntry], to url: URL) throws {
        let headers = [
            "id", "detected_session_id", "source_platform",
            "tool_id", "tool_name", "use_case_id", "use_case_name",
            "estimated_saved_minutes", "prompt_minutes", "review_minutes",
            "edit_minutes", "debug_minutes", "rework_minutes",
            "total_extra_cost_minutes", "net_gain_minutes",
            "quality", "quality_score", "quality_penalty",
            "mood", "mood_weight", "has_rework",
            "note", "local_date", "timezone",
            "created_at", "updated_at"
        ]

        var csv = headers.joined(separator: ",") + "\n"

        for entry in entries {
            let row = [
                csvEscape(entry.id),
                csvEscape(entry.detectedSessionId),
                csvEscape(entry.sourcePlatform.rawValue),
                csvEscape(entry.toolId),
                csvEscape(entry.toolName),
                csvEscape(entry.useCaseId),
                csvEscape(entry.useCaseName),
                "\(entry.estimatedSavedMinutes)",
                "\(entry.promptMinutes)",
                "\(entry.reviewMinutes)",
                "\(entry.editMinutes)",
                "\(entry.debugMinutes)",
                "\(entry.reworkMinutes)",
                "\(entry.totalExtraCostMinutes)",
                "\(entry.netGainMinutes)",
                csvEscape(entry.quality.rawValue),
                "\(entry.qualityScore)",
                "\(entry.qualityPenalty)",
                csvEscape(entry.mood.rawValue),
                "\(entry.moodWeight)",
                entry.hasRework ? "true" : "false",
                csvEscape(entry.note ?? ""),
                csvEscape(entry.localDate),
                csvEscape(entry.timezone),
                csvEscape(dateFormatter.string(from: entry.createdAt)),
                csvEscape(dateFormatter.string(from: entry.updatedAt))
            ]
            csv += row.joined(separator: ",") + "\n"
        }

        try csv.write(to: url, atomically: true, encoding: .utf8)
    }

    // MARK: - CSV Escaping

    private func csvEscape(_ value: String) -> String {
        if value.contains(",") || value.contains("\"") || value.contains("\n") {
            let escaped = value.replacingOccurrences(of: "\"", with: "\"\"")
            return "\"\(escaped)\""
        }
        return value
    }
}
