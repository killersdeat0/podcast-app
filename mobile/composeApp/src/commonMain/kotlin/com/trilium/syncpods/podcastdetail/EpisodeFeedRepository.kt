package com.trilium.syncpods.podcastdetail

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.headers
import io.ktor.http.HttpHeaders
import kotlinx.serialization.json.Json

interface EpisodeFeedRepository {
    suspend fun fetchFeed(feedUrl: String): PodcastFeedResponse
}

private val json = Json { ignoreUnknownKeys = true }

class EpisodeFeedRepositoryImpl(
    private val httpClient: HttpClient,
    private val supabaseUrl: String,
    private val anonKey: String,
) : EpisodeFeedRepository {

    override suspend fun fetchFeed(feedUrl: String): PodcastFeedResponse {
        val responseBody: String = httpClient.get("$supabaseUrl/functions/v1/podcasts-feed") {
            url { parameters.append("url", feedUrl) }
            headers { append(HttpHeaders.Authorization, "Bearer $anonKey") }
        }.body()
        return json.decodeFromString(responseBody)
    }
}
