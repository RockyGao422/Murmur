package com.murmur.app.ui.navigation

import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.murmur.app.R
import com.murmur.app.ui.completion.CompletionScreen
import com.murmur.app.ui.inbox.InboxScreen
import com.murmur.app.ui.permission.PermissionScreen
import com.murmur.app.ui.settings.SettingsScreen
import com.murmur.app.ui.stats.StatsScreen
import com.murmur.app.ui.today.TodayScreen
import com.murmur.app.ui.tools.ToolDetailScreen
import com.murmur.app.ui.tools.ToolsScreen

sealed class Screen(val route: String, val titleRes: Int, val icon: @Composable () -> Unit) {
    object Today : Screen("today", R.string.nav_today, { Icon(Icons.Default.Today, contentDescription = null) })
    object Inbox : Screen("inbox", R.string.nav_inbox, { Icon(Icons.Default.Inbox, contentDescription = null) })
    object Stats : Screen("stats", R.string.nav_stats, { Icon(Icons.Default.BarChart, contentDescription = null) })
    object Tools : Screen("tools", R.string.nav_tools, { Icon(Icons.Default.Build, contentDescription = null) })
    object Settings : Screen("settings", R.string.nav_settings, { Icon(Icons.Default.Settings, contentDescription = null) })
}

object Routes {
    const val COMPLETION = "completion/{sessionId}"
    const val TOOL_DETAIL = "tool_detail/{toolId}"
    const val PERMISSION = "permission"

    fun completion(sessionId: Long) = "completion/$sessionId"
    fun toolDetail(toolId: String) = "tool_detail/$toolId"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MurmurNavigation() {
    val navController = rememberNavController()
    val context = LocalContext.current

    // Check if usage stats permission is granted — reactive on lifecycle resume
    var hasPermission by remember { mutableStateOf(hasUsageStatsPermission(context)) }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                hasPermission = hasUsageStatsPermission(context)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // If no permission, show permission screen
    if (!hasPermission) {
        Scaffold { innerPadding ->
            PermissionScreen(
                modifier = Modifier.padding(innerPadding)
            )
        }
        return
    }

    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val bottomNavScreens = listOf(
        Screen.Today,
        Screen.Inbox,
        Screen.Stats,
        Screen.Tools,
        Screen.Settings
    )

    val showBottomBar = currentRoute in bottomNavScreens.map { it.route }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    bottomNavScreens.forEach { screen ->
                        NavigationBarItem(
                            icon = screen.icon,
                            label = { Text(stringResource(screen.titleRes)) },
                            selected = currentRoute == screen.route,
                            onClick = {
                                navController.navigate(screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Today.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Screen.Today.route) {
                TodayScreen(
                    onNavigateToCompletion = { sessionId ->
                        navController.navigate(Routes.completion(sessionId))
                    }
                )
            }

            composable(Screen.Inbox.route) {
                InboxScreen(
                    onNavigateToCompletion = { sessionId ->
                        navController.navigate(Routes.completion(sessionId))
                    }
                )
            }

            composable(Routes.COMPLETION,
                arguments = listOf(navArgument("sessionId") { type = NavType.LongType })
            ) { backStackEntry ->
                val sessionId = backStackEntry.arguments?.getLong("sessionId") ?: 0L
                CompletionScreen(
                    sessionId = sessionId,
                    onSaved = {
                        navController.popBackStack()
                    },
                    onCancel = {
                        navController.popBackStack()
                    }
                )
            }

            composable(Screen.Stats.route) {
                StatsScreen()
            }

            composable(Screen.Tools.route) {
                ToolsScreen(
                    onNavigateToToolDetail = { toolId ->
                        navController.navigate(Routes.toolDetail(toolId))
                    }
                )
            }

            composable(Routes.TOOL_DETAIL,
                arguments = listOf(navArgument("toolId") { type = NavType.StringType })
            ) { backStackEntry ->
                val toolId = backStackEntry.arguments?.getString("toolId") ?: ""
                ToolDetailScreen(
                    toolId = toolId,
                    onBack = { navController.popBackStack() }
                )
            }

            composable(Screen.Settings.route) {
                SettingsScreen()
            }
        }
    }
}

fun hasUsageStatsPermission(context: Context): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? android.app.AppOpsManager
    if (appOps != null) {
        val mode = try {
            appOps.checkOpNoThrow(
                android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                context.packageName
            )
        } catch (e: Exception) {
            android.app.AppOpsManager.MODE_DEFAULT
        }
        return mode == android.app.AppOpsManager.MODE_ALLOWED
    }
    return false
}
