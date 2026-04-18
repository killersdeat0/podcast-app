package com.trilium.syncpods.profile

data class UserProfile(
    val displayName: String,
    val email: String,
    val tier: String,
)

data class SubscriptionSummary(
    val feedUrl: String,
    val title: String,
    val artworkUrl: String,
)
