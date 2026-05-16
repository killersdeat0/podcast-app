package com.trilium.syncpods.di

import com.trilium.syncpods.billing.BillingHandler
import com.trilium.syncpods.billing.IOSBillingHandler
import com.trilium.syncpods.player.AudioPlayer
import com.trilium.syncpods.player.IOSAudioPlayer
import io.ktor.client.HttpClient
import io.ktor.client.engine.darwin.Darwin
import org.koin.core.module.Module
import org.koin.dsl.module
import platform.Foundation.NSBundle
import platform.Foundation.NSUserDefaults
import kotlin.native.Platform as KNPlatform

object SelectedEnvironment {
    var url: String = ""
    var key: String = ""
}

fun initSelectedEnvironment() {
    val bundle = NSBundle.mainBundle
    val devUrl = bundle.objectForInfoDictionaryKey("SUPABASE_URL") as? String ?: ""
    val devKey = bundle.objectForInfoDictionaryKey("SUPABASE_ANON_KEY") as? String ?: ""
    val prodUrl = bundle.objectForInfoDictionaryKey("PROD_SUPABASE_URL") as? String ?: ""
    val prodKey = bundle.objectForInfoDictionaryKey("PROD_SUPABASE_ANON_KEY") as? String ?: ""

    val userDefaults = NSUserDefaults.standardUserDefaults
    val env = userDefaults.stringForKey("dev_settings_env") ?: "dev"
    val useProd = KNPlatform.isDebugBinary && env == "prod"

    SelectedEnvironment.url = if (useProd) prodUrl else devUrl
    SelectedEnvironment.key = if (useProd) prodKey else devKey
}

actual fun createPlatformHttpClient(): HttpClient = HttpClient(Darwin)

actual val supabaseUrl: String get() = SelectedEnvironment.url
actual val supabaseAnonKey: String get() = SelectedEnvironment.key

actual fun audioPlayerModule(): Module = module {
    single<AudioPlayer> { IOSAudioPlayer() }
}

actual fun billingHandlerModule(): Module = module {
    single<BillingHandler> { IOSBillingHandler() }
}
