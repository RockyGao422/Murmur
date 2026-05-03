package com.murmur.app.ui.settings

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.murmur.app.data.local.AppDatabase
import com.murmur.app.data.repository.LedgerRepository
import com.murmur.app.data.repository.SessionRepository
import com.murmur.app.data.repository.SettingsRepository
import com.murmur.app.export.CSVExporter
import com.murmur.app.export.MarkdownExporter
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class SettingsUiState(
    val detectionEnabled: Boolean = true,
    val nightHoursStart: Int = 22,
    val nightHoursEnd: Int = 7,
    val detectionIntervalMinutes: Int = 15,
    val foregroundServiceEnabled: Boolean = false,
    val notificationsEnabled: Boolean = true,
    val isExporting: Boolean = false,
    val exportedData: String? = null,
    val markdownExportData: String? = null,
    val showClearDialog: Boolean = false,
    val isClearing: Boolean = false
)

class SettingsViewModel(application: Application) : AndroidViewModel(application) {

    private val database = AppDatabase.getInstance(application)
    private val settingsRepo = SettingsRepository(application)
    private val sessionRepo = SessionRepository(database.detectedSessionDao())
    private val ledgerRepo = LedgerRepository(
        database.ledgerEntryDao(),
        database.detectedSessionDao(),
        database.dailySummaryDao()
    )

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            settingsRepo.detectionEnabled.collect { enabled ->
                _uiState.update { it.copy(detectionEnabled = enabled) }
            }
        }

        viewModelScope.launch {
            settingsRepo.nightHoursStart.collect { start ->
                _uiState.update { it.copy(nightHoursStart = start) }
            }
        }

        viewModelScope.launch {
            settingsRepo.nightHoursEnd.collect { end ->
                _uiState.update { it.copy(nightHoursEnd = end) }
            }
        }

        viewModelScope.launch {
            settingsRepo.detectionIntervalMinutes.collect { interval ->
                _uiState.update { it.copy(detectionIntervalMinutes = interval) }
            }
        }

        viewModelScope.launch {
            settingsRepo.foregroundServiceEnabled.collect { enabled ->
                _uiState.update { it.copy(foregroundServiceEnabled = enabled) }
            }
        }
    }

    fun setDetectionEnabled(enabled: Boolean) {
        viewModelScope.launch {
            settingsRepo.setDetectionEnabled(enabled)
        }
    }

    fun setNightHoursStart(hour: Int) {
        viewModelScope.launch {
            settingsRepo.setNightHours(hour, _uiState.value.nightHoursEnd)
        }
    }

    fun setNightHoursEnd(hour: Int) {
        viewModelScope.launch {
            settingsRepo.setNightHours(_uiState.value.nightHoursStart, hour)
        }
    }

    fun setDetectionInterval(minutes: Int) {
        viewModelScope.launch {
            settingsRepo.setDetectionIntervalMinutes(minutes)
        }
    }

    fun setForegroundService(enabled: Boolean) {
        viewModelScope.launch {
            settingsRepo.setForegroundServiceEnabled(enabled)
        }
    }

    fun setNotificationsEnabled(enabled: Boolean) {
        viewModelScope.launch {
            settingsRepo.setNotificationsEnabled(enabled)
            _uiState.update { it.copy(notificationsEnabled = enabled) }
        }
    }

    fun exportMarkdown() {
        viewModelScope.launch {
            _uiState.update { it.copy(isExporting = true) }

            try {
                val today = java.time.LocalDate.now()
                val weekStart = MarkdownExporter.getWeekStart(today)
                val weekEnd = MarkdownExporter.getWeekEnd(weekStart)

                val startStr = weekStart.toString()
                val endStr = weekEnd.toString()
                val sessions = sessionRepo.getSessionsByDateRangeSync(startStr, endStr)
                val entries = ledgerRepo.getEntriesByDateRangeSync(startStr, endStr)

                val weeklyData = MarkdownExporter.WeeklyData(
                    weekStart = weekStart,
                    weekEnd = weekEnd,
                    sessions = sessions,
                    entries = entries,
                    dailySummaries = emptyList()
                )

                val markdown = MarkdownExporter.exportMarkdown(weeklyData)
                _uiState.update { it.copy(isExporting = false, markdownExportData = markdown) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isExporting = false) }
            }
        }
    }

    fun clearMarkdownExport() {
        _uiState.update { it.copy(markdownExportData = null) }
    }

    fun exportData() {
        viewModelScope.launch {
            _uiState.update { it.copy(isExporting = true) }

            try {
                val today = java.time.LocalDate.now().toString()
                val start = java.time.LocalDate.now().minusDays(30).toString()
                val sessions = sessionRepo.getSessionsByDateRangeSync(start, today)
                val entries = ledgerRepo.getEntriesByDateRangeSync(start, today)

                val csvData = CSVExporter.exportAllData(sessions, entries)
                _uiState.update { it.copy(isExporting = false, exportedData = csvData) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isExporting = false) }
            }
        }
    }

    fun clearExportedData() {
        _uiState.update { it.copy(exportedData = null) }
    }

    fun showClearDialog() {
        _uiState.update { it.copy(showClearDialog = true) }
    }

    fun dismissClearDialog() {
        _uiState.update { it.copy(showClearDialog = false) }
    }

    fun clearAllData() {
        viewModelScope.launch {
            _uiState.update { it.copy(isClearing = true) }

            try {
                database.detectedSessionDao().deleteAll()
                database.ledgerEntryDao().deleteAll()
                database.toolCatalogDao().deleteAll()
                database.dailySummaryDao().deleteAll()
                settingsRepo.clearAllSettings()
                _uiState.update { it.copy(isClearing = false, showClearDialog = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isClearing = false, showClearDialog = false) }
            }
        }
    }
}
