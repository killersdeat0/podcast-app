package com.trilium.syncpods.player

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AndroidAudioPlayer(private val context: Context) : AudioPlayer {

    private var player: ExoPlayer? = null

    override suspend fun play(url: String) = withContext(Dispatchers.Main) {
        player?.release()
        val exo = ExoPlayer.Builder(context).build().also { player = it }
        exo.setMediaItem(MediaItem.fromUri(url))
        exo.prepare()
        exo.play()
    }

    override suspend fun pause() = withContext(Dispatchers.Main) {
        player?.pause()
        Unit
    }

    override suspend fun resume() = withContext(Dispatchers.Main) {
        player?.play()
        Unit
    }

    override suspend fun stop() = withContext(Dispatchers.Main) {
        player?.stop()
        player?.release()
        player = null
    }

    override suspend fun currentPositionSeconds(): Int = withContext(Dispatchers.Main) {
        ((player?.currentPosition ?: 0L) / 1000L).toInt()
    }

    override suspend fun durationSeconds(): Int? = withContext(Dispatchers.Main) {
        val ms = player?.duration ?: return@withContext null
        if (ms <= 0L) null else (ms / 1000L).toInt()
    }
}
