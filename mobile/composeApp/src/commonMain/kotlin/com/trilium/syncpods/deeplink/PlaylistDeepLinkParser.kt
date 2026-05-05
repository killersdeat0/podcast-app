package com.trilium.syncpods.deeplink

private const val PLAYLIST_URL_PREFIX = "https://syncpods.app/playlist/"

fun parsePlaylistDeepLink(url: String): String? {
    if (!url.startsWith(PLAYLIST_URL_PREFIX)) return null
    val id = url.removePrefix(PLAYLIST_URL_PREFIX).trimEnd('/')
    return if (id.isNotBlank()) "playlist/$id" else null
}
