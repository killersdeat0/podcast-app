package com.trilium.syncpods.player

import platform.AVFoundation.AVPlayer
import platform.AVFoundation.play
import platform.AVFoundation.pause
import platform.Foundation.NSURL

class IOSAudioPlayer : AudioPlayer {

    private var player: AVPlayer? = null

    override fun play(url: String) {
        val nsUrl = NSURL.URLWithString(url) ?: return
        player = AVPlayer(uRL = nsUrl)
        player?.play()
    }

    override fun pause() {
        player?.pause()
    }

    override fun resume() {
        player?.play()
    }

    override fun stop() {
        player?.pause()
        player = null
    }
}
