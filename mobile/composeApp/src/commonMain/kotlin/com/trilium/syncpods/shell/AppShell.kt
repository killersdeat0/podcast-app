package com.trilium.syncpods.shell

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.History
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
import com.trilium.syncpods.auth.SignUpScreen
import com.trilium.syncpods.auth.SignUpViewModel
import com.trilium.syncpods.auth.VerifyEmailScreen
import com.trilium.syncpods.auth.VerifyEmailViewModel
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
import com.trilium.syncpods.history.HistoryEvent
import com.trilium.syncpods.history.HistoryScreen
import com.trilium.syncpods.history.HistoryViewModel
import com.trilium.syncpods.queue.QueueScreen
import com.trilium.syncpods.queue.QueueViewModel
import com.trilium.syncpods.search.SearchScreen
import com.trilium.syncpods.search.SearchViewModel
import com.trilium.syncpods.settings.SettingsScreen
import com.trilium.syncpods.settings.SettingsViewModel
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import io.ktor.http.encodeURLPathPart
import org.koin.compose.koinInject
import org.koin.compose.viewmodel.koinViewModel

private data class TabItem(
    val route: String,
    val label: String,
    val visible: Boolean = true,
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
        || currentDestination?.route == AppRoutes.SignUp.route
        || currentDestination?.route == AppRoutes.ForgotPassword.route
        || currentDestination?.route == AppRoutes.VerifyEmail.ROUTE

    val supabaseClient = koinInject<SupabaseClient>()
    val sessionStatus by supabaseClient.auth.sessionStatus.collectAsState()
    val isAuthenticated = sessionStatus is SessionStatus.Authenticated

    val tabs = listOf(
        TabItem(AppRoutes.Discover.route, "Discover") {
            Icon(Icons.Default.Search, contentDescription = "Discover")
        },
        TabItem(AppRoutes.Library.route, "Library") {
            Icon(Icons.Default.Star, contentDescription = "Library")
        },
        TabItem(AppRoutes.Queue.route, "Queue") {
            Icon(Icons.AutoMirrored.Filled.List, contentDescription = "Queue")
        },
        TabItem(AppRoutes.History.route, "History", visible = isAuthenticated) {
            Icon(Icons.Default.History, contentDescription = "History")
        },
        TabItem(AppRoutes.Profile.route, "Profile") {
            Icon(Icons.Default.Person, contentDescription = "Profile")
        },
    )
    LaunchedEffect(Unit) {
        val authScreenRoutes = setOf(
            AppRoutes.Login.route,
            AppRoutes.SignUp.route,
            AppRoutes.ForgotPassword.route,
            AppRoutes.VerifyEmail.ROUTE,
        )
        var previousWasNotAuthenticated = false
        supabaseClient.auth.sessionStatus.collect { status ->
            when (status) {
                is SessionStatus.NotAuthenticated -> previousWasNotAuthenticated = true
                is SessionStatus.Authenticated -> {
                    val currentRoute = navController.currentDestination?.route
                    val isColdStartNewLogin = previousWasNotAuthenticated &&
                        currentRoute == AppRoutes.Discover.route
                    if (currentRoute in authScreenRoutes || isColdStartNewLogin) {
                        navController.navigate(AppRoutes.Profile.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                    previousWasNotAuthenticated = false
                }
                else -> previousWasNotAuthenticated = false
            }
        }
    }

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
                            if (tab.visible) {
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
                    onNavigateToSignIn = { navController.navigate(AppRoutes.Login.route) },
                    onNavigateToCreateAccount = { navController.navigate(AppRoutes.SignUp.route) },
                    modifier = Modifier.padding(top = innerPadding.calculateTopPadding()),
                    bottomContentPadding = innerPadding.calculateBottomPadding(),
                )
            }

            composable(AppRoutes.History.route) {
                val viewModel = koinViewModel<HistoryViewModel>()
                LaunchedEffect(Unit) {
                    viewModel.feature.process(HistoryEvent.ScreenVisible)
                }
                HistoryScreen(
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
                    onSignUp = { navController.navigate(AppRoutes.SignUp.route) },
                )
            }

            composable(AppRoutes.ForgotPassword.route) {
                val viewModel = koinViewModel<ForgotPasswordViewModel>()
                ForgotPasswordScreen(
                    feature = viewModel.feature,
                    onBack = { navController.popBackStack() },
                )
            }

            composable(AppRoutes.SignUp.route) {
                val viewModel = koinViewModel<SignUpViewModel>()
                SignUpScreen(
                    feature = viewModel.feature,
                    onBack = { navController.popBackStack() },
                    onVerifyEmail = { email ->
                        navController.navigate("verify-email/${email.encodeURLPathPart()}")
                    },
                )
            }

            composable(AppRoutes.VerifyEmail.ROUTE) {
                val viewModel = koinViewModel<VerifyEmailViewModel>()
                VerifyEmailScreen(
                    feature = viewModel.feature,
                    onBack = { navController.popBackStack() },
                    onNavigateToHome = {
                        navController.navigate(AppRoutes.Profile.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                )
            }

            composable(AppRoutes.PodcastDetail.ROUTE) {
                val viewModel = koinViewModel<PodcastDetailViewModel>()
                PodcastDetailScreen(
                    feature = viewModel.feature,
                    onBack = { navController.popBackStack() },
                    onPlayEpisode = onPlayEpisode,
                    onNavigateToSignIn = { navController.navigate(AppRoutes.Login.route) },
                    onNavigateToCreateAccount = { navController.navigate(AppRoutes.SignUp.route) },
                    topContentPadding = innerPadding.calculateTopPadding(),
                    bottomContentPadding = innerPadding.calculateBottomPadding(),
                )
            }
        }
    }
}
