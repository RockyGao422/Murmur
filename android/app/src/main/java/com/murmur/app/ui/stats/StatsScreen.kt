package com.murmur.app.ui.stats

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.murmur.app.R
import com.murmur.app.domain.model.ToolUsage
import com.murmur.app.ui.components.formatDuration

@Composable
fun StatsScreen(
    viewModel: StatsViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Range selector
        item {
            RangeSelector(
                selectedRange = uiState.selectedRange,
                onSelectRange = { viewModel.selectRange(it) }
            )
        }

        if (uiState.isLoading) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
        } else if (uiState.summary.totalSessions == 0) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(R.string.stats_no_data),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            // Summary cards
            item {
                StatsSummaryCards(summary = uiState.summary)
            }

            // Daily sessions bar chart
            item {
                StatChartCard(
                    title = stringResource(R.string.stats_daily_sessions),
                    dailyStats = uiState.dailySessions,
                    valueExtractor = { it.sessionCount.toFloat() },
                    maxValue = uiState.dailySessions.maxOfOrNull { it.sessionCount }?.toFloat() ?: 1f
                )
            }

            // Daily minutes bar chart
            item {
                StatChartCard(
                    title = stringResource(R.string.stats_daily_minutes),
                    dailyStats = uiState.dailySessions,
                    valueExtractor = { it.totalMinutes.toFloat() },
                    maxValue = uiState.dailySessions.maxOfOrNull { it.totalMinutes }?.toFloat() ?: 1f,
                    color = Color(0xFF2196F3)
                )
            }

            // Tool distribution
            if (uiState.toolDistribution.isNotEmpty()) {
                item {
                    Text(
                        text = stringResource(R.string.stats_tool_distribution),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium
                    )
                }

                items(uiState.toolDistribution) { toolUsage ->
                    ToolUsageRow(toolUsage = toolUsage)
                }
            }

            // Platform distribution
            if (uiState.platformDistribution.isNotEmpty()) {
                item {
                    Text(
                        text = stringResource(R.string.stats_platform_distribution),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium
                    )
                }

                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            uiState.platformDistribution.forEach { (platform, count) ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 4.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = platform,
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                    Text(
                                        text = "${count}次",
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Bottom spacer
        item { Spacer(modifier = Modifier.height(80.dp)) }
    }
}

@Composable
private fun RangeSelector(
    selectedRange: StatsRange,
    onSelectRange: (StatsRange) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        StatsRange.entries.forEach { range ->
            FilterChip(
                selected = selectedRange == range,
                onClick = { onSelectRange(range) },
                label = { Text(range.label) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun StatsSummaryCards(summary: StatsSummary) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            SummaryCard(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.stats_total_sessions),
                value = "${summary.totalSessions}",
                icon = Icons.Default.Numbers
            )
            SummaryCard(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.stats_total_hours),
                value = formatDuration(summary.totalActiveSeconds),
                icon = Icons.Default.Timer
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            SummaryCard(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.stats_total_net_gain),
                value = formatDuration(summary.totalNetGainSeconds),
                icon = Icons.Default.TrendingUp
            )
            SummaryCard(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.stats_avg_fatigue),
                value = "${summary.avgFatigueScore}/100",
                icon = Icons.Default.Mood
            )
        }
    }
}

@Composable
private fun SummaryCard(
    modifier: Modifier = Modifier,
    label: String,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun StatChartCard(
    title: String,
    dailyStats: List<DailyStat>,
    valueExtractor: (DailyStat) -> Float,
    maxValue: Float,
    color: Color = Color(0xFF4CAF50)
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Medium
            )
            Spacer(modifier = Modifier.height(12.dp))

            // Simple Canvas-based bar chart
            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp)
            ) {
                val barCount = dailyStats.size
                if (barCount == 0) return@Canvas

                val barWidth = size.width / barCount * 0.7f
                val spacing = size.width / barCount * 0.3f
                val safeMax = if (maxValue > 0) maxValue else 1f

                dailyStats.forEachIndexed { index, stat ->
                    val value = valueExtractor(stat)
                    val barHeight = (value / safeMax) * size.height * 0.85f
                    val x = index * (barWidth + spacing) + spacing / 2
                    val y = size.height - barHeight

                    drawRect(
                        color = color,
                        topLeft = Offset(x, y),
                        size = Size(barWidth, barHeight)
                    )
                }
            }

            // Labels
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                dailyStats.forEach { stat ->
                    Text(
                        text = stat.label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    }
}

@Composable
private fun ToolUsageRow(toolUsage: ToolUsage) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Percentage bar
            Box(modifier = Modifier.weight(1f)) {
                Column {
                    Text(
                        text = toolUsage.toolName.ifBlank { toolUsage.toolId },
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    LinearProgressIndicator(
                        progress = { toolUsage.percentage },
                        modifier = Modifier.fillMaxWidth(),
                        color = MaterialTheme.colorScheme.primary,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                }
            }

            Text(
                text = "${toolUsage.sessionCount}次",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
