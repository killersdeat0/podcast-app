package com.trilium.syncpods.di

import io.ktor.client.HttpClient
import org.koin.core.module.Module

expect fun createPlatformHttpClient(): HttpClient

expect val supabaseUrl: String
expect val supabaseAnonKey: String

expect fun audioPlayerModule(): Module

expect fun billingHandlerModule(): Module

expect fun devSettingsStorageModule(): Module
