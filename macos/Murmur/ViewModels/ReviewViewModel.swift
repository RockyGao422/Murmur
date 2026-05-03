import Foundation
import Combine

@MainActor
class ReviewViewModel: ObservableObject {
    private let storageManager: StorageManager

    @Published var currentWeekReview: WeeklyReviewEngine.WeeklyReview?
    @Published var pastReviews: [WeeklyReviewEngine.WeeklyReview] = []
    @Published var selectedWeekStart: String
    @Published var selectedWeekEnd: String
    @Published var isLoading: Bool = false

    init(storageManager: StorageManager) {
        self.storageManager = storageManager
        let currentWeek = Self.getCurrentWeekRange()
        self.selectedWeekStart = currentWeek.start
        self.selectedWeekEnd = currentWeek.end
    }

    func loadWeekReview() {
        isLoading = true

        let sessions = storageManager.loadSessions()
        let entries = storageManager.loadEntries()

        // Filter to selected week
        let weekSessions = sessions.filter { $0.localDate >= selectedWeekStart && $0.localDate <= selectedWeekEnd }
        let weekEntries = entries.filter { $0.localDate >= selectedWeekStart && $0.localDate <= selectedWeekEnd }

        currentWeekReview = WeeklyReviewEngine.generate(
            sessions: weekSessions,
            entries: weekEntries,
            weekStart: selectedWeekStart,
            weekEnd: selectedWeekEnd
        )

        // Also generate for all past weeks
        generatePastReviews(sessions: sessions, entries: entries)

        isLoading = false
    }

    func selectWeek(start: String, end: String) {
        selectedWeekStart = start
        selectedWeekEnd = end
        loadWeekReview()
    }

    func previousWeek() {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        guard let currentStart = dateFormatter.date(from: selectedWeekStart) else { return }
        let calendar = Calendar.current
        guard let prevStart = calendar.date(byAdding: .day, value: -7, to: currentStart),
              let prevEnd = calendar.date(byAdding: .day, value: 6, to: prevStart) else { return }
        selectedWeekStart = dateFormatter.string(from: prevStart)
        selectedWeekEnd = dateFormatter.string(from: prevEnd)
        loadWeekReview()
    }

    func nextWeek() {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        guard let currentStart = dateFormatter.date(from: selectedWeekStart) else { return }
        let calendar = Calendar.current
        guard let nextStart = calendar.date(byAdding: .day, value: 7, to: currentStart) else { return }
        // Don't allow going past current week
        let today = dateFormatter.string(from: Date())
        if nextStart > Date() { return }
        guard let nextEnd = calendar.date(byAdding: .day, value: 6, to: nextStart) else { return }
        selectedWeekStart = dateFormatter.string(from: nextStart)
        selectedWeekEnd = dateFormatter.string(from: nextEnd)
        loadWeekReview()
    }

    // MARK: - Private

    private func generatePastReviews(sessions: [DetectedSession], entries: [LedgerEntry]) {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        // Get all unique weeks from sessions
        var weekStarts = Set<String>()
        for session in sessions {
            guard let date = dateFormatter.date(from: session.localDate) else { continue }
            let startOfWeek = startOfWeek(for: date)
            weekStarts.insert(dateFormatter.string(from: startOfWeek))
        }

        var reviews: [WeeklyReviewEngine.WeeklyReview] = []
        for weekStartStr in weekStarts.sorted().reversed() {
            guard let ws = dateFormatter.date(from: weekStartStr) else { continue }
            let we = Calendar.current.date(byAdding: .day, value: 6, to: ws)!
            let weStr = dateFormatter.string(from: we)

            if weekStartStr == selectedWeekStart { continue } // Don't duplicate current

            let weekSessions = sessions.filter { $0.localDate >= weekStartStr && $0.localDate <= weStr }
            let weekEntries = entries.filter { $0.localDate >= weekStartStr && $0.localDate <= weStr }

            let review = WeeklyReviewEngine.generate(
                sessions: weekSessions,
                entries: weekEntries,
                weekStart: weekStartStr,
                weekEnd: weStr
            )
            reviews.append(review)
        }

        pastReviews = reviews
    }

    private func startOfWeek(for date: Date) -> Date {
        let calendar = Calendar.current
        var components = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        components.weekday = 2 // Monday
        return calendar.date(from: components) ?? date
    }

    static func getCurrentWeekRange() -> (start: String, end: String) {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        let calendar = Calendar.current
        let today = Date()
        var components = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: today)
        components.weekday = 2 // Monday
        guard let monday = calendar.date(from: components) else {
            return ("2026-01-01", "2026-01-07")
        }
        let sunday = calendar.date(byAdding: .day, value: 6, to: monday)!
        return (dateFormatter.string(from: monday), dateFormatter.string(from: sunday))
    }

    var weekLabel: String {
        return "\(selectedWeekStart) 至 \(selectedWeekEnd)"
    }

    var canGoNext: Bool {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let today = dateFormatter.string(from: Date())
        return selectedWeekEnd < today
    }
}
