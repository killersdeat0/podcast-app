package com.trilium.syncpods.di

import com.trilium.syncpods.BuildConfig
import com.trilium.syncpods.player.AndroidAudioPlayer
import com.trilium.syncpods.player.AudioPlayer
import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.Module
import org.koin.dsl.module

actual fun createPlatformHttpClient(): HttpClient = HttpClient(Android)

actual val supabaseUrl: String get() = BuildConfig.SUPABASE_URL
actual val supabaseAnonKey: String get() = BuildConfig.SUPABASE_ANON_KEY

actual fun audioPlayerModule(): Module = module {
    single<AudioPlayer> { AndroidAudioPlayer(androidContext()) }
}
