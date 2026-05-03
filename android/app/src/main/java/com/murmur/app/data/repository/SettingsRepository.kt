package com.murmur.app.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "murmur_settings")

class SettingsRepository(private val context: Context) {

    companion object {
        private val KEY_DETECTION_ENABLED = booleanPreferencesKey("detection_enabled")
        private val KEY_NIGHT_HOURS_START = intPreferencesKey("night_hours_start")
        private val KEY_NIGHT_HOURS_END = intPreferencesKey("night_hours_end")
        private val KEY_DETECTION_INTERVAL_MINUTES = intPreferencesKey("detection_interval_minutes")
        private val KEY_PAUSE_UNTIL = stringPreferencesKey("pause_until")
        private val KEY_LAST_PROCESSED_TIMESTAMP = longPreferencesKey("last_processed_timestamp")
        private val KEY_FOREGROUND_SERVICE_ENABLED = booleanPreferencesKey("foreground_service_enabled")
        private val KEY_NOTIFICATIONS_ENABLED = booleanPreferencesKey("notifications_enabled")
        private val KEY_FIRST_LAUNCH_COMPLETED = booleanPreferencesKey("first_launch_completed")
        private val KEY_IGNORED_TARGETS = stringPreferencesKey("ignored_targets")

        const val DEFAULT_INTERVAL_MINUTES = 15
        const val DEFAULT_NIGHT_START = 22 // 10 PM
        const val DEFAULT_NIGHT_END = 7   // 7 AM
    }

    val detectionEnabled: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[KEY_DETECTION_ENABLED] ?: true
    }

    val nightHoursStart: Flow<Int> = context.dataStore.data.map { prefs ->
        prefs[KEY_NIGHT_HOURS_START] ?: DEFAULT_NIGHT_START
    }

    val nightHoursEnd: Flow<Int> = context.dataStore.data.map { prefs ->
        prefs[KEY_NIGHT_HOURS_END] ?: DEFAULT_NIGHT_END
    }

    val detectionIntervalMinutes: Flow<Int> = context.dataStore.data.map { prefs ->
        prefs[KEY_DETECTION_INTERVAL_MINUTES] ?: DEFAULT_INTERVAL_MINUTES
    }

    val pauseUntil: Flow<LocalDateTime?> = context.dataStore.data.map { prefs ->
        prefs[KEY_PAUSE_UNTIL]?.let {
            try {
                LocalDateTime.parse(it)
            } catch (e: Exception) {
                null
            }
        }
    }

    val lastProcessedTimestamp: Flow<Long> = context.dataStore.data.map { prefs ->
        prefs[KEY_LAST_PROCESSED_TIMESTAMP] ?: 0L
    }

    val foregroundServiceEnabled: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[KEY_FOREGROUND_SERVICE_ENABLED] ?: false
    }

    val notificationsEnabled: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[KEY_NOTIFICATIONS_ENABLED] ?: true
    }

    val firstLaunchCompleted: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[KEY_FIRST_LAUNCH_COMPLETED] ?: false
    }

    val ignoredTargets: Flow<List<String>> = context.dataStore.data.map { prefs ->
        prefs[KEY_IGNORED_TARGETS]?.let {
            try {
                it.split(",").filter { s -> s.isNotBlank() }
            } catch (e: Exception) {
                emptyList()
            }
        } ?: emptyList()
    }

    suspend fun setDetectionEnabled(enabled: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[KEY_DETECTION_ENABLED] = enabled
        }
    }

    suspend fun setNightHours(start: Int, end: Int) {
        context.dataStore.edit { prefs ->
            prefs[KEY_NIGHT_HOURS_START] = start
            prefs[KEY_NIGHT_HOURS_END] = end
        }
    }

    suspend fun setDetectionIntervalMinutes(minutes: Int) {
        context.dataStore.edit { prefs ->
            prefs[KEY_DETECTION_INTERVAL_MINUTES] = minutes
        }
    }

    suspend fun setPauseUntil(dateTime: LocalDateTime?) {
        context.dataStore.edit { prefs ->
            if (dateTime != null) {
                prefs[KEY_PAUSE_UNTIL] = dateTime.toString()
            } else {
                prefs.remove(KEY_PAUSE_UNTIL)
            }
        }
    }

    suspend fun setLastProcessedTimestamp(timestamp: Long) {
        context.dataStore.edit { prefs ->
            prefs[KEY_LAST_PROCESSED_TIMESTAMP] = timestamp
        }
    }

    suspend fun setForegroundServiceEnabled(enabled: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[KEY_FOREGROUND_SERVICE_ENABLED] = enabled
        }
    }

    suspend fun setNotificationsEnabled(enabled: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[KEY_NOTIFICATIONS_ENABLED] = enabled
        }
    }

    suspend fun setFirstLaunchCompleted() {
        context.dataStore.edit { prefs ->
            prefs[KEY_FIRST_LAUNCH_COMPLETED] = true
        }
    }

    suspend fun addIgnoredTarget(target: String) {
        context.dataStore.edit { prefs ->
            val current = prefs[KEY_IGNORED_TARGETS]?.let {
                it.split(",").filter { s -> s.isNotBlank() }.toMutableList()
            } ?: mutableListOf()

            if (!current.contains(target)) {
                current.add(target)
                prefs[KEY_IGNORED_TARGETS] = current.joinToString(",")
            }
        }
    }

    suspend fun removeIgnoredTarget(target: String) {
        context.dataStore.edit { prefs ->
            val current = prefs[KEY_IGNORED_TARGETS]?.let {
                it.split(",").filter { s -> s.isNotBlank() }.toMutableList()
            } ?: mutableListOf()

            current.remove(target)
            prefs[KEY_IGNORED_TARGETS] = current.joinToString(",")
        }
    }

    suspend fun clearAllSettings() {
        context.dataStore.edit { it.clear() }
    }
}
