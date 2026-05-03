package com.murmur.app.ui.components

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Platform indicator badge showing the source platform.
 */
@Composable
fun PlatformBadge(
    platform: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        shape = MaterialTheme.shapes.small
    ) {
        Icon(
            imageVector = Icons.Default.PhoneAndroid,
            contentDescription = platform,
            modifier = Modifier.padding(4.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
