package com.trilium.syncpods.devsettings

import com.russhwolf.settings.MapSettings
import kotlin.test.Test
import kotlin.test.assertEquals

class DevSettingsRepositoryTest {

    @Test
    fun `getActiveEnvironment returns DEV when nothing saved`() {
        val repo = DevSettingsRepositoryImpl(MapSettings())
        assertEquals(Environment.DEV, repo.getActiveEnvironment())
    }

    @Test
    fun `getActiveEnvironment returns PROD after saving PROD`() {
        val settings = MapSettings()
        val repo = DevSettingsRepositoryImpl(settings)
        repo.saveEnvironment(Environment.PROD)
        assertEquals(Environment.PROD, repo.getActiveEnvironment())
    }

    @Test
    fun `getActiveEnvironment returns DEV after saving DEV`() {
        val settings = MapSettings()
        val repo = DevSettingsRepositoryImpl(settings)
        repo.saveEnvironment(Environment.PROD)
        repo.saveEnvironment(Environment.DEV)
        assertEquals(Environment.DEV, repo.getActiveEnvironment())
    }
}
