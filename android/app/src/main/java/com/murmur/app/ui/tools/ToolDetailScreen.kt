package com.murmur.app.ui.tools

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.murmur.app.R
import com.murmur.app.ui.components.SessionCard
import com.murmur.app.domain.model.DetectedSession

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ToolDetailScreen(
    toolId: String,
    onBack: () -> Unit,
    viewModel: ToolsViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val tool = uiState.tools.find { it.id == toolId }

    var showIgnoreDialog by remember { mutableStateOf(false) }
    var isEditingPackages by remember { mutableStateOf(false) }
    var editedPackages by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(tool?.name ?: stringResource(R.string.tool_detail_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = null)
                    }
                }
            )
        }
    ) { innerPadding ->
        if (tool == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Tool info card
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = tool.name,
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold
                                )
                                Switch(
                                    checked = tool.detectionEnabled,
                                    onCheckedChange = { viewModel.toggleTool(tool.id, it) }
                                )
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            InfoRow(label = stringResource(R.string.tool_detail_aliases), value = tool.aliases.joinToString(", "))

                            // Package names
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = stringResource(R.string.tool_detail_packages),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                IconButton(onClick = {
                                    editedPackages = tool.androidPackageNames.joinToString(", ")
                                    isEditingPackages = true
                                }) {
                                    Icon(
                                        Icons.Default.Edit,
                                        contentDescription = null,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                            if (tool.androidPackageNames.isEmpty()) {
                                Text(
                                    text = "暂无",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                                )
                            } else {
                                tool.androidPackageNames.forEach { pkg ->
                                    Text(
                                        text = pkg,
                                        style = MaterialTheme.typography.bodyMedium,
                                        modifier = Modifier.padding(start = 16.dp, top = 2.dp)
                                    )
                                }
                            }

                            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

                            // Detection status
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = stringResource(R.string.tool_detail_detection_enabled),
                                    style = MaterialTheme.typography.bodyLarge
                                )
                                Text(
                                    text = if (tool.detectionEnabled) "已启用" else "已禁用",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (tool.detectionEnabled) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }

                // Ignore button (only for user-defined tools or custom tools)
                if (tool.userDefined) {
                    item {
                        Button(
                            onClick = { showIgnoreDialog = true },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.error
                            ),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(stringResource(R.string.tool_detail_ignore))
                        }
                    }
                }

                item { Spacer(modifier = Modifier.height(80.dp)) }
            }
        }
    }

    // Ignore confirmation dialog
    if (showIgnoreDialog) {
        AlertDialog(
            onDismissRequest = { showIgnoreDialog = false },
            title = { Text(stringResource(R.string.tool_detail_ignore)) },
            text = { Text(stringResource(R.string.tool_detail_ignore_confirm)) },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.deleteTool(toolId)
                        showIgnoreDialog = false
                        onBack()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text(stringResource(R.string.common_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showIgnoreDialog = false }) {
                    Text(stringResource(R.string.common_cancel))
                }
            }
        )
    }

    // Edit packages dialog
    if (isEditingPackages) {
        AlertDialog(
            onDismissRequest = { isEditingPackages = false },
            title = { Text(stringResource(R.string.tool_detail_packages)) },
            text = {
                OutlinedTextField(
                    value = editedPackages,
                    onValueChange = { editedPackages = it },
                    label = { Text("包名（逗号分隔）") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3
                )
            },
            confirmButton = {
                Button(onClick = {
                    isEditingPackages = false
                    // Note: In a full implementation, this would update the tool entity
                }) {
                    Text(stringResource(R.string.common_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { isEditingPackages = false }) {
                    Text(stringResource(R.string.common_cancel))
                }
            }
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
    }
}
