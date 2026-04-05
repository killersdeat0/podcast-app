package com.trilium.syncpods.shell

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.trilium.syncpods.auth.ForgotPasswordScreen
import com.trilium.syncpods.auth.ForgotPasswordViewModel
import com.trilium.syncpods.auth.LoginScreen
import com.trilium.syncpods.auth.LoginViewModel
import com.trilium.syncpods.discover.DiscoverScreen
import com.trilium.syncpods.discover.DiscoverViewModel
import com.trilium.syncpods.navigation.AppRoutes
import com.trilium.syncpods.player.MiniPlayerBar
import com.trilium.syncpods.player.PlayerEvent
import com.trilium.syncpods.player.PlayerViewModel
import com.trilium.syncpods.podcastdetail.PodcastDetailScreen
import com.trilium.syncpods.podcastdetail.PodcastDetailViewModel
import com.trilium.syncpods.profile.ProfileEvent
import com.trilium.syncpods.profile.ProfileScreen
import com.trilium.syncpods.profile.ProfileViewModel
import com.trilium.syncpods.queue.QueueScreen
import com.trilium.syncpods.queue.QueueViewModel
import com.trilium.syncpods.search.SearchScreen
import com.trilium.syncpods.search.SearchViewModel
import com.trilium.syncpods.settings.SettingsScreen
import com.trilium.syncpods.settings.SettingsViewModel
import io.ktor.http.encodeURLPathPart
import org.koin.compose.viewmodel.koinViewModel

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

    val isFullScreenRoute = currentDestination?.route == AppRoutes.Search.ROUTE
        || currentDestination?.route == AppRoutes.PodcastDetail.ROUTE
        || currentDestination?.route == AppRoutes.Settings.route
        || currentDestination?.route == AppRoutes.Login.route

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

    val playerViewModel = koinViewModel<PlayerViewModel>()
    val playerState by playerViewModel.feature.state.collectAsState()

    val onPlayEpisode = { nowPlaying: com.trilium.syncpods.player.NowPlaying ->
        playerViewModel.feature.process(PlayerEvent.Play(nowPlaying))
    }

    Scaffold(
        bottomBar = {
            Column {
                MiniPlayerBar(
                    nowPlaying = playerState.nowPlaying,
                    isPlaying = playerState.isPlaying,
                    onPlayPauseClick = { playerViewModel.feature.process(PlayerEvent.PauseToggled) },
                    onBarClick = { /* full-screen player: future phase */ },
                )
                AnimatedVisibility(
                    visible = !isFullScreenRoute,
                    enter = expandVertically(),
                    exit = shrinkVertically(),
                ) {
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
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = AppRoutes.Discover.route,
            modifier = Modifier.fillMaxSize(),
        ) {
            composable(AppRoutes.Discover.route) {
                val viewModel = koinViewModel<DiscoverViewModel>()
                DiscoverScreen(
                    feature = viewModel.feature,
                    onNavigateToPodcast = { feedUrl ->
                        navController.navigate("podcast/${feedUrl.encodeURLPathPart()}")
                    },
                    onNavigateToSearch = { query ->
                        navController.navigate("search/$query")
                    },
                    modifier = Modifier.padding(top = innerPadding.calculateTopPadding()),
                    bottomContentPadding = innerPadding.calculateBottomPadding(),
                )
            }

            composable(AppRoutes.Search.ROUTE) {
                val viewModel = koinViewModel<SearchViewModel>()
                SearchScreen(
                    feature = viewModel.feature,
                    onBack = { navController.popBackStack() },
                    onNavigateToPodcast = { feedUrl ->
                        navController.navigate("podcast/${feedUrl.encodeURLPathPart()}")
                    },
                )
            }

            composable(AppRoutes.Library.route) {
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
                    Text("Library — coming soon")
                }
            }

            composable(AppRoutes.Queue.route) {
                val viewModel = koinViewModel<QueueViewModel>()
                QueueScreen(
                    feature = viewModel.feature,
                    onPlayEpisode = onPlayEpisode,
                    modifier = Modifier.padding(top = innerPadding.calculateTopPadding()),
                    bottomContentPadding = innerPadding.calculateBottomPadding(),
                )
            }

            composable(AppRoutes.Profile.route) {
                val viewModel = koinViewModel<ProfileViewModel>()
                val lifecycleOwner = LocalLifecycleOwner.current
                LaunchedEffect(lifecycleOwner) {
                    lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                        viewModel.feature.process(ProfileEvent.ScreenVisible)
                    }
                }
                ProfileScreen(
                    feature = viewModel.feature,
                    onNavigateToPodcast = { feedUrl ->
                        navController.navigate("podcast/${feedUrl.encodeURLPathPart()}")
                    },
                    onNavigateToSettings = {
                        navController.navigate(AppRoutes.Settings.route)
                    },
                    onNavigateToSignIn = { navController.navigate(AppRoutes.Login.route) },
                    modifier = Modifier.padding(top = innerPadding.calculateTopPadding()),
                    bottomContentPadding = innerPadding.calculateBottomPadding(),
                )
            }

            composable(AppRoutes.Settings.route) {
                val settingsViewModel = koinViewModel<SettingsViewModel>()
                SettingsScreen(
                    feature = settingsViewModel.feature,
                    onBack = { navController.popBackStack() },
                    onSignedOut = {
                        navController.popBackStack()
                        navController.navigate(AppRoutes.Profile.route) {
                            launchSingleTop = true
                            restoreState = false
                        }
                    },
                )
            }

            composable(AppRoutes.Login.route) {
                val viewModel = koinViewModel<LoginViewModel>()
                LoginScreen(
                    feature = viewModel.feature,
                    onBack = { navController.popBackStack() },
                    onForgotPassword = { navController.navigate(AppRoutes.ForgotPassword.route) },
                )
            }

            composable(AppRoutes.ForgotPassword.route) {
                val viewModel = koinViewModel<ForgotPasswordViewModel>()
                ForgotPasswordScreen(
                    feature = viewModel.feature,
                    onBack = { navController.popBackStack() },
                )
            }

            composable(AppRoutes.PodcastDetail.ROUTE) {
                val viewModel = koinViewModel<PodcastDetailViewModel>()
                PodcastDetailScreen(
                    feature = viewModel.feature,
                    onBack = { navController.popBackStack() },
                    onPlayEpisode = onPlayEpisode,
                    onNavigateToSignIn = { /* stub: sign-in screen not yet implemented */ },
                    onNavigateToCreateAccount = { /* stub: create-account screen not yet implemented */ },
                    topContentPadding = innerPadding.calculateTopPadding(),
                    bottomContentPadding = innerPadding.calculateBottomPadding(),
                )
            }
        }
    }
}
