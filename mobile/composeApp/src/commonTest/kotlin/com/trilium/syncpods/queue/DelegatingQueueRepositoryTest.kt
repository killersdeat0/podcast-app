package com.trilium.syncpods.queue

import com.russhwolf.settings.MapSettings
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class DelegatingQueueRepositoryTest {

    private fun makeLocal(settings: MapSettings = MapSettings()) = LocalQueueRepository(settings)

    private suspend fun LocalQueueRepository.addTestEpisode(guid: String) = addEpisode(
        guid = guid,
        feedUrl = "https://feed.example.com",
        title = "Episode $guid",
        audioUrl = "https://audio.example.com/$guid.mp3",
        durationSeconds = 1800,
        pubDate = null,
        podcastTitle = "Test Podcast",
        artworkUrl = null,
    )

    @Test
    fun `isGuest reflects isGuestProvider`() = runTest {
        val local = makeLocal()
        val remote = FakeRemoteQueueRepository()
        val onSignIn = MutableSharedFlow<Unit>()
        val guestRepo = DelegatingQueueRepository(
            local = local, remote = remote, isGuestProvider = { true },
            scope = backgroundScope, onSignIn = onSignIn,
        )
        val authRepo = DelegatingQueueRepository(
            local = local, remote = remote, isGuestProvider = { false },
            scope = backgroundScope, onSignIn = onSignIn,
        )
        assertTrue(guestRepo.isGuest())
        assertFalse(authRepo.isGuest())
    }

    @Test
    fun `routes getQueue to local when guest`() = runTest {
        val local = makeLocal()
        val remote = FakeRemoteQueueRepository(items = listOf(
            QueueItem("remote-ep", "https://feed.example.com", 0, "Remote", "Podcast", null,
                "https://audio.example.com/remote.mp3", null)
        ))
        local.addTestEpisode("local-ep")
        val repo = DelegatingQueueRepository(
            local = local, remote = remote, isGuestProvider = { true },
            scope = backgroundScope, onSignIn = MutableSharedFlow(),
        )
        val items = repo.getQueue()
        assertEquals(1, items.size)
        assertEquals("local-ep", items[0].guid)
    }

    @Test
    fun `routes getQueue to remote when authenticated`() = runTest {
        val local = makeLocal()
        val remote = FakeRemoteQueueRepository(items = listOf(
            QueueItem("remote-ep", "https://feed.example.com", 0, "Remote", "Podcast", null,
                "https://audio.example.com/remote.mp3", null)
        ))
        local.addTestEpisode("local-ep")
        val repo = DelegatingQueueRepository(
            local = local, remote = remote, isGuestProvider = { false },
            scope = backgroundScope, onSignIn = MutableSharedFlow(),
        )
        val items = repo.getQueue()
        assertEquals(1, items.size)
        assertEquals("remote-ep", items[0].guid)
    }

    @Test
    fun `migrates local queue to remote on sign-in`() = runTest(UnconfinedTestDispatcher()) {
        val local = makeLocal()
        val remote = FakeRemoteQueueRepository()
        val onSignIn = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        local.addTestEpisode("ep1")
        local.addTestEpisode("ep2")
        DelegatingQueueRepository(
            local = local, remote = remote, isGuestProvider = { false },
            scope = backgroundScope, onSignIn = onSignIn,
        )
        onSignIn.emit(Unit)
        assertEquals(setOf("ep1", "ep2"), remote.addedGuids.toSet())
        assertTrue(local.getQueue().isEmpty())
    }

    @Test
    fun `does not migrate when local queue is empty on sign-in`() = runTest(UnconfinedTestDispatcher()) {
        val local = makeLocal()
        val remote = FakeRemoteQueueRepository()
        val onSignIn = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        DelegatingQueueRepository(
            local = local, remote = remote, isGuestProvider = { false },
            scope = backgroundScope, onSignIn = onSignIn,
        )
        onSignIn.emit(Unit)
        assertTrue(remote.addedGuids.isEmpty())
    }

    @Test
    fun `sign-in signal not emitted means no migration`() = runTest {
        val local = makeLocal()
        local.addTestEpisode("ep1")
        val remote = FakeRemoteQueueRepository()
        DelegatingQueueRepository(
            local = local, remote = remote, isGuestProvider = { true },
            scope = backgroundScope, onSignIn = MutableSharedFlow(),
        )
        advanceUntilIdle()
        assertTrue(remote.addedGuids.isEmpty())
        assertEquals(1, local.getQueue().size)
    }
}

private class FakeRemoteQueueRepository(
    private val items: List<QueueItem> = emptyList(),
) : QueueRepository {
    val addedGuids = mutableListOf<String>()

    override fun isGuest() = false
    override suspend fun getQueue() = items
    override suspend fun getQueuedGuids() = items.map { it.guid }.toSet()
    override suspend fun addEpisode(
        guid: String, feedUrl: String, title: String, audioUrl: String,
        durationSeconds: Int?, pubDate: String?, podcastTitle: String, artworkUrl: String?,
    ) { addedGuids.add(guid) }
    override suspend fun removeEpisode(guid: String) {}
    override suspend fun reorderQueue(orderedGuids: List<String>) {}
}
