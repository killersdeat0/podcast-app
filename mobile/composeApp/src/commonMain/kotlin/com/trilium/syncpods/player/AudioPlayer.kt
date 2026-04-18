package com.trilium.syncpods.player

interface AudioPlayer {
    suspend fun play(url: String)
    suspend fun pause()
    suspend fun resume()
    suspend fun stop()
    suspend fun currentPositionSeconds(): Int
    suspend fun durationSeconds(): Int?
}
