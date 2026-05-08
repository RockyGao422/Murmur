package com.murmur.app.data.repository

import android.content.Context
import com.murmur.app.data.local.dao.ToolCatalogDao
import com.murmur.app.data.local.entity.ToolCatalogItemEntity
import com.murmur.app.domain.model.ToolCatalogItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

class ToolRepository(
    private val dao: ToolCatalogDao,
    private val context: Context
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val stringListSerializer = ListSerializer(String.serializer())

    fun getAll(): Flow<List<ToolCatalogItem>> {
        return dao.getAll().map { entities ->
            entities.map { it.toDomain() }
        }
    }

    fun getEnabled(): Flow<List<ToolCatalogItem>> {
        return dao.getEnabled().map { entities ->
            entities.map { it.toDomain() }
        }
    }

    suspend fun getAllSync(): List<ToolCatalogItem> {
        return dao.getAllSync().map { it.toDomain() }
    }

    suspend fun getEnabledSync(): List<ToolCatalogItem> {
        return dao.getEnabledSync().map { it.toDomain() }
    }

    suspend fun getById(id: String): ToolCatalogItem? {
        return dao.getById(id)?.toDomain()
    }

    suspend fun getCount(): Int {
        return dao.getCount()
    }

    suspend fun toggleTool(id: String, enabled: Boolean) = withContext(Dispatchers.IO) {
        dao.setDetectionEnabled(id, enabled)
    }

    suspend fun addCustomTool(item: ToolCatalogItem) = withContext(Dispatchers.IO) {
        dao.insert(item.toEntity())
    }

    suspend fun updateTool(item: ToolCatalogItem) = withContext(Dispatchers.IO) {
        dao.update(item.toEntity())
    }

    suspend fun deleteTool(id: String) = withContext(Dispatchers.IO) {
        dao.deleteById(id)
    }

    suspend fun seedDefaultCatalog() = withContext(Dispatchers.IO) {
        val count = dao.getCount()
        if (count > 0) return@withContext

        try {
            val inputStream = context.assets.open("tool-catalog.json")
            val content = inputStream.bufferedReader().use { it.readText() }
            val catalog = json.decodeFromString<ToolCatalogJson>(content)

            val entities = catalog.tools.map { tool ->
                ToolCatalogItemEntity(
                    id = tool.id,
                    name = tool.name,
                    aliasesJson = json.encodeToString(
                        stringListSerializer,
                        tool.aliases
                    ),
                    androidPackageNamesJson = json.encodeToString(
                        stringListSerializer,
                        tool.android_package_names
                    ),
                    webDomainsJson = json.encodeToString(
                        stringListSerializer,
                        tool.web_domains
                    ),
                    urlPatternsJson = json.encodeToString(
                        stringListSerializer,
                        tool.url_patterns
                    ),
                    defaultEnabled = tool.default_enabled,
                    detectionEnabled = tool.detection_enabled,
                    isDefault = tool.is_default,
                    userDefined = tool.user_defined,
                    sortOrder = tool.sort_order,
                    confidencePackageName = tool.confidence.package_name,
                    confidenceDomain = tool.confidence.domain,
                    confidenceUrlPattern = tool.confidence.url_pattern,
                    confidenceAppName = tool.confidence.app_name,
                    confidenceTitle = tool.confidence.title,
                    confidenceUserMapping = tool.confidence.user_mapping
                )
            }
            dao.insertAll(entities)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    // Extension functions
    private fun ToolCatalogItemEntity.toDomain(): ToolCatalogItem {
        return ToolCatalogItem(
            id = id,
            name = name,
            aliases = parseJsonList(aliasesJson),
            androidPackageNames = parseJsonList(androidPackageNamesJson),
            webDomains = parseJsonList(webDomainsJson),
            urlPatterns = parseJsonList(urlPatternsJson),
            defaultEnabled = defaultEnabled,
            detectionEnabled = detectionEnabled,
            isDefault = isDefault,
            userDefined = userDefined,
            sortOrder = sortOrder,
            confidencePackageName = confidencePackageName,
            confidenceDomain = confidenceDomain,
            confidenceUrlPattern = confidenceUrlPattern,
            confidenceAppName = confidenceAppName,
            confidenceTitle = confidenceTitle,
            confidenceUserMapping = confidenceUserMapping
        )
    }

    private fun ToolCatalogItem.toEntity(): ToolCatalogItemEntity {
        return ToolCatalogItemEntity(
            id = id,
            name = name,
            aliasesJson = json.encodeToString(
                stringListSerializer,
                aliases
            ),
            androidPackageNamesJson = json.encodeToString(
                stringListSerializer,
                androidPackageNames
            ),
            webDomainsJson = json.encodeToString(
                stringListSerializer,
                webDomains
            ),
            urlPatternsJson = json.encodeToString(
                stringListSerializer,
                urlPatterns
            ),
            defaultEnabled = defaultEnabled,
            detectionEnabled = detectionEnabled,
            isDefault = isDefault,
            userDefined = userDefined,
            sortOrder = sortOrder,
            confidencePackageName = confidencePackageName,
            confidenceDomain = confidenceDomain,
            confidenceUrlPattern = confidenceUrlPattern,
            confidenceAppName = confidenceAppName,
            confidenceTitle = confidenceTitle,
            confidenceUserMapping = confidenceUserMapping
        )
    }

    private fun parseJsonList(jsonStr: String): List<String> {
        return try {
            json.decodeFromString(
                stringListSerializer,
                jsonStr
            )
        } catch (e: Exception) {
            emptyList()
        }
    }
}

// JSON parsing structures for the tool catalog file
@Serializable
data class ToolCatalogJson(
    val version: String,
    val updated_at: String,
    val description: String,
    val tools: List<ToolJson>
)

@Serializable
data class ToolJson(
    val id: String,
    val name: String,
    val aliases: List<String>,
    val macos_bundle_ids: List<String> = emptyList(),
    val macos_app_name_patterns: List<String> = emptyList(),
    val macos_title_patterns: List<String> = emptyList(),
    val android_package_names: List<String> = emptyList(),
    val web_domains: List<String> = emptyList(),
    val url_patterns: List<String> = emptyList(),
    val default_enabled: Boolean,
    val detection_enabled: Boolean,
    val is_default: Boolean,
    val user_defined: Boolean,
    val sort_order: Int,
    val confidence: ToolConfidenceJson
)

@Serializable
data class ToolConfidenceJson(
    val bundle_id: Float = 0.98f,
    val package_name: Float = 0.98f,
    val domain: Float = 0.95f,
    val url_pattern: Float = 0.90f,
    val app_name: Float = 0.85f,
    val title: Float = 0.65f,
    val user_mapping: Float = 1.0f
)
