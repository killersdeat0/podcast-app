package com.trilium.syncpods.playlistdetail

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.RemoveCircleOutline
import androidx.compose.material.icons.rounded.DragHandle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.composure.arch.Feature
import com.trilium.syncpods.playlist.PlaylistEpisode
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistDetailScreen(
    feature: Feature<PlaylistDetailState, PlaylistDetailEvent, PlaylistDetailEffect>,
    onPlayEpisode: (PlaylistEpisode) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    topContentPadding: Dp = 0.dp,
    bottomContentPadding: Dp = 0.dp,
) {
    val state by feature.state.collectAsState()

    // ── Effect collection ──────────────────────────────────────────────────────
    LaunchedEffect(Unit) {
        feature.effects.collect { effect ->
            when (effect) {
                is PlaylistDetailEffect.NavigateToPlayer -> onPlayEpisode(effect.episode)
                is PlaylistDetailEffect.NavigateBack -> onBack()
            }
        }
    }

    // ── Rename dialog ──────────────────────────────────────────────────────────
    if (state.isRenaming) {
        AlertDialog(
            onDismissRequest = { feature.process(PlaylistDetailEvent.RenameDismissed) },
            title = { Text("Rename Playlist") },
            text = {
                OutlinedTextField(
                    value = state.renameText,
                    onValueChange = { feature.process(PlaylistDetailEvent.RenameTextChanged(it)) },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = { feature.process(PlaylistDetailEvent.RenameConfirmed) },
                    enabled = state.renameText.isNotBlank(),
                ) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { feature.process(PlaylistDetailEvent.RenameDismissed) }) {
                    Text("Cancel")
                }
            },
        )
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = state.playlist?.name ?: "",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { feature.process(PlaylistDetailEvent.BackTapped) }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                        )
                    }
                },
                actions = {
                    // Public/private toggle
                    val isPublic = state.playlist?.isPublic ?: false
                    IconButton(
                        onClick = { feature.process(PlaylistDetailEvent.PublicPrivateToggled(!isPublic)) },
                    ) {
                        Icon(
                            imageVector = if (isPublic) Icons.Default.LockOpen else Icons.Default.Lock,
                            contentDescription = if (isPublic) "Make private" else "Make public",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    TextButton(onClick = { feature.process(PlaylistDetailEvent.RenameTapped) }) {
                        Text("Rename")
                    }
                    IconButton(onClick = { feature.process(PlaylistDetailEvent.DeletePlaylistTapped) }) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = "Delete playlist",
                            tint = MaterialTheme.colorScheme.error,
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        val topPadding = innerPadding.calculateTopPadding() + topContentPadding
        val bottomPadding = innerPadding.calculateBottomPadding() + bottomContentPadding

        when {
            state.isLoading -> {
                // ── Loading ────────────────────────────────────────────────────
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(top = topPadding, bottom = bottomPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
            state.episodes.isEmpty() -> {
                // ── Empty state ────────────────────────────────────────────────
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(top = topPadding, bottom = bottomPadding),
                ) {
                    state.playlist?.let { playlist ->
                        PlaylistHeader(
                            artworkUrls = playlist.artworkUrls,
                            name = playlist.name,
                            episodeCount = playlist.episodeCount,
                            isPublic = playlist.isPublic,
                        )
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 16.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "No episodes yet. Add some from Discover or History.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            else -> {
                // ── Episode list ───────────────────────────────────────────────
                EpisodeList(
                    state = state,
                    feature = feature,
                    topPadding = topPadding,
                    bottomPadding = bottomPadding,
                )
            }
        }
    }
}

// ── Playlist header ───────────────────────────────────────────────────────────

@Composable
private fun PlaylistHeader(
    artworkUrls: List<String>,
    name: String,
    episodeCount: Int,
    isPublic: Boolean,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PlaylistCoverArt(
            artworkUrls = artworkUrls,
            modifier = Modifier.size(80.dp),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = name,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "$episodeCount episode${if (episodeCount == 1) "" else "s"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            AssistChip(
                onClick = {},
                label = { Text(if (isPublic) "Public" else "Private") },
                leadingIcon = {
                    Icon(
                        imageVector = if (isPublic) Icons.Default.LockOpen else Icons.Default.Lock,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                },
            )
        }
    }
}

// ── Playlist cover art ────────────────────────────────────────────────────────

@Composable
private fun PlaylistCoverArt(
    artworkUrls: List<String>,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        when {
            artworkUrls.isEmpty() -> {
                // Placeholder — surfaceVariant background is sufficient
            }
            artworkUrls.size == 1 -> {
                AsyncImage(
                    model = artworkUrls[0],
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.matchParentSize(),
                )
            }
            else -> {
                val urls = artworkUrls.take(4)
                Column(modifier = Modifier.matchParentSize()) {
                    Row(modifier = Modifier.weight(1f)) {
                        AsyncImage(
                            model = urls[0],
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .weight(1f)
                                .aspectRatio(1f),
                        )
                        if (urls.size > 1) {
                            AsyncImage(
                                model = urls[1],
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .weight(1f)
                                    .aspectRatio(1f),
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .aspectRatio(1f)
                                    .background(MaterialTheme.colorScheme.surfaceVariant),
                            )
                        }
                    }
                    Row(modifier = Modifier.weight(1f)) {
                        if (urls.size > 2) {
                            AsyncImage(
                                model = urls[2],
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .weight(1f)
                                    .aspectRatio(1f),
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .aspectRatio(1f)
                                    .background(MaterialTheme.colorScheme.surfaceVariant),
                            )
                        }
                        if (urls.size > 3) {
                            AsyncImage(
                                model = urls[3],
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .weight(1f)
                                    .aspectRatio(1f),
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .aspectRatio(1f)
                                    .background(MaterialTheme.colorScheme.surfaceVariant),
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── Episode list ──────────────────────────────────────────────────────────────

@Composable
private fun EpisodeList(
    state: PlaylistDetailState,
    feature: Feature<PlaylistDetailState, PlaylistDetailEvent, PlaylistDetailEffect>,
    topPadding: Dp,
    bottomPadding: Dp,
) {
    var items by remember(state.episodes) { mutableStateOf(state.episodes) }

    LaunchedEffect(state.episodes) {
        items = state.episodes
    }

    val lazyListState = rememberLazyListState()
    // header item (playlist header row) occupies index 0
    val headerCount = 1
    val reorderState = rememberReorderableLazyListState(lazyListState) { from, to ->
        val fromIndex = from.index - headerCount
        val toIndex = to.index - headerCount
        if (fromIndex >= 0 && toIndex >= 0 && fromIndex < items.size && toIndex < items.size) {
            items = items.toMutableList().apply { add(toIndex, removeAt(fromIndex)) }
        }
    }

    LazyColumn(
        state = lazyListState,
        contentPadding = PaddingValues(top = topPadding, bottom = bottomPadding),
    ) {
        item(key = "header") {
            state.playlist?.let { playlist ->
                PlaylistHeader(
                    artworkUrls = playlist.artworkUrls,
                    name = playlist.name,
                    episodeCount = playlist.episodeCount,
                    isPublic = playlist.isPublic,
                )
            }
        }

        items(items, key = { it.id }) { episode ->
            ReorderableItem(reorderState, key = episode.id) { _ ->
                EpisodeRow(
                    episode = episode,
                    onTap = { feature.process(PlaylistDetailEvent.EpisodeTapped(episode)) },
                    onRemove = { feature.process(PlaylistDetailEvent.EpisodeRemoved(episode.guid)) },
                    dragHandle = {
                        IconButton(
                            modifier = Modifier.draggableHandle(
                                onDragStopped = {
                                    feature.process(
                                        PlaylistDetailEvent.EpisodesReordered(items.map { it.guid })
                                    )
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

// ── Episode row ───────────────────────────────────────────────────────────────

@Composable
private fun EpisodeRow(
    episode: PlaylistEpisode,
    onTap: () -> Unit,
    onRemove: () -> Unit,
    dragHandle: @Composable () -> Unit,
) {
    ListItem(
        headlineContent = {
            Text(
                text = episode.title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        },
        supportingContent = {
            val duration = episode.durationSeconds?.let { formatDuration(it) }
            val supporting = if (duration != null) {
                "${episode.podcastTitle} · $duration"
            } else {
                episode.podcastTitle
            }
            Text(
                text = supporting,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        leadingContent = {
            AsyncImage(
                model = episode.artworkUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            )
        },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onRemove) {
                    Icon(
                        imageVector = Icons.Default.RemoveCircleOutline,
                        contentDescription = "Remove episode",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                dragHandle()
            }
        },
        modifier = Modifier.clickable(onClick = onTap),
    )
}

// ── Utilities ─────────────────────────────────────────────────────────────────

private fun formatDuration(seconds: Int): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    return when {
        h > 0 && m > 0 -> "${h}h ${m}m"
        h > 0 -> "${h}h"
        else -> "${m}m"
    }
}
