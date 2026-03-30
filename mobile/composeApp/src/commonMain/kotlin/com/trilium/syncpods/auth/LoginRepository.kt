package com.trilium.syncpods.auth

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email

interface LoginRepository {
    suspend fun signIn(email: String, password: String)
}

class LoginRepositoryImpl(
    private val supabaseClient: SupabaseClient,
) : LoginRepository {
    override suspend fun signIn(email: String, password: String) {
        supabaseClient.auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }
}
