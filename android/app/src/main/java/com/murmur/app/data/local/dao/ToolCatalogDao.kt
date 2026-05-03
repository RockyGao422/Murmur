package com.murmur.app.data.local.dao

import androidx.room.*
import com.murmur.app.data.local.entity.ToolCatalogItemEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ToolCatalogDao {

    @Query("SELECT * FROM tool_catalog_items ORDER BY sort_order ASC")
    fun getAll(): Flow<List<ToolCatalogItemEntity>>

    @Query("SELECT * FROM tool_catalog_items ORDER BY sort_order ASC")
    suspend fun getAllSync(): List<ToolCatalogItemEntity>

    @Query("SELECT * FROM tool_catalog_items WHERE detection_enabled = 1 ORDER BY sort_order ASC")
    fun getEnabled(): Flow<List<ToolCatalogItemEntity>>

    @Query("SELECT * FROM tool_catalog_items WHERE detection_enabled = 1 ORDER BY sort_order ASC")
    suspend fun getEnabledSync(): List<ToolCatalogItemEntity>

    @Query("SELECT * FROM tool_catalog_items WHERE id = :id")
    suspend fun getById(id: String): ToolCatalogItemEntity?

    @Query("SELECT COUNT(*) FROM tool_catalog_items")
    suspend fun getCount(): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(items: List<ToolCatalogItemEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: ToolCatalogItemEntity)

    @Update
    suspend fun update(item: ToolCatalogItemEntity)

    @Query("UPDATE tool_catalog_items SET detection_enabled = :enabled WHERE id = :id")
    suspend fun setDetectionEnabled(id: String, enabled: Boolean)

    @Query("DELETE FROM tool_catalog_items WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM tool_catalog_items")
    suspend fun deleteAll()
}
