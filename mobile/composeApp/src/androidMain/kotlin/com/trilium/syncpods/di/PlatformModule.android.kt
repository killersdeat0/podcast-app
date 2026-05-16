package com.trilium.syncpods.di

import com.trilium.syncpods.BuildConfig
import com.trilium.syncpods.SelectedEnvironment
import com.trilium.syncpods.billing.AndroidBillingHandler
import com.trilium.syncpods.billing.BillingHandler
import com.trilium.syncpods.player.AndroidAudioPlayer
import com.trilium.syncpods.player.AudioPlayer
import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.Module
import org.koin.dsl.module

actual fun createPlatformHttpClient(): HttpClient = HttpClient(Android)

actual val supabaseUrl: String get() = SelectedEnvironment.url
actual val supabaseAnonKey: String get() = SelectedEnvironment.key

actual fun audioPlayerModule(): Module = module {
    single<AudioPlayer> { AndroidAudioPlayer(androidContext()) }
}

actual fun billingHandlerModule(): Module = module {
    single<BillingHandler> { AndroidBillingHandler(androidContext()) }
}
