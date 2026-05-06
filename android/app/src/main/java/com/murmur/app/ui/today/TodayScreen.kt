package com.murmur.app.ui.today

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.murmur.app.R
import com.murmur.app.ui.components.SessionCard
import com.murmur.app.ui.components.formatDuration

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(
    onNavigateToCompletion: (Long) -> Unit,
    viewModel: TodayViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Box(modifier = Modifier.fillMaxSize()) {
        if (uiState.isLoading && uiState.todaySessions.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Detection status card
                item {
                    DetectionStatusCard(
                        isActive = uiState.isDetectionActive,
                        hasPermission = uiState.hasPermission,
                        sessionCount = uiState.stats.sessionCount,
                        isRefreshing = uiState.isLoading,
                        onRefresh = { viewModel.refresh() }
                    )
                }

                // Stats grid
                if (uiState.stats.sessionCount > 0) {
                    item {
                        StatsGrid(stats = uiState.stats)
                    }
                }

                // Recent sessions header
                if (uiState.todaySessions.isNotEmpty()) {
                    item {
                        Text(
                            text = stringResource(R.string.today_recent_sessions),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                }

                // Session list or empty state
                if (uiState.todaySessions.isEmpty()) {
                    item {
                        EmptyState()
                    }
                } else {
                    items(uiState.todaySessions, key = { it.id }) { session ->
                        SessionCard(
                            session = session,
                            onClick = {
                                if (session.status != com.murmur.app.domain.model.SessionStatus.COMPLETED) {
                                    onNavigateToCompletion(session.id)
                                }
                            }
                        )
                    }
                }

                // Bottom spacer for navigation bar
                item { Spacer(modifier = Modifier.height(80.dp)) }
            }
        }
    }
}

@Composable
private fun DetectionStatusCard(
    isActive: Boolean,
    hasPermission: Boolean,
    sessionCount: Int,
    isRefreshing: Boolean,
    onRefresh: () -> Unit
) {
    val (statusColor, statusText, icon) = when {
        !hasPermission -> Triple(
            Color(0xFFF44336),
            stringResource(R.string.today_detection_no_permission),
            Icons.Default.Warning
        )
        !isActive -> Triple(
            Color(0xFFFFC107),
            stringResource(R.string.today_detection_paused),
            Icons.Default.PauseCircle
        )
        else -> Triple(
            Color(0xFF4CAF50),
            stringResource(R.string.today_detection_active),
            Icons.Default.CheckCircle
        )
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = statusColor.copy(alpha = 0.1f)
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
                imageVector = icon,
                contentDescription = null,
                tint = statusColor,
                modifier = Modifier.size(24.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = statusText,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium,
                    color = statusColor
                )
                Text(
                    text = "今日已检测 $sessionCount 个会话",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            IconButton(
                onClick = onRefresh,
                enabled = !isRefreshing
            ) {
                if (isRefreshing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = null,
                        tint = statusColor
                    )
                }
            }
        }
    }
}

@Composable
private fun StatsGrid(stats: TodayStatsUi) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        StatCard(
            modifier = Modifier.weight(1f),
            label = stringResource(R.string.today_ai_usage_time),
            value = formatDuration(stats.totalActiveSeconds),
            icon = Icons.Default.Timer
        )
        StatCard(
            modifier = Modifier.weight(1f),
            label = stringResource(R.string.today_detection_count),
            value = "${stats.sessionCount}次",
            icon = Icons.Default.Analytics
        )
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        StatCard(
            modifier = Modifier.weight(1f),
            label = stringResource(R.string.today_pending_count),
            value = "${stats.pendingCount}个",
            icon = Icons.Default.Pending
        )
        StatCard(
            modifier = Modifier.weight(1f),
            label = stringResource(R.string.today_net_gain),
            value = formatDuration(stats.netGainSeconds),
            icon = Icons.Default.TrendingUp
        )
    }

    // Fatigue score
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        StatCard(
            modifier = Modifier.weight(1f),
            label = stringResource(R.string.today_fatigue_index),
            value = "${stats.fatigueScore}/100",
            icon = Icons.Default.Mood
        )
        Spacer(modifier = Modifier.weight(1f))
    }
}

@Composable
private fun StatCard(
    modifier: Modifier = Modifier,
    label: String,
    value: String,
    icon: ImageVector
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun EmptyState() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.Psychology,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.today_no_data),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.today_no_data_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                textAlign = TextAlign.Center
            )
        }
    }
}
