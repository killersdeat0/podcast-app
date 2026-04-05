package com.trilium.syncpods.auth

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email

interface LoginRepository {
    suspend fun signIn(email: String, password: String)
    suspend fun sendPasswordResetEmail(email: String)
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

    override suspend fun sendPasswordResetEmail(email: String) {
        supabaseClient.auth.resetPasswordForEmail(
            email = email,
            redirectUrl = "https://syncpods.app/auth/callback?next=/reset-password",
        )
    }
}
