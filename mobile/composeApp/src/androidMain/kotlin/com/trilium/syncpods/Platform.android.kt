package com.trilium.syncpods

import android.os.Build

class AndroidPlatform : Platform {
    override val name: String = "Android ${Build.VERSION.SDK_INT}"
}

actual fun getPlatform(): Platform = AndroidPlatform()

actual val isDebug: Boolean get() = BuildConfig.DEBUG

object SelectedEnvironment {
    var url: String = if (BuildConfig.DEBUG) BuildConfig.DEV_SUPABASE_URL else BuildConfig.PROD_SUPABASE_URL
    var key: String = if (BuildConfig.DEBUG) BuildConfig.DEV_SUPABASE_ANON_KEY else BuildConfig.PROD_SUPABASE_ANON_KEY
}