package com.trilium.syncpods.queue

import com.russhwolf.settings.MapSettings
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LocalQueueRepositoryTest {

    private fun makeRepo(settings: MapSettings = MapSettings()) = LocalQueueRepository(settings)

    private suspend fun LocalQueueRepository.addTestEpisode(
        guid: String = "ep1",
        title: String = "Episode 1",
        feedUrl: String = "https://feed.example.com",
        audioUrl: String = "https://audio.example.com/ep1.mp3",
        podcastTitle: String = "Test Podcast",
        artworkUrl: String? = null,
        durationSeconds: Int? = 1800,
    ) = addEpisode(
        guid = guid,
        feedUrl = feedUrl,
        title = title,
        audioUrl = audioUrl,
        durationSeconds = durationSeconds,
        pubDate = null,
        podcastTitle = podcastTitle,
        artworkUrl = artworkUrl,
    )

    @Test
    fun `isGuest returns true`() {
        assertTrue(makeRepo().isGuest())
    }

    @Test
    fun `getUserTier returns free`() = runTest {
        assertEquals("free", makeRepo().getUserTier())
    }

    @Test
    fun `addEpisode stores full QueueItem`() = runTest {
        val repo = makeRepo()
        repo.addTestEpisode(guid = "ep1", title = "My Episode", artworkUrl = "https://art.example.com/img.jpg")
        val items = repo.getQueue()
        assertEquals(1, items.size)
        val item = items[0]
        assertEquals("ep1", item.guid)
        assertEquals("My Episode", item.title)
        assertEquals("https://art.example.com/img.jpg", item.artworkUrl)
        assertEquals(1800, item.durationSeconds)
    }

    @Test
    fun `addEpisode is idempotent for duplicate guid`() = runTest {
        val repo = makeRepo()
        repo.addTestEpisode(guid = "ep1")
        repo.addTestEpisode(guid = "ep1")
        assertEquals(1, repo.getQueue().size)
    }

    @Test
    fun `removeEpisode removes by guid`() = runTest {
        val repo = makeRepo()
        repo.addTestEpisode(guid = "ep1")
        repo.addTestEpisode(guid = "ep2")
        repo.removeEpisode("ep1")
        val items = repo.getQueue()
        assertEquals(1, items.size)
        assertEquals("ep2", items[0].guid)
    }

    @Test
    fun `removeEpisode persists removal`() = runTest {
        val settings = MapSettings()
        val repo1 = makeRepo(settings)
        repo1.addTestEpisode(guid = "ep1")
        repo1.removeEpisode("ep1")
        val repo2 = makeRepo(settings)
        assertTrue(repo2.getQueue().isEmpty())
    }

    @Test
    fun `reorderQueue reorders items and updates position fields`() = runTest {
        val repo = makeRepo()
        repo.addTestEpisode(guid = "ep1")
        repo.addTestEpisode(guid = "ep2")
        repo.addTestEpisode(guid = "ep3")
        repo.reorderQueue(listOf("ep3", "ep1", "ep2"))
        val items = repo.getQueue()
        assertEquals(listOf("ep3", "ep1", "ep2"), items.map { it.guid })
        assertEquals(listOf(0, 1, 2), items.map { it.position })
    }

    @Test
    fun `getQueuedGuids returns guid set`() = runTest {
        val repo = makeRepo()
        repo.addTestEpisode(guid = "ep1")
        repo.addTestEpisode(guid = "ep2")
        assertEquals(setOf("ep1", "ep2"), repo.getQueuedGuids())
    }

    @Test
    fun `queue persists across instance restarts`() = runTest {
        val settings = MapSettings()
        val repo1 = makeRepo(settings)
        repo1.addTestEpisode(guid = "ep1", title = "Persisted Episode")
        val repo2 = makeRepo(settings)
        val items = repo2.getQueue()
        assertEquals(1, items.size)
        assertEquals("ep1", items[0].guid)
        assertEquals("Persisted Episode", items[0].title)
    }

    @Test
    fun `clearLocalQueue empties queue and clears settings`() = runTest {
        val settings = MapSettings()
        val repo1 = makeRepo(settings)
        repo1.addTestEpisode(guid = "ep1")
        repo1.clearLocalQueue()
        assertTrue(repo1.getQueue().isEmpty())
        assertNull(settings.getStringOrNull("guest_queue"))
        val repo2 = makeRepo(settings)
        assertTrue(repo2.getQueue().isEmpty())
    }
}
