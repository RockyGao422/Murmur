package com.murmur.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.murmur.app.data.local.dao.*
import com.murmur.app.data.local.entity.*

@Database(
    entities = [
        DetectedSessionEntity::class,
        LedgerEntryEntity::class,
        ToolCatalogItemEntity::class,
        IgnoredTargetEntity::class,
        DailySummaryEntity::class
    ],
    version = 1,
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
                .fallbackToDestructiveMigration()
                .build()
        }
    }
}
