package com.murmur.app.ui.completion

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.murmur.app.data.local.AppDatabase
import com.murmur.app.data.repository.LedgerRepository
import com.murmur.app.data.repository.SessionRepository
import com.murmur.app.domain.calculator.EntryCalculator
import com.murmur.app.domain.model.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class CompletionUiState(
    val session: DetectedSession? = null,
    val isLoading: Boolean = true,
    val isSaving: Boolean = false,
    val isSaved: Boolean = false,
    val error: String? = null,
    // Form fields
    val useCase: String = "",
    val quality: OutputQuality = OutputQuality.USED_DIRECTLY,
    val mood: UserMood = UserMood.NEUTRAL,
    val activeMinutes: String = "",
    val inputCount: String = "1",
    val outputCount: String = "1",
    val hasRework: Boolean = false,
    val notes: String = "",
    // Preview
    val preview: CalculatedEntry? = null,
    // Dropdown options
    val useCaseOptions: List<String> = UseCase.entries.map { it.label }
)

class CompletionViewModel(application: Application) : AndroidViewModel(application) {

    private val database = AppDatabase.getInstance(application)
    private val sessionRepo = SessionRepository(database.detectedSessionDao())
    private val ledgerRepo = LedgerRepository(
        database.ledgerEntryDao(),
        database.detectedSessionDao(),
        database.dailySummaryDao()
    )

    private val _uiState = MutableStateFlow(CompletionUiState())
    val uiState: StateFlow<CompletionUiState> = _uiState.asStateFlow()

    private var sessionId: Long = 0

    fun loadSession(sessionId: Long) {
        this.sessionId = sessionId
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            val session = sessionRepo.getSessionById(sessionId)
            if (session != null) {
                // Set default quality based on session confidence
                val defaultQuality = when {
                    session.confidence >= 0.9f -> OutputQuality.USED_DIRECTLY
                    session.confidence >= 0.6f -> OutputQuality.MINOR_EDITS
                    else -> OutputQuality.MINOR_EDITS
                }

                val minutes = session.activeSeconds / 60
                val minuteStr = if (minutes > 0) minutes.toString() else ""

                _uiState.update {
                    it.copy(
                        session = session,
                        isLoading = false,
                        activeMinutes = minuteStr,
                        quality = defaultQuality,
                        useCase = if (session.toolName.lowercase().contains("code") ||
                            session.toolName == "GitHub Copilot" ||
                            session.toolId == "codex") "编程" else ""
                    )
                }

                recalculatePreview()
            } else {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = "会话未找到"
                    )
                }
            }
        }
    }

    fun setUseCase(value: String) {
        _uiState.update { it.copy(useCase = value) }
        recalculatePreview()
    }

    fun setQuality(quality: OutputQuality) {
        _uiState.update { it.copy(quality = quality, hasRework = quality != OutputQuality.USED_DIRECTLY) }
        recalculatePreview()
    }

    fun setMood(mood: UserMood) {
        _uiState.update { it.copy(mood = mood) }
        recalculatePreview()
    }

    fun setActiveMinutes(value: String) {
        _uiState.update { it.copy(activeMinutes = value) }
        recalculatePreview()
    }

    fun setInputCount(value: String) {
        _uiState.update { it.copy(inputCount = value) }
    }

    fun setOutputCount(value: String) {
        _uiState.update { it.copy(outputCount = value) }
    }

    fun setHasRework(value: Boolean) {
        _uiState.update { it.copy(hasRework = value) }
    }

    fun setNotes(value: String) {
        _uiState.update { it.copy(notes = value) }
    }

    private fun recalculatePreview() {
        val state = _uiState.value
        val session = state.session ?: return

        val activeSeconds = state.activeMinutes.toLongOrNull()?.times(60)
            ?: session.activeSeconds

        val calculated = EntryCalculator.calculate(
            activeSeconds = activeSeconds,
            quality = state.quality,
            mood = state.mood
        )

        _uiState.update { it.copy(preview = calculated) }
    }

    fun save() {
        val state = _uiState.value
        val session = state.session ?: return

        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null) }

            try {
                val activeSeconds = state.activeMinutes.toLongOrNull()?.times(60)
                    ?: session.activeSeconds

                val calculated = EntryCalculator.calculate(
                    activeSeconds = activeSeconds,
                    quality = state.quality,
                    mood = state.mood
                )

                val entry = LedgerEntry(
                    sessionId = session.id,
                    toolId = session.toolId,
                    toolName = session.toolName,
                    sourcePlatform = session.sourcePlatform,
                    localDate = session.localDate,
                    activeSeconds = activeSeconds,
                    useCase = state.useCase,
                    quality = state.quality,
                    mood = state.mood,
                    timeSavedSeconds = calculated.timeSavedSeconds,
                    extraCostSeconds = calculated.extraCostSeconds,
                    netGainSeconds = calculated.netGainSeconds,
                    hasRework = state.hasRework || state.quality != OutputQuality.USED_DIRECTLY,
                    inputCount = state.inputCount.toIntOrNull() ?: 1,
                    outputCount = state.outputCount.toIntOrNull() ?: 1,
                    notes = state.notes
                )

                ledgerRepo.insertEntry(entry)
                _uiState.update { it.copy(isSaving = false, isSaved = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        error = e.message ?: "保存失败"
                    )
                }
            }
        }
    }
}
