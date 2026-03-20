package com.trilium.syncpods.discover

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.headers
import io.ktor.http.HttpHeaders
import kotlinx.serialization.json.Json

private val json = Json { ignoreUnknownKeys = true }

class PodcastRepositoryImpl(
    private val httpClient: HttpClient,
    private val supabaseUrl: String,
    private val anonKey: String,
) : PodcastRepository {

    override suspend fun searchPodcasts(query: String, genreId: Int?): List<PodcastSummary> {
        val responseBody: String = httpClient.get("$supabaseUrl/functions/v1/podcasts-search") {
            url {
                parameters.append("q", query)
                if (genreId != null && genreId > 0) parameters.append("genreId", genreId.toString())
            }
            headers { append(HttpHeaders.Authorization, "Bearer $anonKey") }
        }.body()
        return json.decodeFromString<ItunesSearchResponse>(responseBody)
            .results
            .mapNotNull { it.toPodcastSummary() }
    }

    override suspend fun fetchTrending(genreId: Int?): List<PodcastSummary> {
        val responseBody: String = httpClient.get("$supabaseUrl/functions/v1/podcasts-trending") {
            url {
                if (genreId != null && genreId > 0) parameters.append("genreId", genreId.toString())
            }
            headers { append(HttpHeaders.Authorization, "Bearer $anonKey") }
        }.body()
        return json.decodeFromString<ItunesSearchResponse>(responseBody)
            .results
            .mapNotNull { it.toPodcastSummary() }
    }
}
