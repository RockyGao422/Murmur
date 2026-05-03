package com.murmur.app.ui.stats

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.murmur.app.data.local.AppDatabase
import com.murmur.app.data.repository.LedgerRepository
import com.murmur.app.data.repository.SessionRepository
import com.murmur.app.domain.calculator.FatigueCalculator
import com.murmur.app.domain.model.DetectedSession
import com.murmur.app.domain.model.LedgerEntry
import com.murmur.app.domain.model.ToolUsage
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

data class StatsUiState(
    val isLoading: Boolean = true,
    val selectedRange: StatsRange = StatsRange.LAST_7_DAYS,
    val summary: StatsSummary = StatsSummary(),
    val dailySessions: List<DailyStat> = emptyList(),
    val toolDistribution: List<ToolUsage> = emptyList(),
    val platformDistribution: Map<String, Int> = emptyMap()
)

data class StatsSummary(
    val totalSessions: Int = 0,
    val totalActiveSeconds: Long = 0,
    val totalNetGainSeconds: Long = 0,
    val avgFatigueScore: Int = 0
)

data class DailyStat(
    val date: String,
    val sessionCount: Int,
    val totalMinutes: Long,
    val label: String
)

enum class StatsRange(val days: Int, val label: String) {
    LAST_7_DAYS(7, "近 7 天"),
    LAST_30_DAYS(30, "近 30 天")
}

class StatsViewModel(application: Application) : AndroidViewModel(application) {

    private val database = AppDatabase.getInstance(application)
    private val sessionRepo = SessionRepository(database.detectedSessionDao())
    private val ledgerRepo = LedgerRepository(
        database.ledgerEntryDao(),
        database.detectedSessionDao(),
        database.dailySummaryDao()
    )

    private val _uiState = MutableStateFlow(StatsUiState())
    val uiState: StateFlow<StatsUiState> = _uiState.asStateFlow()

    init {
        loadData(StatsRange.LAST_7_DAYS)
    }

    fun selectRange(range: StatsRange) {
        _uiState.update { it.copy(selectedRange = range) }
        loadData(range)
    }

    private fun loadData(range: StatsRange) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            val endDate = LocalDate.now()
            val startDate = endDate.minusDays(range.days.toLong() - 1)

            val startStr = startDate.toString()
            val endStr = endDate.toString()

            val sessions = sessionRepo.getSessionsByDateRangeSync(startStr, endStr)
            val entries = ledgerRepo.getEntriesByDateRangeSync(startStr, endStr)
            val aggregates = ledgerRepo.getAggregates(startStr, endStr)
            val toolDist = ledgerRepo.getToolDistribution(startStr, endStr)
            val platformDist = ledgerRepo.getPlatformDistribution(startStr, endStr)

            // Calculate daily stats
            val dailyStats = calculateDailyStats(sessions, startDate, endDate)

            // Calculate average fatigue
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

            _uiState.update {
                it.copy(
                    isLoading = false,
                    summary = StatsSummary(
                        totalSessions = sessions.size,
                        totalActiveSeconds = sessions.sumOf { s -> s.activeSeconds },
                        totalNetGainSeconds = aggregates.totalNetGain,
                        avgFatigueScore = avgFatigue
                    ),
                    dailySessions = dailyStats,
                    toolDistribution = toolDist,
                    platformDistribution = platformDist
                )
            }
        }
    }

    private fun calculateDailyStats(
        sessions: List<DetectedSession>,
        startDate: LocalDate,
        endDate: LocalDate
    ): List<DailyStat> {
        val formatter = DateTimeFormatter.ofPattern("M/d")
        val stats = mutableListOf<DailyStat>()

        var current = startDate
        while (!current.isAfter(endDate)) {
            val dateStr = current.toString()
            val daySessions = sessions.filter { it.localDate == dateStr }
            val totalSeconds = daySessions.sumOf { it.activeSeconds }

            stats.add(
                DailyStat(
                    date = dateStr,
                    sessionCount = daySessions.size,
                    totalMinutes = totalSeconds / 60,
                    label = current.format(formatter)
                )
            )
            current = current.plusDays(1)
        }

        return stats
    }
}
