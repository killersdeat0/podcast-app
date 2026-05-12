package com.trilium.syncpods.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.trilium.syncpods.billing.ANNUAL_PRODUCT_ID
import com.trilium.syncpods.billing.MONTHLY_PRODUCT_ID
import com.trilium.syncpods.billing.SubscriptionProduct
import kotlinx.coroutines.delay

@Composable
fun ProfileScreen(
    feature: ProfileFeature,
    onNavigateToPodcast: (String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToSignIn: () -> Unit,
    onNavigateToLibrary: () -> Unit = {},
    modifier: Modifier = Modifier,
    bottomContentPadding: Dp = 0.dp,
) {
    val state by feature.state.collectAsState()
    var feedbackMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        feature.effects.collect { effect ->
            when (effect) {
                is ProfileEffect.NavigateToPodcastDetail -> onNavigateToPodcast(effect.feedUrl)
                is ProfileEffect.NavigateToSettings -> onNavigateToSettings()
                is ProfileEffect.NavigateToSignIn -> onNavigateToSignIn()
                is ProfileEffect.NavigateToLibrary -> onNavigateToLibrary()
                is ProfileEffect.NavigateToCreateAccount -> { /* stub: create-account screen not yet implemented */ }
                is ProfileEffect.ShowPurchaseSuccess -> feedbackMessage = "Subscription activated!"
                is ProfileEffect.ShowPurchaseError -> feedbackMessage = effect.message
                is ProfileEffect.ShowRestoreSuccess -> feedbackMessage = "Subscription restored!"
                is ProfileEffect.ShowRestoreNothing -> feedbackMessage = "No previous subscription found."
            }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Top bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Profile",
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { feature.process(ProfileEvent.SettingsTapped) }) {
                    Icon(Icons.Default.Settings, contentDescription = "Settings")
                }
            }

            when {
                state.isLoading -> LoadingContent()
                state.error != null -> ErrorContent(
                    message = state.error!!,
                    onRetry = { feature.process(ProfileEvent.RetryTapped) },
                )
                state.isGuest -> GuestContent(
                    state = state,
                    feature = feature,
                    bottomContentPadding = bottomContentPadding,
                )
                else -> LoggedInContent(
                    state = state,
                    feature = feature,
                    bottomContentPadding = bottomContentPadding,
                )
            }
        }

        feedbackMessage?.let { msg ->
            LaunchedEffect(msg) {
                delay(3000)
                feedbackMessage = null
            }
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(bottom = bottomContentPadding + 16.dp),
                contentAlignment = Alignment.BottomCenter,
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.inverseSurface,
                    modifier = Modifier.padding(horizontal = 24.dp),
                ) {
                    Text(
                        text = msg,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.inverseOnSurface,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun GuestContent(
    state: ProfileState,
    feature: ProfileFeature,
    bottomContentPadding: Dp,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp)
            .padding(bottom = bottomContentPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(32.dp))

        // Avatar placeholder
        Surface(
            modifier = Modifier.size(80.dp),
            shape = CircleShape,
            color = MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = null,
                    modifier = Modifier.size(40.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Spacer(Modifier.height(16.dp))

        Text(
            text = "Guest User",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "Sign in to sync your podcasts",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = { feature.process(ProfileEvent.SignInTapped) },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Sign In / Sign Up")
        }

        Spacer(Modifier.height(24.dp))

        SubscriptionPlansSection(
            products = state.products,
            isPurchasing = state.isPurchasing,
            isRestoring = state.isRestoring,
            onSubscribeMonthly = { feature.process(ProfileEvent.SubscribeMonthlyTapped) },
            onSubscribeAnnual = { feature.process(ProfileEvent.SubscribeAnnuallyTapped) },
            onRestorePurchases = { feature.process(ProfileEvent.RestorePurchasesTapped) },
        )

        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun LoggedInContent(
    state: ProfileState,
    feature: ProfileFeature,
    bottomContentPadding: Dp,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(bottom = bottomContentPadding),
    ) {
        // Avatar + user info
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            InitialsAvatar(displayName = state.displayName)
            Spacer(Modifier.width(16.dp))
            Column {
                Text(
                    text = state.displayName,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = state.email,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(6.dp))
                TierBadge(tier = state.tier)
            }
        }

        Spacer(Modifier.height(8.dp))

        // Subscriptions section
        if (state.subscriptions.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Your Subscriptions",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = { feature.process(ProfileEvent.ViewAllSubscriptionsTapped) }) {
                    Text("View All")
                }
            }

            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(state.subscriptions, key = { it.feedUrl }) { sub ->
                    SubscriptionScrollItem(
                        subscription = sub,
                        onClick = { feature.process(ProfileEvent.SubscriptionTapped(sub.feedUrl)) },
                    )
                }
            }

            Spacer(Modifier.height(20.dp))
        }

        // Upgrade card (free tier only)
        if (state.tier != "paid") {
            SubscriptionPlansSection(
                products = state.products,
                isPurchasing = state.isPurchasing,
                isRestoring = state.isRestoring,
                onSubscribeMonthly = { feature.process(ProfileEvent.SubscribeMonthlyTapped) },
                onSubscribeAnnual = { feature.process(ProfileEvent.SubscribeAnnuallyTapped) },
                onRestorePurchases = { feature.process(ProfileEvent.RestorePurchasesTapped) },
                modifier = Modifier.padding(horizontal = 16.dp),
            )
            Spacer(Modifier.height(20.dp))
        }

        // Listening stats teaser
        ListeningStatsTeaser()

        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun InitialsAvatar(displayName: String, modifier: Modifier = Modifier) {
    val initials = displayName.split(" ")
        .take(2)
        .mapNotNull { it.firstOrNull()?.uppercaseChar() }
        .joinToString("")
        .ifEmpty { "?" }

    Surface(
        modifier = modifier.size(64.dp),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.primaryContainer,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = initials,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
    }
}

@Composable
private fun TierBadge(tier: String) {
    val label = if (tier == "paid") "PRO" else "FREE PLAN"
    val bgColor = if (tier == "paid") MaterialTheme.colorScheme.primary
    else MaterialTheme.colorScheme.surfaceVariant
    val textColor = if (tier == "paid") MaterialTheme.colorScheme.onPrimary
    else MaterialTheme.colorScheme.onSurfaceVariant

    Surface(
        shape = RoundedCornerShape(4.dp),
        color = bgColor,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = textColor,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
        )
    }
}

@Composable
private fun SubscriptionScrollItem(
    subscription: SubscriptionSummary,
    onClick: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .width(72.dp)
            .clickable { onClick() },
    ) {
        AsyncImage(
            model = subscription.artworkUrl,
            contentDescription = subscription.title,
            modifier = Modifier
                .size(64.dp)
                .clip(RoundedCornerShape(8.dp)),
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = subscription.title,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 2,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun SubscriptionPlansSection(
    products: List<SubscriptionProduct>,
    isPurchasing: Boolean,
    isRestoring: Boolean,
    onSubscribeMonthly: () -> Unit,
    onSubscribeAnnual: () -> Unit,
    onRestorePurchases: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val monthlyProduct = products.find { it.id == MONTHLY_PRODUCT_ID }
    val annualProduct = products.find { it.id == ANNUAL_PRODUCT_ID }

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "Unlock all features: unlimited queue, full playback speed range, complete history, and no ads.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))

        PlanCard(
            title = "Monthly",
            price = monthlyProduct?.displayPrice ?: "$4.99",
            priceSuffix = " / month",
            badge = null,
            monthlyEquiv = null,
            isPurchasing = isPurchasing,
            buttonLabel = "Subscribe Monthly",
            onSubscribe = onSubscribeMonthly,
            isHighlighted = false,
        )

        Spacer(Modifier.height(12.dp))

        PlanCard(
            title = "Annual",
            price = annualProduct?.displayPrice ?: "$50.00",
            priceSuffix = " / year",
            badge = "Save 17%",
            monthlyEquiv = "~$4.17/month",
            isPurchasing = isPurchasing,
            buttonLabel = "Subscribe Annually",
            onSubscribe = onSubscribeAnnual,
            isHighlighted = true,
        )

        Spacer(Modifier.height(16.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (isRestoring) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
            }
            TextButton(
                onClick = onRestorePurchases,
                enabled = !isRestoring && !isPurchasing,
            ) {
                Text(
                    text = "Restore Purchases",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun PlanCard(
    title: String,
    price: String,
    priceSuffix: String,
    badge: String?,
    monthlyEquiv: String?,
    isPurchasing: Boolean,
    buttonLabel: String,
    onSubscribe: () -> Unit,
    isHighlighted: Boolean,
    modifier: Modifier = Modifier,
) {
    val borderColor = if (isHighlighted) MaterialTheme.colorScheme.primary
                      else MaterialTheme.colorScheme.outlineVariant

    Box(modifier = modifier.fillMaxWidth()) {
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
            border = BorderStroke(1.dp, borderColor),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        text = price,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = priceSuffix,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (monthlyEquiv != null) {
                    Text(
                        text = monthlyEquiv,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.height(12.dp))
                listOf("Unlimited queue", "All playback speeds", "Full history", "No ads").forEach {
                    Text(
                        text = "• $it",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = onSubscribe,
                    enabled = !isPurchasing,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                ) {
                    if (isPurchasing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text(text = buttonLabel)
                    }
                }
            }
        }

        if (badge != null) {
            Surface(
                shape = RoundedCornerShape(50),
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(start = 12.dp)
                    .offset(y = (-12).dp),
            ) {
                Text(
                    text = badge,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun ListeningStatsTeaser() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "Listening Stats",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.weight(1f),
        )
    }
    Spacer(Modifier.height(12.dp))
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                imageVector = Icons.Default.Lock,
                contentDescription = null,
                modifier = Modifier.size(32.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Upgrade to unlock full listening stats",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun LoadingContent() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator()
    }
}

@Composable
private fun ErrorContent(message: String, onRetry: () -> Unit) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            Button(onClick = onRetry) {
                Text("Try again")
            }
        }
    }
}
