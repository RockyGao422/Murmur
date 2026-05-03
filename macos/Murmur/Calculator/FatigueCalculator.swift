import Foundation

/// Computes fatigue score 0-100 based on both detected sessions and ledger entries
struct FatigueCalculator {

    struct FatigueResult {
        let fatigueScore: Int
        let components: FatigueComponents
        let sampleQuality: String
    }

    struct FatigueComponents {
        let aiDurationScore: Int        // max 18
        let sessionFrequencyScore: Int  // max 14
        let toolSwitchScore: Int        // max 10
        let nightUsageScore: Int        // max 10
        let pendingBacklogScore: Int    // max 8
        let reworkScore: Int            // max 15
        let avgQualityPenalty: Double   // max 14
        let avgMoodWeight: Double       // max 10
        let lowGainScore: Int           // max 8
    }

    /// Calculate fatigue score for a given date
    static func calculate(
        sessions: [DetectedSession],
        entries: [LedgerEntry],
        forDate localDate: String
    ) -> FatigueResult {
        let daySessions = sessions.filter { $0.localDate == localDate }
        let dayEntries = entries.filter { $0.localDate == localDate }

        // 1. AI Duration Score (max 18)
        let totalActiveMinutes = daySessions.reduce(0) { $0 + $1.activeSeconds } / 60
        let aiDurationScore = min(18, Int(Double(totalActiveMinutes) / 180.0 * 18.0))

        // 2. Session Frequency Score (max 14)
        let sessionCount = daySessions.count
        let sessionFrequencyScore = min(14, sessionCount * 2)

        // 3. Tool Switch Score (max 10)
        let toolIds = daySessions.compactMap { $0.toolId }
        let distinctTools = Set(toolIds).count
        var switchCount = 0
        if toolIds.count > 1 {
            for i in 1..<toolIds.count {
                if toolIds[i] != toolIds[i-1] {
                    switchCount += 1
                }
            }
        }
        let toolSwitchScore = min(10, switchCount * 2)

        // 4. Night Usage Score (max 10)
        let nightSessions = daySessions.filter { $0.isNight }.count
        let nightUsageScore = min(10, nightSessions * 4)

        // 5. Pending Backlog Score (max 8)
        let pendingCount = daySessions.filter { $0.status == .pending }.count
        let pendingBacklogScore = min(8, pendingCount * 2)

        // 6. Rework Score (max 15)
        let totalReworkMinutes = dayEntries.reduce(0) { $0 + $1.reworkMinutes }
        let reworkScore = min(15, Int(Double(totalReworkMinutes) / 60.0 * 15.0))

        // 7. Average Quality Penalty
        let qualityPenalties = dayEntries.map { $0.qualityPenalty }
        let avgQualityPenalty = qualityPenalties.isEmpty ? 0 : Double(qualityPenalties.reduce(0, +)) / Double(qualityPenalties.count)

        // 8. Average Mood Weight
        let moodWeights = dayEntries.map { $0.moodWeight }
        let avgMoodWeight = moodWeights.isEmpty ? 0 : Double(moodWeights.reduce(0, +)) / Double(moodWeights.count)

        // 9. Low Gain Score (max 8)
        // If completed entries >= 3 AND net gain <= 0, add 8
        let completedEntries = dayEntries.filter { _ in true }
        let totalNetGain = dayEntries.reduce(0) { $0 + $1.netGainMinutes }
        let lowGainScore = (completedEntries.count >= 3 && totalNetGain <= 0) ? 8 : 0

        let components = FatigueComponents(
            aiDurationScore: aiDurationScore,
            sessionFrequencyScore: sessionFrequencyScore,
            toolSwitchScore: toolSwitchScore,
            nightUsageScore: nightUsageScore,
            pendingBacklogScore: pendingBacklogScore,
            reworkScore: reworkScore,
            avgQualityPenalty: avgQualityPenalty,
            avgMoodWeight: avgMoodWeight,
            lowGainScore: lowGainScore
        )

        let totalScore = Double(
            aiDurationScore +
            sessionFrequencyScore +
            toolSwitchScore +
            nightUsageScore +
            pendingBacklogScore +
            reworkScore +
            Int(avgQualityPenalty) +
            Int(avgMoodWeight) +
            lowGainScore
        )

        let fatigueScore = min(100, max(0, Int(totalScore)))

        let sampleQuality: String
        if dayEntries.count >= 8 {
            sampleQuality = "完整"
        } else if dayEntries.count >= 3 {
            sampleQuality = "一般"
        } else if dayEntries.count >= 1 {
            sampleQuality = "偏低"
        } else {
            sampleQuality = "无数据"
        }

        return FatigueResult(
            fatigueScore: fatigueScore,
            components: components,
            sampleQuality: sampleQuality
        )
    }

    /// Get fatigue score level description
    static func fatigueLevel(_ score: Int) -> (level: String, color: String, icon: String) {
        switch score {
        case 0..<20:
            return ("轻松", "green", "leaf.fill")
        case 20..<40:
            return ("正常", "blue", "hand.thumbsup.fill")
        case 40..<60:
            return ("略倦", "yellow", "exclamationmark.triangle.fill")
        case 60..<80:
            return ("疲劳", "orange", "flame.fill")
        default:
            return ("过劳", "red", "heart.text.square.fill")
        }
    }
}
