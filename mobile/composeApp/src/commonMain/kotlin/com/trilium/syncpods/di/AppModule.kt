package com.trilium.syncpods.di

import com.trilium.syncpods.createSupabaseClient
import com.trilium.syncpods.discover.DiscoverViewModel
import com.trilium.syncpods.discover.PodcastRepository
import com.trilium.syncpods.discover.PodcastRepositoryImpl
import com.trilium.syncpods.podcastdetail.EpisodeFeedRepository
import com.trilium.syncpods.podcastdetail.EpisodeFeedRepositoryImpl
import com.trilium.syncpods.podcastdetail.PodcastDetailViewModel
import com.trilium.syncpods.podcastdetail.PodcastSummaryCache
import com.trilium.syncpods.podcastdetail.SubscriptionRepository
import com.trilium.syncpods.podcastdetail.SubscriptionRepositoryImpl
import com.trilium.syncpods.queue.QueueRepository
import com.trilium.syncpods.queue.QueueRepositoryImpl
import com.trilium.syncpods.queue.QueueViewModel
import com.trilium.syncpods.search.SearchViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.core.module.dsl.viewModelOf
import org.koin.dsl.module

val appModule = module {
    single { createPlatformHttpClient() }
    single { createSupabaseClient() }
    single { PodcastSummaryCache() }
    single<PodcastRepository> {
        PodcastRepositoryImpl(
            httpClient = get(),
            supabaseUrl = supabaseUrl,
            anonKey = supabaseAnonKey,
        )
    }
    single<EpisodeFeedRepository> {
        EpisodeFeedRepositoryImpl(
            httpClient = get(),
            supabaseUrl = supabaseUrl,
            anonKey = supabaseAnonKey,
        )
    }
    single<SubscriptionRepository> {
        SubscriptionRepositoryImpl(supabaseClient = get())
    }
    single<QueueRepository> { QueueRepositoryImpl(supabaseClient = get()) }
    viewModel { DiscoverViewModel(get(), get()) }
    viewModelOf(::SearchViewModel)
    viewModelOf(::PodcastDetailViewModel)
    viewModelOf(::QueueViewModel)
}
