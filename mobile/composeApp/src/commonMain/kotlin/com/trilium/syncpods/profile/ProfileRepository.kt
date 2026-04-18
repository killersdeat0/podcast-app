package com.trilium.syncpods.profile

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

interface ProfileRepository {
    fun isGuest(): Boolean
    fun authStateChanges(): Flow<Unit>
    suspend fun getUserProfile(): UserProfile
    suspend fun getSubscriptions(): List<SubscriptionSummary>
    suspend fun getUserTier(): String
}

@Serializable
private data class UserProfileRow(
    @SerialName("tier") val tier: String,
)

@Serializable
private data class SubscriptionRow(
    @SerialName("feed_url") val feedUrl: String,
    val title: String,
    @SerialName("artwork_url") val artworkUrl: String = "",
)

class ProfileRepositoryImpl(
    private val supabaseClient: SupabaseClient,
) : ProfileRepository {

    override fun isGuest(): Boolean = supabaseClient.auth.currentUserOrNull() == null

    override fun authStateChanges(): Flow<Unit> =
        supabaseClient.auth.sessionStatus
            .drop(1) // skip initial emission — ScreenVisible handles initial load
            .map { }

    override suspend fun getUserTier(): String {
        if (isGuest()) return "free"
        return try {
            val rows = supabaseClient.from("user_profiles").select {
                limit(1)
            }.decodeList<UserProfileRow>()
            rows.firstOrNull()?.tier ?: "free"
        } catch (_: Exception) {
            "free"
        }
    }

    override suspend fun getUserProfile(): UserProfile {
        val user = supabaseClient.auth.currentUserOrNull()
        val email = user?.email ?: ""
        val displayName = user?.userMetadata
            ?.get("full_name")
            ?.jsonPrimitive
            ?.contentOrNull
            ?: email.substringBefore("@").ifEmpty { "User" }
        val tier = getUserTier()
        return UserProfile(displayName = displayName, email = email, tier = tier)
    }

    override suspend fun getSubscriptions(): List<SubscriptionSummary> {
        return try {
            supabaseClient.from("subscriptions")
                .select(Columns.list("feed_url", "title", "artwork_url"))
                .decodeList<SubscriptionRow>()
                .map { SubscriptionSummary(feedUrl = it.feedUrl, title = it.title, artworkUrl = it.artworkUrl) }
        } catch (_: Exception) {
            emptyList()
        }
    }
}
