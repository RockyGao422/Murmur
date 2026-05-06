package com.murmur.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import com.murmur.app.ui.navigation.MurmurNavigation
import com.murmur.app.ui.theme.MurmurTheme

class MainActivity : ComponentActivity() {

    private val requestedRoute = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        requestedRoute.value = routeFromIntent(intent)

        setContent {
            MurmurTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MurmurNavigation(
                        initialRoute = requestedRoute.value,
                        onInitialRouteConsumed = { requestedRoute.value = null }
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        requestedRoute.value = routeFromIntent(intent)
    }

    private fun routeFromIntent(intent: Intent?): String? {
        return when (intent?.getStringExtra("navigate_to")) {
            "inbox" -> "inbox"
            "today" -> "today"
            "stats" -> "stats"
            "tools" -> "tools"
            "settings" -> "settings"
            else -> null
        }
    }
}
