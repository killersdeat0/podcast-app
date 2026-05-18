package com.trilium.syncpods

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.trilium.syncpods.billing.AndroidBillingHandler
import com.trilium.syncpods.billing.BillingHandler
import com.trilium.syncpods.devsettings.DEV_SETTINGS_ENV_KEY
import com.trilium.syncpods.di.appModule
import com.trilium.syncpods.deeplink.PendingDeepLink
import com.trilium.syncpods.deeplink.parsePlaylistDeepLink
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.handleDeeplinks
import org.koin.android.ext.android.inject
import org.koin.android.ext.koin.androidContext
import org.koin.core.context.GlobalContext
import org.koin.core.context.startKoin

class MainActivity : ComponentActivity() {

    private val supabaseClient: SupabaseClient by inject()
    private val pendingDeepLink: PendingDeepLink by inject()
    private val billingHandler: BillingHandler by inject()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        if (GlobalContext.getOrNull() == null) {
            if (BuildConfig.DEBUG) {
                val prefs = getSharedPreferences("${packageName}_preferences", Context.MODE_PRIVATE)
                val env = prefs.getString(DEV_SETTINGS_ENV_KEY, "dev")
                SelectedEnvironment.url = if (env == "prod") BuildConfig.PROD_SUPABASE_URL else BuildConfig.DEV_SUPABASE_URL
                SelectedEnvironment.key = if (env == "prod") BuildConfig.PROD_SUPABASE_ANON_KEY else BuildConfig.DEV_SUPABASE_ANON_KEY
            }
            startKoin {
                androidContext(this@MainActivity)
                modules(appModule)
            }
        }

        handleAuthIntent(intent)
        handlePlaylistIntent(intent)

        setContent {
            App()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleAuthIntent(intent)
        handlePlaylistIntent(intent)
    }

    private fun handleAuthIntent(intent: Intent) {
        supabaseClient.handleDeeplinks(intent)
    }

    private fun handlePlaylistIntent(intent: Intent) {
        val url = intent.data?.toString() ?: return
        val route = parsePlaylistDeepLink(url) ?: return
        pendingDeepLink.set(route)
    }

    override fun onResume() {
        super.onResume()
        (billingHandler as? AndroidBillingHandler)?.onActivityResumed(this)
    }

    override fun onPause() {
        super.onPause()
        (billingHandler as? AndroidBillingHandler)?.onActivityPaused()
    }
}

@Preview
@Composable
fun AppAndroidPreview() {
    App()
}
