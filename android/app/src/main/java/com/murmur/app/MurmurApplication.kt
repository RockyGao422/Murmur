package com.murmur.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.work.*
import com.murmur.app.data.local.AppDatabase
import com.murmur.app.data.repository.SettingsRepository
import com.murmur.app.data.repository.ToolRepository
import com.murmur.app.worker.DetectionWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

class MurmurApplication : Application() {

    val database: AppDatabase by lazy {
        AppDatabase.getInstance(this)
    }

    val settingsRepository: SettingsRepository by lazy {
        SettingsRepository(this)
    }

    val toolRepository: ToolRepository by lazy {
        ToolRepository(database.toolCatalogDao(), this)
    }

    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()

        // Create notification channel
        createNotificationChannel()

        // Initialize data
        applicationScope.launch {
            seedToolCatalog()
            scheduleDetectionWorker()
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Murmur 检测服务",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "AI 使用检测服务运行中"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private suspend fun seedToolCatalog() {
        toolRepository.seedDefaultCatalog()
    }

    private fun scheduleDetectionWorker() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
            .build()

        val workRequest = PeriodicWorkRequestBuilder<DetectionWorker>(
            DEFAULT_INTERVAL_MINUTES,
            TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.LINEAR,
                WorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "murmur_detection",
            ExistingPeriodicWorkPolicy.KEEP,
            workRequest
        )
    }

    fun rescheduleDetectionWorker(intervalMinutes: Int) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
            .build()

        val workRequest = PeriodicWorkRequestBuilder<DetectionWorker>(
            intervalMinutes.toLong().coerceAtLeast(DEFAULT_INTERVAL_MINUTES),
            TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.LINEAR,
                WorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "murmur_detection",
            ExistingPeriodicWorkPolicy.REPLACE,
            workRequest
        )
    }

    companion object {
        const val NOTIFICATION_CHANNEL_ID = "murmur_detection_channel"
        const val DEFAULT_INTERVAL_MINUTES = 15L
    }
}
