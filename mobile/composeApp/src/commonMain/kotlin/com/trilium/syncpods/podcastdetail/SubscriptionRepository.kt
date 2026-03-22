package com.trilium.syncpods.podcastdetail

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

interface SubscriptionRepository {
    suspend fun isFollowing(feedUrl: String): Boolean
    suspend fun follow(feedUrl: String, title: String, artworkUrl: String, collectionId: Long): Unit
    suspend fun unfollow(feedUrl: String): Unit
}

@Serializable
private data class SubscriptionRow(
    @SerialName("feed_url") val feedUrl: String,
)

@Serializable
private data class SubscriptionInsert(
    @SerialName("feed_url") val feedUrl: String,
    val title: String,
    @SerialName("artwork_url") val artworkUrl: String,
    @SerialName("collection_id") val collectionId: String,
)

class SubscriptionRepositoryImpl(
    private val supabaseClient: SupabaseClient,
) : SubscriptionRepository {

    override suspend fun isFollowing(feedUrl: String): Boolean {
        val rows = supabaseClient.from("subscriptions").select {
            filter { eq("feed_url", feedUrl) }
            limit(1)
        }.decodeList<SubscriptionRow>()
        return rows.isNotEmpty()
    }

    override suspend fun follow(
        feedUrl: String,
        title: String,
        artworkUrl: String,
        collectionId: Long,
    ) {
        supabaseClient.from("subscriptions").upsert(
            SubscriptionInsert(
                feedUrl = feedUrl,
                title = title,
                artworkUrl = artworkUrl,
                collectionId = collectionId.toString(),
            )
        ) {
            onConflict = "user_id,feed_url"
        }
    }

    override suspend fun unfollow(feedUrl: String) {
        supabaseClient.from("subscriptions").delete {
            filter { eq("feed_url", feedUrl) }
        }
    }
}
