package com.trilium.syncpods.di

import com.trilium.syncpods.BuildConfig
import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android

actual fun createPlatformHttpClient(): HttpClient = HttpClient(Android)

actual val supabaseUrl: String get() = BuildConfig.SUPABASE_URL
actual val supabaseAnonKey: String get() = BuildConfig.SUPABASE_ANON_KEY
