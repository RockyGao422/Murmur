package com.murmur.app.ui.tools

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.murmur.app.data.local.AppDatabase
import com.murmur.app.data.repository.ToolRepository
import com.murmur.app.domain.model.ToolCatalogItem
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class ToolsUiState(
    val tools: List<ToolCatalogItem> = emptyList(),
    val filteredTools: List<ToolCatalogItem> = emptyList(),
    val isLoading: Boolean = true,
    val searchQuery: String = "",
    val enabledCount: Int = 0
)

class ToolsViewModel(application: Application) : AndroidViewModel(application) {

    private val database = AppDatabase.getInstance(application)
    private val toolRepo = ToolRepository(database.toolCatalogDao(), application)

    private val _uiState = MutableStateFlow(ToolsUiState())
    val uiState: StateFlow<ToolsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            toolRepo.getAll().collect { tools ->
                val enabledCount = tools.count { it.detectionEnabled }
                val filtered = filterTools(tools, _uiState.value.searchQuery)
                _uiState.update {
                    it.copy(
                        tools = tools,
                        filteredTools = filtered,
                        isLoading = false,
                        enabledCount = enabledCount
                    )
                }
            }
        }
    }

    fun toggleTool(id: String, enabled: Boolean) {
        viewModelScope.launch {
            toolRepo.toggleTool(id, enabled)
        }
    }

    fun search(query: String) {
        val filtered = filterTools(_uiState.value.tools, query)
        _uiState.update {
            it.copy(
                searchQuery = query,
                filteredTools = filtered
            )
        }
    }

    fun addCustomTool(name: String, packageNames: List<String>) {
        viewModelScope.launch {
            val id = "custom_${System.currentTimeMillis()}"
            val tool = ToolCatalogItem(
                id = id,
                name = name,
                aliases = listOf(name),
                androidPackageNames = packageNames,
                webDomains = emptyList(),
                urlPatterns = emptyList(),
                defaultEnabled = true,
                detectionEnabled = true,
                isDefault = false,
                userDefined = true,
                sortOrder = 999,
                confidencePackageName = 0.98f,
                confidenceDomain = 0.95f,
                confidenceUrlPattern = 0.90f,
                confidenceAppName = 0.85f,
                confidenceTitle = 0.65f,
                confidenceUserMapping = 1.0f
            )
            toolRepo.addCustomTool(tool)
        }
    }

    fun deleteTool(id: String) {
        viewModelScope.launch {
            toolRepo.deleteTool(id)
        }
    }

    private fun filterTools(tools: List<ToolCatalogItem>, query: String): List<ToolCatalogItem> {
        if (query.isBlank()) return tools
        val lowerQuery = query.lowercase()
        return tools.filter { tool ->
            tool.name.lowercase().contains(lowerQuery) ||
            tool.aliases.any { it.lowercase().contains(lowerQuery) } ||
            tool.androidPackageNames.any { it.lowercase().contains(lowerQuery) }
        }
    }
}
