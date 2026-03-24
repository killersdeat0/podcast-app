package com.trilium.syncpods.player

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer

class AndroidAudioPlayer(private val context: Context) : AudioPlayer {

    private var player: ExoPlayer? = null

    override fun play(url: String) {
        player?.release()
        val exo = ExoPlayer.Builder(context).build().also { player = it }
        exo.setMediaItem(MediaItem.fromUri(url))
        exo.prepare()
        exo.play()
    }

    override fun pause() {
        player?.pause()
    }

    override fun resume() {
        player?.play()
    }

    override fun stop() {
        player?.stop()
        player?.release()
        player = null
    }
}
