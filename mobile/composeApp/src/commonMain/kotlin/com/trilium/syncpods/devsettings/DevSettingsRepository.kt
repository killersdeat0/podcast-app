package com.trilium.syncpods.devsettings

import com.russhwolf.settings.Settings

enum class Environment(val displayName: String, val host: String) {
    DEV("Development", "nuvadoybccdqipyhdhns.supabase.co"),
    PROD("Production", "dqqybduklxwxtcahqswh.supabase.co"),
}

interface DevSettingsRepository {
    fun getActiveEnvironment(): Environment
    fun saveEnvironment(environment: Environment)
}

class DevSettingsRepositoryImpl(private val settings: Settings) : DevSettingsRepository {

    override fun getActiveEnvironment(): Environment {
        val value = settings.getStringOrNull(KEY_ENV) ?: "dev"
        return Environment.entries.firstOrNull { it.name.lowercase() == value } ?: Environment.DEV
    }

    override fun saveEnvironment(environment: Environment) {
        settings.putString(KEY_ENV, environment.name.lowercase())
    }

    companion object {
        private const val KEY_ENV = "dev_settings_env"
    }
}
