package com.trilium.syncpods.queue

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.rounded.DragHandle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.trilium.syncpods.auth.LoginPromptReason
import com.trilium.syncpods.auth.LoginPromptSheet
import com.trilium.syncpods.player.NowPlaying
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

@Composable
fun QueueScreen(
    feature: QueueFeature,
    onPlayEpisode: (NowPlaying) -> Unit,
    onNavigateToSignIn: () -> Unit = {},
    onNavigateToCreateAccount: () -> Unit = {},
    modifier: Modifier = Modifier,
    bottomContentPadding: Dp = 0.dp,
) {
    val state by feature.state.collectAsState()
    var showUpgradeSheet by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        feature.process(QueueEvent.ScreenVisible)
        feature.effects.collect { effect ->
            when (effect) {
                is QueueEffect.PlayEpisode -> onPlayEpisode(
                    NowPlaying(
                        guid = effect.item.guid,
                        title = effect.item.title,
                        podcastName = effect.item.podcastTitle,
                        artworkUrl = effect.item.artworkUrl.orEmpty(),
                        audioUrl = effect.item.audioUrl,
                    )
                )
                is QueueEffect.NavigateToUpgrade -> showUpgradeSheet = true
                is QueueEffect.ShowLoginPrompt -> { /* state.showLoginPrompt handles this */ }
            }
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Up Next", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.weight(1f))
            CapBadge(tier = state.tier, count = state.items.size)
        }

        when {
            state.isLoading -> LoadingContent()
            state.error != null -> ErrorContent(
                message = state.error!!,
                onRetry = { feature.process(QueueEvent.RetryTapped) },
            )
            state.items.isEmpty() -> QueueEmptyState()
            else -> QueueList(
                state = state,
                feature = feature,
                bottomContentPadding = bottomContentPadding,
            )
        }
    }

    if (state.showLoginPrompt) {
        LoginPromptSheet(
            reason = LoginPromptReason.SAVE_QUEUE,
            onDismiss = { feature.process(QueueEvent.LoginPromptDismissed) },
            onSignIn = onNavigateToSignIn,
            onCreateAccount = onNavigateToCreateAccount,
        )
    }

    if (showUpgradeSheet) {
        AlertDialog(
            onDismissRequest = { showUpgradeSheet = false },
            title = { Text("Upgrade to unlock unlimited queue") },
            text = { Text("Free users can queue up to 10 episodes. Upgrade for unlimited episodes.") },
            confirmButton = {
                TextButton(onClick = { showUpgradeSheet = false }) { Text("View Plans") }
            },
            dismissButton = {
                TextButton(onClick = { showUpgradeSheet = false }) { Text("Not now") }
            },
        )
    }
}

@Composable
private fun CapBadge(tier: String, count: Int) {
    if (tier == "paid") {
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.primary,
        ) {
            Text(
                text = "Unlimited",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }
    } else {
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Text(
                text = "$count / 10 Free",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }
    }
}

@Composable
private fun QueueList(
    state: QueueState,
    feature: QueueFeature,
    bottomContentPadding: Dp,
) {
    var items by remember(state.items) { mutableStateOf(state.items) }

    LaunchedEffect(state.items) {
        items = state.items
    }

    val lazyListState = rememberLazyListState()
    val headerCount = if (state.showUpgradeCard) 1 else 0
    val reorderState = rememberReorderableLazyListState(lazyListState) { from, to ->
        val fromIndex = from.index - headerCount
        val toIndex = to.index - headerCount
        items = items.toMutableList().apply { add(toIndex, removeAt(fromIndex)) }
    }

    LazyColumn(
        state = lazyListState,
        contentPadding = PaddingValues(bottom = bottomContentPadding),
    ) {
        if (state.showUpgradeCard) {
            item(key = "upgrade_card") {
                InlineUpgradeCard(
                    onViewPlans = { feature.process(QueueEvent.UpgradeTapped) },
                )
            }
        }

        items(items, key = { it.guid }) { item ->
            ReorderableItem(reorderState, key = item.guid) { isDragging ->
                QueueEpisodeCard(
                    item = item,
                    isPlaying = item.guid == state.nowPlayingGuid,
                    isDragging = isDragging,
                    onTap = { feature.process(QueueEvent.EpisodeTapped(item.guid)) },
                    onRemove = { feature.process(QueueEvent.EpisodeRemoved(item.guid)) },
                    dragHandle = {
                        IconButton(
                            modifier = Modifier.draggableHandle(
                                onDragStopped = {
                                    feature.process(QueueEvent.EpisodesReordered(items.map { it.guid }))
                                },
                            ),
                            onClick = {},
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.DragHandle,
                                contentDescription = "Reorder",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun QueueEpisodeCard(
    item: QueueItem,
    isPlaying: Boolean,
    isDragging: Boolean,
    onTap: () -> Unit,
    onRemove: () -> Unit,
    dragHandle: @Composable () -> Unit,
) {
    val backgroundColor = if (isDragging) {
        MaterialTheme.colorScheme.surfaceContainerHigh
    } else {
        MaterialTheme.colorScheme.surface
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(backgroundColor)
            .clickable { onTap() }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        dragHandle()

        Spacer(Modifier.width(8.dp))

        // Artwork
        Box {
            AsyncImage(
                model = item.artworkUrl,
                contentDescription = null,
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(8.dp)),
            )
            if (isPlaying) {
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.Black.copy(alpha = 0.4f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = null,
                        tint = Color.White,
                    )
                }
            }
        }

        Spacer(Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = item.title,
                style = MaterialTheme.typography.bodyMedium,
                color = if (isPlaying) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = item.podcastTitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (item.durationSeconds != null) {
                Text(
                    text = formatDuration(item.durationSeconds),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        IconButton(onClick = onRemove) {
            Icon(
                imageVector = Icons.Default.Delete,
                contentDescription = "Remove",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun InlineUpgradeCard(onViewPlans: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Queue Limit Reached Soon",
                style = MaterialTheme.typography.titleSmall,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Free users can only queue up to 10 episodes at a time. Upgrade for unlimited episodes and silence skipping.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = onViewPlans,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("View Plans")
            }
        }
    }
}

@Composable
private fun QueueEmptyState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                imageVector = Icons.Default.List,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = "Your queue is empty",
                style = MaterialTheme.typography.titleMedium,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Add episodes to listen next",
                style = MaterialTheme.typography.bodyMedium,
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

/** Format seconds as "1h 15m" or "45m" */
private fun formatDuration(seconds: Int): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    return when {
        h > 0 && m > 0 -> "${h}h ${m}m"
        h > 0 -> "${h}h"
        else -> "${m}m"
    }
}
