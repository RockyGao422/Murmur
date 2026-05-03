package com.murmur.app.ui.completion

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
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
import com.murmur.app.domain.model.OutputQuality
import com.murmur.app.domain.model.UserMood
import com.murmur.app.ui.components.formatDuration

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CompletionScreen(
    sessionId: Long,
    onSaved: () -> Unit,
    onCancel: () -> Unit,
    viewModel: CompletionViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(sessionId) {
        viewModel.loadSession(sessionId)
    }

    LaunchedEffect(uiState.isSaved) {
        if (uiState.isSaved) {
            onSaved()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.completion_title)) },
                navigationIcon = {
                    IconButton(onClick = onCancel) {
                        Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.completion_cancel))
                    }
                },
                actions = {
                    TextButton(
                        onClick = { viewModel.save() },
                        enabled = !uiState.isSaving
                    ) {
                        if (uiState.isSaving) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Text(stringResource(R.string.completion_save))
                        }
                    }
                }
            )
        }
    ) { innerPadding ->
        if (uiState.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (uiState.error != null && uiState.session == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(uiState.error ?: "Error", color = MaterialTheme.colorScheme.error)
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Auto-filled section
                uiState.session?.let { session ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = session.toolName,
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            InfoRow(label = stringResource(R.string.completion_platform), value = session.sourcePlatform.name)
                            InfoRow(label = stringResource(R.string.completion_date), value = session.localDate)
                            InfoRow(
                                label = stringResource(R.string.completion_duration),
                                value = formatDuration(session.activeSeconds)
                            )
                        }
                    }
                }

                // Use case dropdown
                var useCaseExpanded by remember { mutableStateOf(false) }
                ExposedDropdownMenuBox(
                    expanded = useCaseExpanded,
                    onExpandedChange = { useCaseExpanded = it }
                ) {
                    OutlinedTextField(
                        value = uiState.useCase,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.completion_use_case)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = useCaseExpanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor()
                    )
                    ExposedDropdownMenu(
                        expanded = useCaseExpanded,
                        onDismissRequest = { useCaseExpanded = false }
                    ) {
                        uiState.useCaseOptions.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option) },
                                onClick = {
                                    viewModel.setUseCase(option)
                                    useCaseExpanded = false
                                }
                            )
                        }
                    }
                }

                // Active minutes input
                OutlinedTextField(
                    value = uiState.activeMinutes,
                    onValueChange = { viewModel.setActiveMinutes(it) },
                    label = { Text(stringResource(R.string.completion_duration)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    suffix = { Text("分钟") }
                )

                // Quality picker
                Text(
                    text = stringResource(R.string.completion_quality),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectableGroup(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutputQuality.entries.forEach { quality ->
                        FilterChip(
                            selected = uiState.quality == quality,
                            onClick = { viewModel.setQuality(quality) },
                            label = { Text(quality.label) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                // Mood picker
                Text(
                    text = stringResource(R.string.completion_mood),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectableGroup(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    UserMood.entries.forEach { mood ->
                        FilterChip(
                            selected = uiState.mood == mood,
                            onClick = { viewModel.setMood(mood) },
                            label = { Text(mood.label) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                // Input/Output counts
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedTextField(
                        value = uiState.inputCount,
                        onValueChange = { viewModel.setInputCount(it) },
                        label = { Text(stringResource(R.string.completion_input_count)) },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = uiState.outputCount,
                        onValueChange = { viewModel.setOutputCount(it) },
                        label = { Text(stringResource(R.string.completion_output_count)) },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                }

                // Rework toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = stringResource(R.string.completion_has_rework),
                        style = MaterialTheme.typography.bodyLarge
                    )
                    Switch(
                        checked = uiState.hasRework,
                        onCheckedChange = { viewModel.setHasRework(it) }
                    )
                }

                // Notes
                OutlinedTextField(
                    value = uiState.notes,
                    onValueChange = { viewModel.setNotes(it) },
                    label = { Text(stringResource(R.string.completion_notes)) },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 5
                )

                // Preview section
                uiState.preview?.let { preview ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                        )
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = stringResource(R.string.completion_preview),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            PreviewRow(
                                label = stringResource(R.string.completion_time_saved),
                                value = formatDuration(preview.timeSavedSeconds),
                                color = MaterialTheme.colorScheme.primary
                            )
                            PreviewRow(
                                label = stringResource(R.string.completion_extra_cost),
                                value = formatDuration(preview.extraCostSeconds),
                                color = MaterialTheme.colorScheme.error
                            )
                            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                            PreviewRow(
                                label = stringResource(R.string.completion_net_gain),
                                value = formatDuration(preview.netGainSeconds),
                                color = if (preview.netGainSeconds >= 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }

                // Error message
                uiState.error?.let { error ->
                    Text(
                        text = error,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }

                // Bottom spacer
                Spacer(modifier = Modifier.height(32.dp))
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
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

@Composable
private fun PreviewRow(label: String, value: String, color: androidx.compose.ui.graphics.Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = color
        )
    }
}
