package com.trilium.syncpods.di

import io.ktor.client.HttpClient
import io.ktor.client.engine.darwin.Darwin
import platform.Foundation.NSBundle

actual fun createPlatformHttpClient(): HttpClient = HttpClient(Darwin)

actual val supabaseUrl: String
    get() = NSBundle.mainBundle.objectForInfoDictionaryKey("SUPABASE_URL") as? String ?: ""

actual val supabaseAnonKey: String
    get() = NSBundle.mainBundle.objectForInfoDictionaryKey("SUPABASE_ANON_KEY") as? String ?: ""
