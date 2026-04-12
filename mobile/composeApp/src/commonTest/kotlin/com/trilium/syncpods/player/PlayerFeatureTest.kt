package com.trilium.syncpods.player

import app.cash.turbine.test
import com.trilium.syncpods.profile.ProfileRepository
import com.trilium.syncpods.profile.SubscriptionSummary
import com.trilium.syncpods.profile.UserProfile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class PlayerFeatureTest {

    @Test
    fun `10s periodic save fires while playing`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial state

            feature.process(PlayerEvent.Play(testEpisode("ep1")))
            // Wait for isPlaying = true (play fully started, periodic loop running)
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            advanceTimeBy(10_001)

            assertEquals(1, progress.saveCalls.size)
            assertEquals("ep1", progress.saveCalls[0].first.guid)
            assertFalse(progress.saveCalls[0].third) // completed = false

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `periodic save does not fire when position is 5s or less`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 5, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial

            feature.process(PlayerEvent.Play(testEpisode("ep1")))
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            advanceTimeBy(10_001)

            assertEquals(0, progress.saveCalls.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `periodic save fires multiple times every 10s`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial

            feature.process(PlayerEvent.Play(testEpisode("ep1")))
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            advanceTimeBy(30_001)

            assertEquals(3, progress.saveCalls.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `periodic save marks complete at 98 percent and stops further saves`() = runTest {
        // 3528 / 3600 = 98%
        val audio = FakeAudioPlayer(positionSeconds = 3528, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial

            feature.process(PlayerEvent.Play(testEpisode("ep1")))
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            advanceTimeBy(10_001)

            // Completion save fires and hasCompleted flips to true
            s = awaitItem()
            while (!s.hasCompleted) s = awaitItem()

            assertEquals(1, progress.saveCalls.size)
            assertTrue(progress.saveCalls[0].third) // completed = true

            // No more saves after completion
            advanceTimeBy(10_001)
            assertEquals(1, progress.saveCalls.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `switch-away save fires for previous episode when new episode starts`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 120, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial

            feature.process(PlayerEvent.Play(testEpisode("ep1")))
            // Wait for ep1 to be playing
            var s = awaitItem()
            while (s.nowPlaying?.guid != "ep1" || !s.isPlaying) s = awaitItem()

            feature.process(PlayerEvent.Play(testEpisode("ep2")))
            // Wait for ep2 to be playing
            s = awaitItem()
            while (s.nowPlaying?.guid != "ep2") s = awaitItem()

            val switchAwaySave = progress.saveCalls.firstOrNull { it.first.guid == "ep1" }
            assertNotNull(switchAwaySave)
            assertFalse(switchAwaySave.third) // completed = false

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `switch-away save does not fire when position is 5s or less`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 3, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial

            feature.process(PlayerEvent.Play(testEpisode("ep1")))
            var s = awaitItem()
            while (s.nowPlaying?.guid != "ep1" || !s.isPlaying) s = awaitItem()

            feature.process(PlayerEvent.Play(testEpisode("ep2")))
            s = awaitItem()
            while (s.nowPlaying?.guid != "ep2") s = awaitItem()

            val ep1Saves = progress.saveCalls.filter { it.first.guid == "ep1" }
            assertEquals(0, ep1Saves.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `switch-away save does not fire when already completed`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 3528, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial

            // First episode reaches completion
            feature.process(PlayerEvent.Play(testEpisode("ep1")))
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            advanceTimeBy(10_001) // triggers completion save

            // Wait for hasCompleted
            s = awaitItem()
            while (!s.hasCompleted) s = awaitItem()

            val savesBeforeSwitch = progress.saveCalls.size

            // Switch to new episode — should NOT save ep1 again
            feature.process(PlayerEvent.Play(testEpisode("ep2")))
            s = awaitItem()
            while (s.nowPlaying?.guid != "ep2") s = awaitItem()

            val ep1Saves = progress.saveCalls.filter { it.first.guid == "ep1" }
            assertEquals(savesBeforeSwitch, ep1Saves.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `periodic save does not fire when guest`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository(isGuest = true))

        feature.state.test {
            awaitItem() // initial

            feature.process(PlayerEvent.Play(testEpisode("ep1")))
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            advanceTimeBy(10_001)

            assertEquals(0, progress.saveCalls.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `periodic save stops when episode changes`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial

            feature.process(PlayerEvent.Play(testEpisode("ep1")))
            var s = awaitItem()
            while (s.nowPlaying?.guid != "ep1" || !s.isPlaying) s = awaitItem()

            advanceTimeBy(5_000)

            feature.process(PlayerEvent.Play(testEpisode("ep2")))
            s = awaitItem()
            while (s.nowPlaying?.guid != "ep2") s = awaitItem()

            // Capture ep1 save count at switch time (switch-away save may have fired)
            val ep1SavesAtSwitch = progress.saveCalls.count { it.first.guid == "ep1" }

            advanceTimeBy(5_001) // would be 10s for ep1's timer but it's been cancelled

            // No additional ep1 saves after switch — periodic timer was cancelled
            val ep1SavesAfter = progress.saveCalls.count { it.first.guid == "ep1" }
            assertEquals(ep1SavesAtSwitch, ep1SavesAfter)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `immediate save fires on play when positionSeconds is above threshold`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial
            feature.process(PlayerEvent.Play(testEpisode("ep1", positionSeconds = 60)))
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            assertEquals(1, progress.saveCalls.size)
            assertEquals("ep1", progress.saveCalls[0].first.guid)
            assertEquals(60, progress.saveCalls[0].second)
            assertFalse(progress.saveCalls[0].third)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `immediate save does not fire on play when positionSeconds is null`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlayerEvent.Play(testEpisode("ep1"))) // positionSeconds = null
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            assertEquals(0, progress.saveCalls.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `immediate save does not fire on play when positionSeconds is at or below threshold`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 5, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlayerEvent.Play(testEpisode("ep1", positionSeconds = 5)))
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            assertEquals(0, progress.saveCalls.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `immediate play save does not fire for guest`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository(isGuest = true))

        feature.state.test {
            awaitItem()
            feature.process(PlayerEvent.Play(testEpisode("ep1", positionSeconds = 60)))
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            assertEquals(0, progress.saveCalls.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `pause cancels periodic save and resume restarts it`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial

            feature.process(PlayerEvent.Play(testEpisode("ep1")))
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            advanceTimeBy(5_000)
            feature.process(PlayerEvent.PauseToggled) // pause
            s = awaitItem()
            while (s.isPlaying) s = awaitItem() // wait for paused

            // Advance 10s — timer should be cancelled, no saves
            advanceTimeBy(10_001)
            assertEquals(0, progress.saveCalls.size)

            // Resume
            feature.process(PlayerEvent.PauseToggled)
            s = awaitItem()
            while (!s.isPlaying) s = awaitItem() // wait for resumed

            // Advance 10s — immediate save on resume + one periodic save
            advanceTimeBy(10_001)
            assertEquals(2, progress.saveCalls.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `immediate save fires on resume`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlayerEvent.Play(testEpisode("ep1")))
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            feature.process(PlayerEvent.PauseToggled) // pause
            s = awaitItem()
            while (s.isPlaying) s = awaitItem()

            val savesBeforeResume = progress.saveCalls.size

            feature.process(PlayerEvent.PauseToggled) // resume
            s = awaitItem()
            while (!s.isPlaying) s = awaitItem()

            // Immediate save fires on resume without time advance
            assertEquals(savesBeforeResume + 1, progress.saveCalls.size)
            assertEquals("ep1", progress.saveCalls.last().first.guid)
            assertEquals(60, progress.saveCalls.last().second)
            assertFalse(progress.saveCalls.last().third)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `immediate save does not fire on resume when position is at or below threshold`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 5, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlayerEvent.Play(testEpisode("ep1")))
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            feature.process(PlayerEvent.PauseToggled) // pause
            s = awaitItem()
            while (s.isPlaying) s = awaitItem()

            val savesBeforeResume = progress.saveCalls.size

            feature.process(PlayerEvent.PauseToggled) // resume
            s = awaitItem()
            while (!s.isPlaying) s = awaitItem()

            assertEquals(savesBeforeResume, progress.saveCalls.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `immediate resume save does not fire for guest`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository(isGuest = true))

        feature.state.test {
            awaitItem()
            feature.process(PlayerEvent.Play(testEpisode("ep1")))
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            feature.process(PlayerEvent.PauseToggled) // pause
            s = awaitItem()
            while (s.isPlaying) s = awaitItem()

            feature.process(PlayerEvent.PauseToggled) // resume
            s = awaitItem()
            while (!s.isPlaying) s = awaitItem()

            assertEquals(0, progress.saveCalls.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `immediate save does not fire on play when durationSeconds is null`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlayerEvent.Play(testEpisode("ep1", positionSeconds = 60, durationSeconds = null)))
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            assertEquals(0, progress.saveCalls.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `immediate save does not fire on resume when durationSeconds is null`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlayerEvent.Play(testEpisode("ep1", durationSeconds = null)))
            var s = awaitItem()
            while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

            feature.process(PlayerEvent.PauseToggled) // pause
            s = awaitItem()
            while (s.isPlaying) s = awaitItem()

            val savesBeforeResume = progress.saveCalls.size

            feature.process(PlayerEvent.PauseToggled) // resume
            s = awaitItem()
            while (!s.isPlaying) s = awaitItem()

            assertEquals(savesBeforeResume, progress.saveCalls.size)

            cancelAndIgnoreRemainingEvents()
        }
    }
}

// ── Fakes ─────────────────────────────────────────────────────────────────────

private class FakeAudioPlayer(
    private val positionSeconds: Int = 0,
    private val durationSeconds: Int? = null,
) : AudioPlayer {
    override suspend fun play(url: String) {}
    override suspend fun pause() {}
    override suspend fun resume() {}
    override suspend fun stop() {}
    override suspend fun currentPositionSeconds(): Int = positionSeconds
    override suspend fun durationSeconds(): Int? = durationSeconds
}

private class FakeProgressRepository : ProgressRepository {
    // Triple<NowPlaying, positionSeconds, completed>
    val saveCalls = mutableListOf<Triple<NowPlaying, Int, Boolean>>()
    override val progressSaved: SharedFlow<Unit> = MutableSharedFlow()
    override suspend fun saveProgress(nowPlaying: NowPlaying, positionSeconds: Int, completed: Boolean) {
        saveCalls.add(Triple(nowPlaying, positionSeconds, completed))
    }
}

private class FakeProfileRepository(private val isGuest: Boolean = false) : ProfileRepository {
    override fun isGuest(): Boolean = isGuest
    override fun authStateChanges(): Flow<Unit> = emptyFlow()
    override suspend fun getUserProfile(): UserProfile = UserProfile(
        displayName = "Test User",
        email = "test@example.com",
        tier = "free",
    )
    override suspend fun getSubscriptions(): List<SubscriptionSummary> = emptyList()
    override suspend fun getUserTier(): String = "free"
}

// ── Test helpers ──────────────────────────────────────────────────────────────

private fun testEpisode(guid: String, positionSeconds: Int? = null, durationSeconds: Int? = 3600) = NowPlaying(
    guid = guid,
    title = "Episode $guid",
    podcastName = "Test Podcast",
    artworkUrl = "https://art.example.com/cover.jpg",
    audioUrl = "https://audio.example.com/$guid.mp3",
    feedUrl = "https://feed.example.com/rss",
    durationSeconds = durationSeconds,
    positionSeconds = positionSeconds,
)
