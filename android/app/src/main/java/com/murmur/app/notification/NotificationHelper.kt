package com.murmur.app.notification

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.murmur.app.MainActivity
import com.murmur.app.R

/**
 * Manages local notifications for pending session reminders.
 */
object NotificationHelper {

    private const val CHANNEL_PENDING_REMINDER = "murmur_pending_reminders"
    private const val CHANNEL_DETECTION_STATUS = "murmur_detection_status"
    private const val NOTIFICATION_PENDING_ID = 1001
    private const val NOTIFICATION_DETECTION_ID = 1002

    fun createNotificationChannels(context: Context) {
        val pendingChannel = NotificationChannel(
            CHANNEL_PENDING_REMINDER,
            "待补全提醒",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "提醒您补全检测到的 AI 使用会话"
        }

        val detectionChannel = NotificationChannel(
            CHANNEL_DETECTION_STATUS,
            "检测状态",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "显示 Murmur 自动检测运行状态"
        }

        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(pendingChannel)
        manager.createNotificationChannel(detectionChannel)
    }

    fun showPendingReminder(context: Context, pendingCount: Int) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                return
            }
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("navigate_to", "inbox")
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val title = "Murmur"
        val body = if (pendingCount == 1) {
            "有 1 条 AI 使用会话待补全"
        } else {
            "有 $pendingCount 条 AI 使用会话待补全"
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_PENDING_REMINDER)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setNumber(pendingCount)
            .build()

        NotificationManagerCompat.from(context).notify(NOTIFICATION_PENDING_ID, notification)
    }

    fun cancelPendingReminder(context: Context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_PENDING_ID)
    }

    fun showDetectionActive(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                return
            }
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_DETECTION_STATUS)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Murmur")
            .setContentText("正在后台检测 AI 使用")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .build()

        NotificationManagerCompat.from(context).notify(NOTIFICATION_DETECTION_ID, notification)
    }

    fun cancelDetectionStatus(context: Context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_DETECTION_ID)
    }

    fun cancelAll(context: Context) {
        NotificationManagerCompat.from(context).cancelAll()
    }
}
