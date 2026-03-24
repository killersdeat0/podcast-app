package com.trilium.syncpods.player

interface AudioPlayer {
    suspend fun play(url: String)
    suspend fun pause()
    suspend fun resume()
    suspend fun stop()
}
