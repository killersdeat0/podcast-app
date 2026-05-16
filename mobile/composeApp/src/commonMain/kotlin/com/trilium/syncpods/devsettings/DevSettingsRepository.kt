package com.trilium.syncpods.devsettings

internal const val DEV_SETTINGS_ENV_KEY = "dev_settings_env"

internal interface DevSettingsStorage {
    fun getEnv(): String?
    fun putEnvSync(value: String)
}

enum class Environment(val displayName: String, val host: String) {
    DEV("Development", "nuvadoybccdqipyhdhns.supabase.co"),
    PROD("Production", "dqqybduklxwxtcahqswh.supabase.co"),
}

interface DevSettingsRepository {
    fun getActiveEnvironment(): Environment
    fun saveEnvironment(environment: Environment)
}

internal class DevSettingsRepositoryImpl(private val storage: DevSettingsStorage) : DevSettingsRepository {

    override fun getActiveEnvironment(): Environment {
        val value = storage.getEnv() ?: "dev"
        return Environment.entries.firstOrNull { it.name.lowercase() == value } ?: Environment.DEV
    }

    override fun saveEnvironment(environment: Environment) {
        storage.putEnvSync(environment.name.lowercase())
    }
}
