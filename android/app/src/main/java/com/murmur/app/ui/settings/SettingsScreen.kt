package com.murmur.app.ui.settings

import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.murmur.app.R
import com.murmur.app.ui.navigation.hasUsageStatsPermission
import com.murmur.app.export.CSVExporter

@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    val createDocumentLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("text/csv")
    ) { uri ->
        if (uri != null && uiState.exportedData != null) {
            try {
                context.contentResolver.openOutputStream(uri)?.use { outputStream ->
                    outputStream.write(uiState.exportedData!!.toByteArray())
                }
                Toast.makeText(context, "导出成功", Toast.LENGTH_SHORT).show()
                viewModel.clearExportedData()
            } catch (e: Exception) {
                Toast.makeText(context, "导出失败: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    val createMarkdownLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("text/markdown")
    ) { uri ->
        if (uri != null && uiState.markdownExportData != null) {
            try {
                context.contentResolver.openOutputStream(uri)?.use { outputStream ->
                    outputStream.write(uiState.markdownExportData!!.toByteArray())
                }
                Toast.makeText(context, "周报导出成功", Toast.LENGTH_SHORT).show()
                viewModel.clearMarkdownExport()
            } catch (e: Exception) {
                Toast.makeText(context, "导出失败: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // Trigger file save after export
    LaunchedEffect(uiState.exportedData) {
        if (uiState.exportedData != null) {
            createDocumentLauncher.launch("murmur_export_${System.currentTimeMillis()}.csv")
        }
    }

    LaunchedEffect(uiState.markdownExportData) {
        if (uiState.markdownExportData != null) {
            createMarkdownLauncher.launch("Murmur_Weekly_Report_${System.currentTimeMillis()}.md")
        }
    }

    // Clear data confirmation dialog
    if (uiState.showClearDialog) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissClearDialog() },
            title = { Text(stringResource(R.string.settings_clear_confirm)) },
            text = { Text(stringResource(R.string.settings_clear_confirm_message)) },
            confirmButton = {
                Button(
                    onClick = { viewModel.clearAllData() },
                    enabled = !uiState.isClearing,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    if (uiState.isClearing) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    } else {
                        Text(stringResource(R.string.common_confirm))
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.dismissClearDialog() }) {
                    Text(stringResource(R.string.common_cancel))
                }
            }
        )
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Permission section
        item {
            SectionHeader(title = stringResource(R.string.settings_permission))
        }

        item {
            PermissionCard(context = context)
        }

        // Detection section
        item {
            SectionHeader(title = stringResource(R.string.settings_detection))
        }

        item {
            SettingsSwitchItem(
                title = stringResource(R.string.settings_detection),
                subtitle = stringResource(R.string.settings_detection_description),
                checked = uiState.detectionEnabled,
                onCheckedChange = { viewModel.setDetectionEnabled(it) }
            )
        }

        item {
            SettingsDropdownItem(
                title = stringResource(R.string.settings_detection_frequency),
                value = when (uiState.detectionIntervalMinutes) {
                    15 -> stringResource(R.string.settings_detection_frequency_15m)
                    30 -> stringResource(R.string.settings_detection_frequency_30m)
                    60 -> stringResource(R.string.settings_detection_frequency_1h)
                    else -> "${uiState.detectionIntervalMinutes}分钟"
                },
                options = listOf(15, 30, 60),
                optionLabels = listOf(
                    stringResource(R.string.settings_detection_frequency_15m),
                    stringResource(R.string.settings_detection_frequency_30m),
                    stringResource(R.string.settings_detection_frequency_1h)
                ),
                onSelect = { viewModel.setDetectionInterval(it) }
            )
        }

        // Foreground service
        item {
            SettingsSwitchItem(
                title = stringResource(R.string.settings_foreground_service),
                subtitle = stringResource(R.string.settings_foreground_service_description),
                checked = uiState.foregroundServiceEnabled,
                onCheckedChange = { viewModel.setForegroundService(it) }
            )
        }

        // Notifications toggle
        item {
            SettingsSwitchItem(
                title = "待补全提醒",
                subtitle = "定时提醒补全检测到的 AI 会话",
                checked = uiState.notificationsEnabled,
                onCheckedChange = { viewModel.setNotificationsEnabled(it) }
            )
        }

        // Night hours
        item {
            SectionHeader(title = stringResource(R.string.settings_night_hours))
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = stringResource(R.string.settings_night_description),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        SettingsDropdownItem(
                            title = "开始",
                            value = "${uiState.nightHoursStart}:00",
                            options = (20..23).toList(),
                            optionLabels = (20..23).map { "${it}:00" },
                            onSelect = { viewModel.setNightHoursStart(it) },
                            modifier = Modifier.weight(1f)
                        )
                        SettingsDropdownItem(
                            title = "结束",
                            value = "${uiState.nightHoursEnd}:00",
                            options = (5..9).toList(),
                            optionLabels = (5..9).map { "${it}:00" },
                            onSelect = { viewModel.setNightHoursEnd(it) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }

        // Data section
        item {
            SectionHeader(title = "数据管理")
        }

        item {
            SettingsActionItem(
                title = stringResource(R.string.settings_export_csv),
                subtitle = stringResource(R.string.settings_export_description),
                icon = Icons.Default.FileDownload,
                isLoading = uiState.isExporting,
                onClick = { viewModel.exportData() }
            )
        }

        item {
            SettingsActionItem(
                title = "导出Markdown周报",
                subtitle = "生成可读的周报 .md 文件",
                icon = Icons.Default.Description,
                isLoading = uiState.isExporting,
                onClick = { viewModel.exportMarkdown() }
            )
        }

        item {
            SettingsActionItem(
                title = stringResource(R.string.settings_clear_data),
                subtitle = stringResource(R.string.settings_clear_data_description),
                icon = Icons.Default.DeleteForever,
                isDestructive = true,
                onClick = { viewModel.showClearDialog() }
            )
        }

        // Privacy section
        item {
            SectionHeader(title = stringResource(R.string.settings_privacy))
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                )
            ) {
                Text(
                    text = stringResource(R.string.settings_privacy_content),
                    modifier = Modifier.padding(16.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // About section
        item {
            SectionHeader(title = stringResource(R.string.settings_about))
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Murmur",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = stringResource(R.string.settings_about_version),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = stringResource(R.string.settings_about_description),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                }
            }
        }

        item { Spacer(modifier = Modifier.height(80.dp)) }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp)
    )
}

@Composable
private fun PermissionCard(context: Context) {
    val hasPermission = hasUsageStatsPermission(context)

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (hasPermission)
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
            else
                MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = if (hasPermission) Icons.Default.CheckCircle else Icons.Default.Warning,
                contentDescription = null,
                tint = if (hasPermission) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                modifier = Modifier.size(24.dp)
            )

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (hasPermission)
                        stringResource(R.string.settings_permission_granted)
                    else
                        stringResource(R.string.settings_permission_denied),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = stringResource(R.string.settings_permission_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (!hasPermission) {
                Button(
                    onClick = {
                        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
                        context.startActivity(intent)
                    }
                ) {
                    Text(stringResource(R.string.settings_open_permission))
                }
            }
        }
    }
}

@Composable
private fun SettingsSwitchItem(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Switch(checked = checked, onCheckedChange = onCheckedChange)
        }
    }
}

@Composable
private fun SettingsDropdownItem(
    title: String,
    value: String,
    options: List<Int>,
    optionLabels: List<String>,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    Box(modifier = modifier) {
        OutlinedCard(
            onClick = { expanded = true },
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = value,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
            }
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            options.forEachIndexed { index, option ->
                DropdownMenuItem(
                    text = { Text(optionLabels[index]) },
                    onClick = {
                        onSelect(option)
                        expanded = false
                    }
                )
            }
        }
    }
}

@Composable
private fun SettingsActionItem(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    isLoading: Boolean = false,
    isDestructive: Boolean = false,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
        colors = CardDefaults.cardColors(
            containerColor = if (isDestructive)
                MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f)
            else
                MaterialTheme.colorScheme.surface
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
            } else {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = if (isDestructive) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    color = if (isDestructive) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
