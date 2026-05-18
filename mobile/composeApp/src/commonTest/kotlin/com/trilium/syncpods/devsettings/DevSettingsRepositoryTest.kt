package com.trilium.syncpods.devsettings

import kotlin.test.Test
import kotlin.test.assertEquals

private class FakeDevSettingsStorage(private var stored: String? = null) : DevSettingsStorage {
    override fun getEnv(): String? = stored
    override fun putEnvSync(value: String) { stored = value }
}

class DevSettingsRepositoryTest {

    @Test
    fun `getActiveEnvironment returns DEV when nothing saved`() {
        val repo = DevSettingsRepositoryImpl(FakeDevSettingsStorage())
        assertEquals(Environment.DEV, repo.getActiveEnvironment())
    }

    @Test
    fun `getActiveEnvironment returns PROD after saving PROD`() {
        val storage = FakeDevSettingsStorage()
        val repo = DevSettingsRepositoryImpl(storage)
        repo.saveEnvironment(Environment.PROD)
        assertEquals(Environment.PROD, repo.getActiveEnvironment())
    }

    @Test
    fun `getActiveEnvironment returns DEV after saving DEV`() {
        val storage = FakeDevSettingsStorage()
        val repo = DevSettingsRepositoryImpl(storage)
        repo.saveEnvironment(Environment.PROD)
        repo.saveEnvironment(Environment.DEV)
        assertEquals(Environment.DEV, repo.getActiveEnvironment())
    }
}
