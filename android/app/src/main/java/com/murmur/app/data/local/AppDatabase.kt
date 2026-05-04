package com.murmur.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.murmur.app.data.local.dao.*
import com.murmur.app.data.local.entity.*
import java.util.UUID

@Database(
    entities = [
        DetectedSessionEntity::class,
        LedgerEntryEntity::class,
        ToolCatalogItemEntity::class,
        IgnoredTargetEntity::class,
        DailySummaryEntity::class
    ],
    version = 2,
    exportSchema = true
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {

    abstract fun detectedSessionDao(): DetectedSessionDao
    abstract fun ledgerEntryDao(): LedgerEntryDao
    abstract fun toolCatalogDao(): ToolCatalogDao
    abstract fun dailySummaryDao(): DailySummaryDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Add new canonical columns
                db.execSQL("ALTER TABLE detected_sessions ADD COLUMN canonical_id TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE detected_sessions ADD COLUMN detector_id TEXT NOT NULL DEFAULT 'android.usagestats'")
                db.execSQL("ALTER TABLE detected_sessions ADD COLUMN raw_app_name TEXT")
                db.execSQL("ALTER TABLE detected_sessions ADD COLUMN raw_package_name TEXT")
                db.execSQL("ALTER TABLE detected_sessions ADD COLUMN raw_domain TEXT")
                db.execSQL("ALTER TABLE detected_sessions ADD COLUMN raw_url_pattern TEXT")
                db.execSQL("ALTER TABLE detected_sessions ADD COLUMN idle_seconds INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE detected_sessions ADD COLUMN timezone TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE detected_sessions ADD COLUMN is_night INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE detected_sessions ADD COLUMN merged_into_session_id TEXT")
                db.execSQL("ALTER TABLE detected_sessions ADD COLUMN prompt_count INTEGER")
                db.execSQL("ALTER TABLE detected_sessions ADD COLUMN source_fingerprint TEXT")
                db.execSQL("ALTER TABLE detected_sessions ADD COLUMN device_id TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE detected_sessions ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'local_only'")

                // Migrate existing package_name to raw_package_name
                db.execSQL("UPDATE detected_sessions SET raw_package_name = package_name")

                // Generate UUIDs for existing rows
                val cursor = db.query("SELECT id, package_name FROM detected_sessions")
                while (cursor.moveToNext()) {
                    val id = cursor.getLong(0)
                    val uuid = UUID.randomUUID().toString()
                    db.execSQL(
                        "UPDATE detected_sessions SET canonical_id = ? WHERE id = ?",
                        arrayOf(uuid, id)
                    )
                }
                cursor.close()

                // Create indices on new columns
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_detected_sessions_canonical_id ON detected_sessions(canonical_id)")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_detected_sessions_source_fingerprint ON detected_sessions(source_fingerprint)")
            }
        }

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context).also { INSTANCE = it }
            }
        }

        private fun buildDatabase(context: Context): AppDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "murmur.db"
            )
                .addMigrations(MIGRATION_1_2)
                .build()
        }
    }
}
