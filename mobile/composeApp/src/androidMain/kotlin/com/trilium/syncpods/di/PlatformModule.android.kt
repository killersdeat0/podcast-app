package com.trilium.syncpods.di

import android.content.Context
import com.trilium.syncpods.BuildConfig
import com.trilium.syncpods.SelectedEnvironment
import com.trilium.syncpods.billing.AndroidBillingHandler
import com.trilium.syncpods.billing.BillingHandler
import com.trilium.syncpods.devsettings.DEV_SETTINGS_ENV_KEY
import com.trilium.syncpods.devsettings.DevSettingsStorage
import com.trilium.syncpods.player.AndroidAudioPlayer
import com.trilium.syncpods.player.AudioPlayer
import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.Module
import org.koin.dsl.module

private class AndroidDevSettingsStorage(private val context: Context) : DevSettingsStorage {
    private val prefs get() = context.getSharedPreferences(
        "${context.packageName}_preferences",
        Context.MODE_PRIVATE,
    )
    override fun getEnv(): String? = prefs.getString(DEV_SETTINGS_ENV_KEY, null)
    override fun putEnvSync(value: String) {
        prefs.edit().putString(DEV_SETTINGS_ENV_KEY, value).commit()
    }
}

actual fun createPlatformHttpClient(): HttpClient = HttpClient(Android)

actual val supabaseUrl: String get() = SelectedEnvironment.url
actual val supabaseAnonKey: String get() = SelectedEnvironment.key

actual fun audioPlayerModule(): Module = module {
    single<AudioPlayer> { AndroidAudioPlayer(androidContext()) }
}

actual fun billingHandlerModule(): Module = module {
    single<BillingHandler> { AndroidBillingHandler(androidContext()) }
}

actual fun devSettingsStorageModule(): Module = module {
    single<DevSettingsStorage> { AndroidDevSettingsStorage(androidContext()) }
}
