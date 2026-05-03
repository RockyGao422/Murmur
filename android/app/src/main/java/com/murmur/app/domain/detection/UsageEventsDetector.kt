package com.murmur.app.domain.detection

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import com.murmur.app.domain.model.RawEvent
import com.murmur.app.domain.model.RawEventType

/**
 * Detects foreground app usage events via UsageStatsManager.
 * Handles event bucketing to avoid querying ranges that are too large.
 */
class UsageEventsDetector(private val context: Context) {

    private val usageStatsManager: UsageStatsManager?
        get() = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager

    /**
     * Maximum query window in milliseconds (2 hours) to prevent overly large ranges.
     */
    companion object {
        private const val MAX_QUERY_WINDOW_MS = 2 * 60 * 60 * 1000L // 2 hours
    }

    /**
     * Query usage events between startTime and endTime.
     * Automatically buckets the query if the range is too large.
     */
    fun queryEvents(startTime: Long, endTime: Long): List<RawEvent> {
        val manager = usageStatsManager ?: return emptyList()

        if (endTime - startTime <= MAX_QUERY_WINDOW_MS) {
            return queryEventsInternal(manager, startTime, endTime)
        }

        // Bucket the query to avoid large ranges
        val allEvents = mutableListOf<RawEvent>()
        var currentStart = startTime
        while (currentStart < endTime) {
            val currentEnd = minOf(currentStart + MAX_QUERY_WINDOW_MS, endTime)
            allEvents.addAll(queryEventsInternal(manager, currentStart, currentEnd))
            currentStart = currentEnd
        }
        return allEvents
    }

    private fun queryEventsInternal(
        manager: UsageStatsManager,
        startTime: Long,
        endTime: Long
    ): List<RawEvent> {
        val events = mutableListOf<RawEvent>()

        try {
            val usageEvents = manager.queryEvents(startTime, endTime)
            val event = UsageEvents.Event()

            while (usageEvents.hasNextEvent()) {
                usageEvents.getNextEvent(event)

                val packageName = event.packageName ?: continue
                if (packageName.isBlank()) continue

                val eventType = when (event.eventType) {
                    UsageEvents.Event.MOVE_TO_FOREGROUND -> RawEventType.FOREGROUND
                    UsageEvents.Event.ACTIVITY_RESUMED -> {
                        // On API 26-28, ACTIVITY_RESUMED acts as a foreground indicator
                        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                            RawEventType.FOREGROUND
                        } else {
                            // On API 29+, prefer MOVE_TO_FOREGROUND event
                            continue
                        }
                    }
                    UsageEvents.Event.MOVE_TO_BACKGROUND -> {
                        // Only handle if API 29+
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            RawEventType.BACKGROUND
                        } else {
                            continue
                        }
                    }
                    UsageEvents.Event.ACTIVITY_PAUSED -> {
                        // On API 26-28, ACTIVITY_PAUSED acts as a background indicator
                        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                            RawEventType.BACKGROUND
                        } else {
                            continue
                        }
                    }
                    else -> continue
                }

                events.add(
                    RawEvent(
                        packageName = packageName,
                        eventType = eventType,
                        timestamp = event.timeStamp
                    )
                )
            }
        } catch (e: SecurityException) {
            // No permission granted
            return emptyList()
        } catch (e: Exception) {
            e.printStackTrace()
            return emptyList()
        }

        return events
    }
}
