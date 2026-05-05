package com.murmur.app.worker

import android.content.Context
import android.util.Log
import androidx.work.*
import com.murmur.app.data.local.AppDatabase
import com.murmur.app.data.repository.SessionRepository
import com.murmur.app.data.repository.SettingsRepository
import com.murmur.app.data.repository.ToolRepository
import com.murmur.app.domain.detection.Sessionizer
import com.murmur.app.domain.detection.ToolMatcher
import com.murmur.app.domain.detection.UsageEventsDetector
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import java.time.LocalDateTime
import java.util.concurrent.TimeUnit

/**
 * WorkManager worker that periodically queries UsageStatsManager
 * for new AI app usage events and converts them into sessions.
 */
class DetectionWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "DetectionWorker"
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        return@withContext try {
            val appContext = applicationContext
            val database = AppDatabase.getInstance(appContext)
            val settingsRepo = SettingsRepository(appContext)
            val toolRepo = ToolRepository(database.toolCatalogDao(), appContext)
            val sessionRepo = SessionRepository(database.detectedSessionDao())

            // Check if detection is enabled
            val detectionEnabled = settingsRepo.detectionEnabled.first()
            if (!detectionEnabled) {
                Log.d(TAG, "Detection disabled, skipping")
                return@withContext Result.success()
            }

            // Check if paused
            val pauseUntil = settingsRepo.pauseUntil.first()
            if (pauseUntil != null && LocalDateTime.now().isBefore(pauseUntil)) {
                Log.d(TAG, "Detection paused until $pauseUntil")
                return@withContext Result.success()
            }

            // Night hours are still detected and recorded (sessions tagged with isNight).
            // Notification/reminder suppression is handled separately by UI/presentation layer.

            // Get last processed timestamp with overlap window for delayed events
            val overlapWindowMs = TimeUnit.MINUTES.toMillis(2)
            val lastTimestamp = settingsRepo.lastProcessedTimestamp.first()
            val endTime = System.currentTimeMillis()
            val startTime = if (lastTimestamp > 0) {
                lastTimestamp - overlapWindowMs // Go back 2 min to catch delayed events
            } else {
                endTime - TimeUnit.MINUTES.toMillis(15) // First run: last 15 minutes
            }

            // Query usage events
            val detector = UsageEventsDetector(appContext)
            val rawEvents = detector.queryEvents(startTime, endTime)

            if (rawEvents.isEmpty()) {
                // Update timestamp even if no events
                settingsRepo.setLastProcessedTimestamp(endTime)
                return@withContext Result.success()
            }

            // Get enabled tools and ignored targets
            val tools = toolRepo.getEnabledSync()
            val ignoredTargets = settingsRepo.ignoredTargets.first()

            // Match and sessionize
            val matcher = ToolMatcher(tools, ignoredTargets)
            val sessionizer = Sessionizer(appContext)
            val sessions = sessionizer.processEvents(rawEvents, matcher)

            // Save new sessions with fingerprint dedup
            if (sessions.isNotEmpty()) {
                sessionRepo.upsertSessions(sessions)
                Log.d(TAG, "Detected ${sessions.size} new sessions")
            }

            // Update last processed timestamp
            settingsRepo.setLastProcessedTimestamp(endTime)

            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Detection failed", e)
            if (runAttemptCount < 3) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }

}
