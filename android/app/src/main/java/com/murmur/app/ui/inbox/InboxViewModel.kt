package com.murmur.app.ui.inbox

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.murmur.app.data.local.AppDatabase
import com.murmur.app.data.repository.SessionRepository
import com.murmur.app.domain.model.DetectedSession
import com.murmur.app.domain.model.SessionStatus
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class InboxUiState(
    val sessions: List<DetectedSession> = emptyList(),
    val groupedSessions: Map<String, List<DetectedSession>> = emptyMap(),
    val suspectedSessions: List<DetectedSession> = emptyList(),
    val isLoading: Boolean = true,
    val isMerging: Boolean = false,
    val mergeSuggestion: MergeSuggestion? = null
)

data class MergeSuggestion(
    val session1: DetectedSession,
    val session2: DetectedSession,
    val reason: String
)

class InboxViewModel(application: Application) : AndroidViewModel(application) {

    private val database = AppDatabase.getInstance(application)
    private val sessionRepo = SessionRepository(database.detectedSessionDao())

    private val _uiState = MutableStateFlow(InboxUiState())
    val uiState: StateFlow<InboxUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            sessionRepo.getPendingSessions().collect { sessions ->
                val sorted = sessions.sortedByDescending { it.startedAt }
                val suspected = sorted.filter {
                    it.status == SessionStatus.SUSPECTED || it.confidence < 0.6f
                }
                val confirmed = sorted.filter {
                    it.status != SessionStatus.SUSPECTED && it.confidence >= 0.6f
                }
                val grouped = confirmed.groupBy { it.localDate }

                // Check for merge suggestions
                val mergeSuggestion = findMergeSuggestion(confirmed)

                _uiState.update {
                    it.copy(
                        sessions = sorted,
                        groupedSessions = grouped,
                        suspectedSessions = suspected,
                        isLoading = false,
                        mergeSuggestion = mergeSuggestion
                    )
                }
            }
        }
    }

    fun refresh() {
        _uiState.update { it.copy(isLoading = true) }
    }

    fun ignoreSession(sessionId: Long) {
        viewModelScope.launch {
            sessionRepo.updateStatus(sessionId, SessionStatus.IGNORED)
        }
    }

    fun acceptMerge(session1: DetectedSession, session2: DetectedSession) {
        viewModelScope.launch {
            _uiState.update { it.copy(isMerging = true) }
            sessionRepo.mergeSessions(session1.id, session2.id)
            _uiState.update { it.copy(isMerging = false, mergeSuggestion = null) }
        }
    }

    fun dismissMerge() {
        _uiState.update { it.copy(mergeSuggestion = null) }
    }

    fun batchIgnore(sessions: List<DetectedSession>) {
        viewModelScope.launch {
            sessions.forEach {
                sessionRepo.updateStatus(it.id, SessionStatus.IGNORED)
            }
        }
    }

    private fun findMergeSuggestion(sessions: List<DetectedSession>): MergeSuggestion? {
        if (sessions.size < 2) return null

        for (i in 0 until sessions.size - 1) {
            for (j in i + 1 until sessions.size) {
                val s1 = sessions[i]
                val s2 = sessions[j]

                // Same tool
                if (s1.toolId != s2.toolId) continue

                // Close in time (within 5 minutes)
                val timeDiff = kotlin.math.abs(s1.startedAt - s2.startedAt)
                if (timeDiff <= 5 * 60 * 1000) {
                    return MergeSuggestion(
                        session1 = s1,
                        session2 = s2,
                        reason = "相同工具（${s1.toolName}），时间间隔小于 5 分钟，可能为同一次使用。"
                    )
                }
            }
        }
        return null
    }
}
