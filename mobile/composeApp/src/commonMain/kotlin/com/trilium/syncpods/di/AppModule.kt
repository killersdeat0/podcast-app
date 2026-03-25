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
import com.trilium.syncpods.profile.ProfileRepository
import com.trilium.syncpods.profile.ProfileRepositoryImpl
import com.trilium.syncpods.profile.ProfileViewModel
import com.trilium.syncpods.player.AudioPlayer
import com.trilium.syncpods.player.PlayerViewModel
import com.russhwolf.settings.Settings
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.map
import com.trilium.syncpods.queue.DelegatingQueueRepository
import com.trilium.syncpods.queue.LocalQueueRepository
import com.trilium.syncpods.queue.QueueRepository
import com.trilium.syncpods.queue.SupabaseQueueRepository
import com.trilium.syncpods.queue.QueueViewModel
import com.trilium.syncpods.search.SearchViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.koin.core.module.dsl.viewModel
import org.koin.core.module.dsl.viewModelOf
import org.koin.dsl.module

val appModule = module {
    includes(audioPlayerModule())
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
    single<ProfileRepository> {
        ProfileRepositoryImpl(supabaseClient = get())
    }
    single { CoroutineScope(SupervisorJob() + Dispatchers.Default) }
    single { Settings() }
    single { LocalQueueRepository(settings = get()) }
    single<QueueRepository> {
        val client = get<SupabaseClient>()
        DelegatingQueueRepository(
            local = get(),
            remote = SupabaseQueueRepository(client),
            isGuestProvider = { client.auth.currentUserOrNull() == null },
            scope = get(),
            onSignIn = client.auth.sessionStatus
                .filterIsInstance<SessionStatus.Authenticated>()
                .map { },
        )
    }
    viewModel { DiscoverViewModel(get(), get()) }
    viewModelOf(::SearchViewModel)
    viewModel { PodcastDetailViewModel(get(), get(), get(), get(), get(), get()) }
    viewModel { QueueViewModel(get(), get()) }
    viewModelOf(::ProfileViewModel)
    viewModel { PlayerViewModel(get<AudioPlayer>()) }
}
