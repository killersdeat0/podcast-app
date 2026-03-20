package com.trilium.syncpods.shell

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.trilium.syncpods.discover.DiscoverEvent
import com.trilium.syncpods.discover.DiscoverFeature
import com.trilium.syncpods.discover.DiscoverScreen
import com.trilium.syncpods.discover.PodcastRepository
import com.trilium.syncpods.navigation.AppRoutes
import com.trilium.syncpods.player.MiniPlayerBar
import com.trilium.syncpods.player.NowPlayingStub
import org.koin.compose.koinInject

private data class TabItem(
    val route: String,
    val label: String,
    val icon: @Composable () -> Unit,
)

@Composable
fun AppShell() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    val tabs = listOf(
        TabItem(AppRoutes.Discover.route, "Discover") {
            Icon(Icons.Default.Search, contentDescription = "Discover")
        },
        TabItem(AppRoutes.Library.route, "Library") {
            Icon(Icons.Default.Star, contentDescription = "Library")
        },
        TabItem(AppRoutes.Queue.route, "Queue") {
            Icon(Icons.Default.List, contentDescription = "Queue")
        },
        TabItem(AppRoutes.Profile.route, "Profile") {
            Icon(Icons.Default.Person, contentDescription = "Profile")
        },
    )

    // Stub now-playing state — replaced when PlayerFeature is implemented
    val nowPlaying = remember { mutableStateOf<NowPlayingStub?>(null) }

    Scaffold(
        bottomBar = {
            Column {
                MiniPlayerBar(
                    nowPlaying = nowPlaying.value,
                    onPlayPauseClick = { /* stub */ },
                    onBarClick = { /* stub: navigate to full player */ },
                )
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = currentDestination?.hierarchy?.any { it.route == tab.route } == true,
                            onClick = {
                                navController.navigate(tab.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = tab.icon,
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = AppRoutes.Discover.route,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            composable(AppRoutes.Discover.route) {
                val repository: PodcastRepository = koinInject()
                val scope = rememberCoroutineScope()
                val feature = remember(scope) { DiscoverFeature(scope, repository) }
                DiscoverScreen(
                    feature = feature,
                    onNavigateToPodcast = { feedUrl ->
                        navController.navigate("podcast/$feedUrl")
                    },
                )
            }

            composable(AppRoutes.Library.route) {
                Box(modifier = Modifier.fillMaxSize()) {
                    Text("Library — coming soon")
                }
            }

            composable(AppRoutes.Queue.route) {
                Box(modifier = Modifier.fillMaxSize()) {
                    Text("Queue — coming soon")
                }
            }

            composable(AppRoutes.Profile.route) {
                Box(modifier = Modifier.fillMaxSize()) {
                    Text("Profile — coming soon")
                }
            }

            composable(AppRoutes.PodcastDetail.ROUTE) {
                Box(modifier = Modifier.fillMaxSize()) {
                    Text("Podcast Detail — coming soon")
                }
            }
        }
    }
}
