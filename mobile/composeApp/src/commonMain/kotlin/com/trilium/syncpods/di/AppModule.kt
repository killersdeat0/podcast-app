package com.trilium.syncpods.di

import com.trilium.syncpods.discover.DiscoverViewModel
import com.trilium.syncpods.discover.PodcastRepository
import com.trilium.syncpods.discover.PodcastRepositoryImpl
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val appModule = module {
    single { createPlatformHttpClient() }
    single<PodcastRepository> {
        PodcastRepositoryImpl(
            httpClient = get(),
            supabaseUrl = supabaseUrl,
            anonKey = supabaseAnonKey,
        )
    }
    viewModel { DiscoverViewModel(get()) }
}
