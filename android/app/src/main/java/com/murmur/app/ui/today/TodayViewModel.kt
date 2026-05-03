package com.murmur.app.ui.today

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.murmur.app.data.local.AppDatabase
import com.murmur.app.data.repository.LedgerRepository
import com.murmur.app.data.repository.SessionRepository
import com.murmur.app.data.repository.SettingsRepository
import com.murmur.app.data.repository.ToolRepository
import com.murmur.app.domain.calculator.FatigueCalculator
import com.murmur.app.domain.model.DetectedSession
import com.murmur.app.domain.model.DailySummary
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.LocalDate

data class TodayUiState(
    val isDetectionActive: Boolean = false,
    val hasPermission: Boolean = true,
    val todaySessions: List<DetectedSession> = emptyList(),
    val isLoading: Boolean = true,
    val stats: TodayStatsUi = TodayStatsUi(),
    val error: String? = null
)

data class TodayStatsUi(
    val totalActiveSeconds: Long = 0,
    val sessionCount: Int = 0,
    val pendingCount: Int = 0,
    val netGainSeconds: Long = 0,
    val fatigueScore: Int = 0
)

class TodayViewModel(application: Application) : AndroidViewModel(application) {

    private val database = AppDatabase.getInstance(application)
    private val sessionRepo = SessionRepository(database.detectedSessionDao())
    private val ledgerRepo = LedgerRepository(
        database.ledgerEntryDao(),
        database.detectedSessionDao(),
        database.dailySummaryDao()
    )
    private val settingsRepo = SettingsRepository(application)

    private val today = LocalDate.now().toString()

    private val _uiState = MutableStateFlow(TodayUiState())
    val uiState: StateFlow<TodayUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            // Observe detection enabled state
            settingsRepo.detectionEnabled.collect { enabled ->
                _uiState.update { it.copy(isDetectionActive = enabled) }
            }
        }

        viewModelScope.launch {
            // Combine sessions and ledger entries for today
            combine(
                sessionRepo.getSessionsByDate(today),
                ledgerRepo.getEntriesByDate(today)
            ) { sessions, entries ->
                calculateStats(sessions, entries)
            }.collect { stats ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        stats = stats
                    )
                }
            }
        }

        viewModelScope.launch {
            sessionRepo.getSessionsByDate(today).collect { sessions ->
                _uiState.update {
                    it.copy(todaySessions = sessions)
                }
            }
        }
    }

    fun refresh() {
        _uiState.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            val sessions = sessionRepo.getSessionsByDateRangeSync(today, today)
            val entries = ledgerRepo.getEntriesByDateRangeSync(today, today)
            val stats = calculateStats(sessions, entries)
            _uiState.update {
                it.copy(
                    isLoading = false,
                    todaySessions = sessions,
                    stats = stats
                )
            }
        }
    }

    private fun calculateStats(
        sessions: List<DetectedSession>,
        entries: List<com.murmur.app.domain.model.LedgerEntry>
    ): TodayStatsUi {
        val totalActiveSeconds = sessions.sumOf { it.activeSeconds }
        val sessionCount = sessions.size
        val pendingCount = sessions.count {
            it.status == com.murmur.app.domain.model.SessionStatus.ACTIVE ||
            it.status == com.murmur.app.domain.model.SessionStatus.SUSPECTED
        }
        val netGainSeconds = entries.sumOf { it.netGainSeconds }
        val fatigueScore = FatigueCalculator.calculate(sessions, entries)

        return TodayStatsUi(
            totalActiveSeconds = totalActiveSeconds,
            sessionCount = sessionCount,
            pendingCount = pendingCount,
            netGainSeconds = netGainSeconds,
            fatigueScore = fatigueScore
        )
    }
}
