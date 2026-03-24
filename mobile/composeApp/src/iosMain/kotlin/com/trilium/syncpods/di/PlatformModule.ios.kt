package com.trilium.syncpods.di

import com.trilium.syncpods.player.AudioPlayer
import com.trilium.syncpods.player.IOSAudioPlayer
import io.ktor.client.HttpClient
import io.ktor.client.engine.darwin.Darwin
import org.koin.core.module.Module
import org.koin.dsl.module
import platform.Foundation.NSBundle

actual fun createPlatformHttpClient(): HttpClient = HttpClient(Darwin)

actual val supabaseUrl: String
    get() = NSBundle.mainBundle.objectForInfoDictionaryKey("SUPABASE_URL") as? String ?: ""

actual val supabaseAnonKey: String
    get() = NSBundle.mainBundle.objectForInfoDictionaryKey("SUPABASE_ANON_KEY") as? String ?: ""

actual fun audioPlayerModule(): Module = module {
    single<AudioPlayer> { IOSAudioPlayer() }
}
