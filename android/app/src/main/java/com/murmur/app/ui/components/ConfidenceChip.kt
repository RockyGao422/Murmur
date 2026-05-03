package com.murmur.app.ui.components

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.murmur.app.domain.model.ConfidenceLevel

/**
 * Displays confidence level as a colored chip.
 * Green = HIGH, Yellow = MEDIUM, Red = LOW.
 */
@Composable
fun ConfidenceChip(
    confidence: Float,
    modifier: Modifier = Modifier
) {
    val level = ConfidenceLevel.fromScore(confidence)
    val color = when (level) {
        ConfidenceLevel.HIGH -> Color(0xFF4CAF50)
        ConfidenceLevel.MEDIUM -> Color(0xFFFFC107)
        ConfidenceLevel.LOW -> Color(0xFFF44336)
    }
    val label = when (level) {
        ConfidenceLevel.HIGH -> "高"
        ConfidenceLevel.MEDIUM -> "中"
        ConfidenceLevel.LOW -> "低"
    }

    Surface(
        modifier = modifier,
        color = color.copy(alpha = 0.15f),
        shape = MaterialTheme.shapes.small
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = color
        )
    }
}
