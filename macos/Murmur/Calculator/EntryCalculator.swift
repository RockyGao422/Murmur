import Foundation

struct EntryCalculator {

    /// Calculate all derived fields for a LedgerEntry based on user inputs
    static func calculate(
        session: DetectedSession,
        useCaseId: String,
        useCaseName: String,
        estimatedSavedMinutes: Int,
        promptMinutes: Int,
        reviewMinutes: Int,
        editMinutes: Int,
        debugMinutes: Int,
        reworkMinutes: Int,
        quality: OutputQuality,
        mood: UserMood,
        note: String?
    ) -> LedgerEntry {
        // totalExtraCost = prompt + review + edit + debug + rework
        let totalExtraCost = promptMinutes + reviewMinutes + editMinutes + debugMinutes + reworkMinutes

        // netGain = estimatedSaved - totalExtraCost
        let netGain = estimatedSavedMinutes - totalExtraCost

        // Quality score mapping and penalty
        let qualityScore = quality.score
        let qualityPenalty = quality.penalty

        // Mood weight
        let moodWeight = mood.weight

        // hasRework = reworkMinutes > 0 OR quality == useless OR (netGain < 0 AND extraCost >= estimatedSaved)
        let hasRework = reworkMinutes > 0 ||
                        quality == .useless ||
                        (netGain < 0 && totalExtraCost >= estimatedSavedMinutes)

        let now = Date()
        let localDate = session.localDate

        return LedgerEntry(
            id: UUID().uuidString,
            detectedSessionId: session.id,
            sourcePlatform: session.sourcePlatform,
            toolId: session.toolId ?? "unknown",
            toolName: session.toolName ?? "未知工具",
            useCaseId: useCaseId,
            useCaseName: useCaseName,
            estimatedSavedMinutes: estimatedSavedMinutes,
            promptMinutes: promptMinutes,
            reviewMinutes: reviewMinutes,
            editMinutes: editMinutes,
            debugMinutes: debugMinutes,
            reworkMinutes: reworkMinutes,
            totalExtraCostMinutes: totalExtraCost,
            netGainMinutes: netGain,
            quality: quality,
            qualityScore: qualityScore,
            qualityPenalty: qualityPenalty,
            mood: mood,
            moodWeight: moodWeight,
            hasRework: hasRework,
            note: note,
            localDate: localDate,
            timezone: session.timezone,
            createdAt: now,
            updatedAt: now
        )
    }

    /// Validate user inputs for completion form
    static func validate(
        estimatedSavedMinutes: Int,
        promptMinutes: Int,
        reviewMinutes: Int,
        editMinutes: Int,
        debugMinutes: Int,
        reworkMinutes: Int
    ) -> (isValid: Bool, message: String?) {
        if estimatedSavedMinutes <= 0 {
            return (false, "预估节省时间必须大于0")
        }
        if promptMinutes < 0 || reviewMinutes < 0 || editMinutes < 0 || debugMinutes < 0 || reworkMinutes < 0 {
            return (false, "各项时间不能为负数")
        }
        let totalInput = promptMinutes + reviewMinutes + editMinutes + debugMinutes + reworkMinutes
        if totalInput <= 0 {
            return (false, "请至少填写一项投入时间")
        }
        if totalInput > 480 {
            return (false, "总投入时间不能超过8小时")
        }
        return (true, nil)
    }

    /// Calculate auto-filled defaults
    static func suggestedDefaults(session: DetectedSession) -> (
        estimatedSaved: Int,
        promptMinutes: Int,
        reviewMinutes: Int,
        editMinutes: Int,
        debugMinutes: Int,
        reworkMinutes: Int,
        quality: OutputQuality
    ) {
        let activeMinutes = session.activeSeconds / 60

        // Default estimated saved = active minutes (1:1 ratio)
        let estimatedSaved = max(15, activeMinutes)

        // Prompt time = min(activeMinutes, 5)
        let prompt = min(activeMinutes, 5)

        // Review time = max(3, min(activeMinutes / 5, 10))
        let review = max(3, min(activeMinutes / 5, 15))

        return (estimatedSaved, prompt, review, 0, 0, 0, .minorEdit)
    }
}
