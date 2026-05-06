package com.murmur.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.murmur.app.domain.model.DetectedSession
import com.murmur.app.domain.model.SessionStatus

/**
 * Reusable card component for displaying a detected session.
 */
@Composable
fun SessionCard(
    session: DetectedSession,
    onClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = session.toolName.ifBlank { session.packageName },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    if (session.status == SessionStatus.SUSPECTED) {
                        StatusChip(
                            text = "疑似",
                            color = MaterialTheme.colorScheme.tertiary
                        )
                    }

                    if (session.status == SessionStatus.COMPLETED) {
                        StatusChip(
                            text = "已补全",
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    ConfidenceChip(confidence = session.confidence)

                    Text(
                        text = formatDuration(session.activeSeconds),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Text(
                        text = session.localDate,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            PlatformBadge(platform = session.sourcePlatform.value)
        }
    }
}

@Composable
private fun StatusChip(text: String, color: androidx.compose.ui.graphics.Color) {
    Surface(
        color = color.copy(alpha = 0.15f),
        shape = MaterialTheme.shapes.small
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = color
        )
    }
}

fun formatDuration(seconds: Long): String {
    val sign = if (seconds < 0) "-" else ""
    val absoluteSeconds = if (seconds == Long.MIN_VALUE) Long.MAX_VALUE else kotlin.math.abs(seconds)
    return when {
        absoluteSeconds < 60 -> "$sign${absoluteSeconds}秒"
        absoluteSeconds < 3600 -> "$sign${absoluteSeconds / 60}分钟"
        else -> {
            val hours = absoluteSeconds / 3600
            val minutes = (absoluteSeconds % 3600) / 60
            "$sign${hours}小时${minutes}分钟"
        }
    }
}
