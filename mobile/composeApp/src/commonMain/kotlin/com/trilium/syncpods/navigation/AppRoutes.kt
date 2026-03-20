package com.trilium.syncpods.navigation

sealed class AppRoutes(val route: String) {
    data object Discover : AppRoutes("discover")
    data object Library : AppRoutes("library")
    data object Queue : AppRoutes("queue")
    data object Profile : AppRoutes("profile")
    data class PodcastDetail(val feedUrl: String) : AppRoutes("podcast/{feedUrl}") {
        companion object {
            const val ROUTE = "podcast/{feedUrl}"
        }
    }
}
