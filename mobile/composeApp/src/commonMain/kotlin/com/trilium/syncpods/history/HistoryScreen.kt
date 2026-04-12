package com.trilium.syncpods.history

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.trilium.syncpods.player.NowPlaying

@Composable
fun HistoryScreen(
    feature: HistoryFeature,
    onPlayEpisode: (NowPlaying) -> Unit,
    modifier: Modifier = Modifier,
    bottomContentPadding: Dp = 0.dp,
) {
    val state by feature.state.collectAsState()

    LaunchedEffect(Unit) {
        feature.process(HistoryEvent.ScreenVisible)
        feature.effects.collect { effect ->
            when (effect) {
                is HistoryEffect.PlayEpisode -> onPlayEpisode(
                    NowPlaying(
                        guid = effect.item.guid,
                        title = effect.item.title,
                        podcastName = effect.item.podcastTitle,
                        artworkUrl = effect.item.artworkUrl.orEmpty(),
                        audioUrl = effect.item.audioUrl,
                    )
                )
            }
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "History",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.width(12.dp))
            HistoryTabPill(
                label = "All",
                active = state.activeTab == HistoryTab.All,
                onClick = { feature.process(HistoryEvent.TabSelected(HistoryTab.All)) },
            )
            Spacer(Modifier.width(4.dp))
            HistoryTabPill(
                label = "In Progress",
                active = state.activeTab == HistoryTab.InProgress,
                onClick = { feature.process(HistoryEvent.TabSelected(HistoryTab.InProgress)) },
            )
        }

        when {
            state.isLoading -> HistoryLoadingContent()
            state.error != null -> HistoryErrorContent(
                message = state.error!!,
                onRetry = { feature.process(HistoryEvent.RetryTapped) },
            )
            state.activeTab == HistoryTab.All -> {
                if (state.allGroups.isEmpty()) {
                    HistoryEmptyState("No listening history yet.\nStart playing an episode to see it here.")
                } else {
                    HistoryAllContent(
                        groups = state.allGroups,
                        onEpisodeTapped = { feature.process(HistoryEvent.EpisodeTapped(it)) },
                        bottomContentPadding = bottomContentPadding,
                    )
                }
            }
            else -> {
                if (state.inProgressItems.isEmpty()) {
                    HistoryEmptyState("No episodes in progress.\nEpisodes you've started will appear here.")
                } else {
                    HistoryInProgressContent(
                        items = state.inProgressItems,
                        onEpisodeTapped = { feature.process(HistoryEvent.EpisodeTapped(it)) },
                        bottomContentPadding = bottomContentPadding,
                    )
                }
            }
        }
    }
}

@Composable
private fun HistoryTabPill(label: String, active: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(50),
        color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
        contentColor = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun HistoryAllContent(
    groups: List<DateGroup>,
    onEpisodeTapped: (HistoryItem) -> Unit,
    bottomContentPadding: Dp,
) {
    LazyColumn(
        contentPadding = PaddingValues(bottom = bottomContentPadding),
        modifier = Modifier.fillMaxSize(),
    ) {
        groups.forEach { group ->
            item(key = group.label) {
                val episodeWord = if (group.items.size == 1) "EPISODE" else "EPISODES"
                Text(
                    text = "${group.label.uppercase()} · ${group.items.size} $episodeWord",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp),
                )
            }
            items(group.items, key = { it.guid }) { item ->
                EpisodeRow(
                    item = item,
                    onTap = { onEpisodeTapped(item) },
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun HistoryInProgressContent(
    items: List<HistoryItem>,
    onEpisodeTapped: (HistoryItem) -> Unit,
    bottomContentPadding: Dp,
) {
    LazyColumn(
        contentPadding = PaddingValues(bottom = bottomContentPadding),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(items, key = { it.guid }) { item ->
            EpisodeRow(
                item = item,
                onTap = { onEpisodeTapped(item) },
                modifier = Modifier.padding(horizontal = 8.dp),
            )
        }
    }
}

@Composable
private fun EpisodeRow(item: HistoryItem, onTap: () -> Unit, modifier: Modifier = Modifier) {
    val isPlayed = item.completed || (item.positionPct != null && item.positionPct >= 98f)
    Card(
        onClick = onTap,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AsyncImage(
                model = item.artworkUrl,
                contentDescription = null,
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(8.dp)),
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = item.podcastTitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    val duration = formatDuration(item.durationSeconds)
                    if (duration.isNotEmpty()) {
                        Text(
                            text = duration,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (isPlayed) {
                        Text(
                            text = "✓ PLAYED",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoryLoadingContent() {
    Column(
        modifier = Modifier.fillMaxSize().padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        repeat(5) {
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                modifier = Modifier.fillMaxWidth().height(72.dp),
            ) {}
        }
    }
}

@Composable
private fun HistoryErrorContent(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
        Spacer(Modifier.height(8.dp))
        Button(onClick = onRetry) { Text("Retry") }
    }
}

@Composable
private fun HistoryEmptyState(message: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(32.dp),
        )
    }
}

private fun formatDuration(seconds: Int?): String {
    if (seconds == null || seconds == 0) return ""
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    return if (h > 0) "${h}h ${m}m" else "${m}m"
}
