package com.trilium.syncpods.player

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import platform.AVFoundation.AVPlayer
import platform.AVFoundation.pause
import platform.AVFoundation.play
import platform.CoreMedia.CMTimeGetSeconds
import platform.Foundation.NSURL

class IOSAudioPlayer : AudioPlayer {

    private var player: AVPlayer? = null

    override suspend fun play(url: String) = withContext(Dispatchers.Main) {
        val nsUrl = NSURL.URLWithString(url) ?: return@withContext
        player = AVPlayer(uRL = nsUrl)
        player?.play()
        Unit
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
        player?.pause()
        player = null
    }

    override suspend fun currentPositionSeconds(): Int = withContext(Dispatchers.Main) {
        val time = player?.currentTime() ?: return@withContext 0
        maxOf(0, CMTimeGetSeconds(time).toInt())
    }

    override suspend fun durationSeconds(): Int? = withContext(Dispatchers.Main) {
        val item = player?.currentItem ?: return@withContext null
        val seconds = CMTimeGetSeconds(item.duration).toInt()
        if (seconds <= 0) null else seconds
    }
}
