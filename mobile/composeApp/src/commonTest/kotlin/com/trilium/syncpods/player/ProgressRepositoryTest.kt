package com.trilium.syncpods.player

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant

class ProgressRepositoryTest {

    // ── computePositionPct ────────────────────────────────────────────────────

    @Test
    fun `computePositionPct returns null when duration is null`() {
        assertNull(computePositionPct(positionSeconds = 60, durationSeconds = null))
    }

    @Test
    fun `computePositionPct returns null when duration is zero`() {
        assertNull(computePositionPct(positionSeconds = 60, durationSeconds = 0))
    }

    @Test
    fun `computePositionPct returns null when duration is negative`() {
        assertNull(computePositionPct(positionSeconds = 60, durationSeconds = -1))
    }

    @Test
    fun `computePositionPct computes percentage correctly`() {
        val pct = computePositionPct(positionSeconds = 1800, durationSeconds = 3600)
        assertEquals(50, pct)
    }

    @Test
    fun `computePositionPct at 98 percent threshold`() {
        val pct = computePositionPct(positionSeconds = 3528, durationSeconds = 3600)
        assertEquals(98, pct)
    }

    @Test
    fun `computePositionPct is capped at 100`() {
        // position exceeds duration (e.g. duration estimate was wrong)
        val pct = computePositionPct(positionSeconds = 4000, durationSeconds = 3600)
        assertEquals(100, pct)
    }

    @Test
    fun `computePositionPct is not negative`() {
        val pct = computePositionPct(positionSeconds = 0, durationSeconds = 3600)
        assertEquals(0, pct)
    }

    // ── computeDeltaSeconds ───────────────────────────────────────────────────

    @Test
    fun `computeDeltaSeconds returns zero on first save`() {
        assertEquals(0, computeDeltaSeconds(lastInstant = null, now = now()))
    }

    @Test
    fun `computeDeltaSeconds returns seconds elapsed since last save`() {
        val last = now()
        val current = last + 8.seconds
        assertEquals(8, computeDeltaSeconds(lastInstant = last, now = current))
    }

    @Test
    fun `computeDeltaSeconds is capped at 15 seconds`() {
        val last = now()
        val current = last + 120.seconds // user was paused for 2 minutes
        assertEquals(15, computeDeltaSeconds(lastInstant = last, now = current))
    }

    @Test
    fun `computeDeltaSeconds is zero when called twice in quick succession`() {
        val last = now()
        val current = last + 0.seconds
        assertEquals(0, computeDeltaSeconds(lastInstant = last, now = current))
    }
}

private fun now(): Instant = Instant.fromEpochSeconds(1_700_000_000L)
