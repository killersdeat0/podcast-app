package com.trilium.syncpods.player

interface AudioPlayer {
    fun play(url: String)
    fun pause()
    fun resume()
    fun stop()
}
