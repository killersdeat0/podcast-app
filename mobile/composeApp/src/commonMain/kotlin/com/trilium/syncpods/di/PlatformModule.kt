package com.trilium.syncpods.di

import io.ktor.client.HttpClient

expect fun createPlatformHttpClient(): HttpClient

expect val supabaseUrl: String
expect val supabaseAnonKey: String
