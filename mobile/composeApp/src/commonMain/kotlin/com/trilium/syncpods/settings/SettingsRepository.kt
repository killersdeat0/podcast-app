package com.trilium.syncpods.settings

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth

interface SettingsRepository {
    fun isSignedIn(): Boolean
    suspend fun signOut()
}

class SettingsRepositoryImpl(
    private val supabaseClient: SupabaseClient,
) : SettingsRepository {
    override fun isSignedIn(): Boolean = supabaseClient.auth.currentUserOrNull() != null

    override suspend fun signOut() {
        supabaseClient.auth.signOut()
    }
}
