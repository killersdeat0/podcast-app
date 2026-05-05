package com.trilium.syncpods.library

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.rounded.DragHandle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.ui.text.style.TextAlign
import com.composure.arch.Feature
import com.trilium.syncpods.playlist.Playlist
import com.trilium.syncpods.profile.SubscriptionSummary
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

private val FREE_PLAYLIST_LIMIT = LibraryFeature.FREE_PLAYLIST_LIMIT

@Composable
fun LibraryScreen(
    feature: Feature<LibraryState, LibraryEvent, LibraryEffect>,
    onNavigateToPlaylist: (id: String) -> Unit,
    onNavigateToPodcast: (feedUrl: String) -> Unit,
    onNavigateToSignIn: () -> Unit,
    onNavigateToCreateAccount: () -> Unit,
    modifier: Modifier = Modifier,
    bottomContentPadding: Dp = 0.dp,
) {
    val state by feature.state.collectAsState()

    LaunchedEffect(Unit) {
        feature.process(LibraryEvent.ScreenVisible)
        feature.effects.collect { effect ->
            when (effect) {
                is LibraryEffect.NavigateToPlaylist -> onNavigateToPlaylist(effect.id)
                is LibraryEffect.NavigateToPodcast -> onNavigateToPodcast(effect.feedUrl)
            }
        }
    }

    // ── Create playlist dialog ────────────────────────────────────────────────
    if (state.showCreateDialog) {
        AlertDialog(
            onDismissRequest = { feature.process(LibraryEvent.CreateDialogDismissed) },
            title = { Text("New Playlist") },
            text = {
                OutlinedTextField(
                    value = state.createDialogName,
                    onValueChange = { feature.process(LibraryEvent.CreateDialogNameChanged(it)) },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = { feature.process(LibraryEvent.CreateDialogConfirmed) },
                    enabled = state.createDialogName.isNotBlank(),
                ) {
                    Text("Create")
                }
            },
            dismissButton = {
                TextButton(onClick = { feature.process(LibraryEvent.CreateDialogDismissed) }) {
                    Text("Cancel")
                }
            },
        )
    }

    // ── Main content ──────────────────────────────────────────────────────────
    when {
        state.isLoading -> LoadingContent(modifier = modifier)
        state.showLoginPrompt -> GuestContent(
            onSignIn = onNavigateToSignIn,
            onCreateAccount = onNavigateToCreateAccount,
            modifier = modifier,
        )
        else -> LibraryContent(
            state = state,
            feature = feature,
            modifier = modifier,
            bottomContentPadding = bottomContentPadding,
        )
    }
}

// ── Guest content ─────────────────────────────────────────────────────────────

@Composable
private fun GuestContent(
    onSignIn: () -> Unit,
    onCreateAccount: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.padding(horizontal = 32.dp),
        ) {
            Text(
                text = "Sign in to access your Library",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )
            Text(
                text = "Save your favorite podcasts, create playlists, and more.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(8.dp))
            Button(onClick = onSignIn, modifier = Modifier.fillMaxWidth()) {
                Text("Sign In")
            }
            OutlinedButton(onClick = onCreateAccount, modifier = Modifier.fillMaxWidth()) {
                Text("Create Account")
            }
        }
    }
}

// ── Library content ───────────────────────────────────────────────────────────

@Composable
private fun LibraryContent(
    state: LibraryState,
    feature: Feature<LibraryState, LibraryEvent, LibraryEffect>,
    modifier: Modifier = Modifier,
    bottomContentPadding: Dp = 0.dp,
) {
    var items by remember(state.playlists) { mutableStateOf(state.playlists) }

    LaunchedEffect(state.playlists) {
        items = state.playlists
    }

    val lazyListState = rememberLazyListState()
    // Non-playlist items: "subs" header strip + "playlists_header" row = 2 items before playlist rows
    val headerCount = 2
    val reorderState = rememberReorderableLazyListState(lazyListState) { from, to ->
        val fromIndex = from.index - headerCount
        val toIndex = to.index - headerCount
        if (fromIndex >= 0 && toIndex >= 0 && fromIndex < items.size && toIndex < items.size) {
            items = items.toMutableList().apply { add(toIndex, removeAt(fromIndex)) }
        }
    }

    LazyColumn(
        state = lazyListState,
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = bottomContentPadding),
    ) {
        // ── Subscriptions strip ───────────────────────────────────────────────
        item(key = "subs") {
            SubscriptionsStrip(
                subscriptions = state.subscriptions,
                onTap = { feedUrl -> feature.process(LibraryEvent.SubscriptionTapped(feedUrl)) },
            )
        }

        // ── Playlists section header ──────────────────────────────────────────
        item(key = "playlists_header") {
            val atLimit = state.tier == "free" && items.size >= FREE_PLAYLIST_LIMIT
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Your Playlists",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                IconButton(
                    onClick = { feature.process(LibraryEvent.CreatePlaylistTapped) },
                    enabled = !atLimit,
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = "Create playlist",
                        tint = if (atLimit) MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                        else MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }

        // ── Playlist rows ─────────────────────────────────────────────────────
        if (items.isEmpty()) {
            item(key = "empty_state") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 48.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "No playlists yet. Tap + to create one.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            items(items, key = { it.id }) { playlist ->
                ReorderableItem(reorderState, key = playlist.id) { isDragging ->
                    PlaylistRow(
                        playlist = playlist,
                        isDragging = isDragging,
                        onTap = { feature.process(LibraryEvent.PlaylistTapped(playlist.id)) },
                        onDelete = { feature.process(LibraryEvent.PlaylistDeleted(playlist.id)) },
                        dragHandle = {
                            IconButton(
                                modifier = Modifier.draggableHandle(
                                    onDragStopped = {
                                        feature.process(LibraryEvent.PlaylistsReordered(items.map { it.id }))
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
}

// ── Subscriptions strip ───────────────────────────────────────────────────────

@Composable
private fun SubscriptionsStrip(
    subscriptions: List<SubscriptionSummary>,
    onTap: (feedUrl: String) -> Unit,
) {
    if (subscriptions.isEmpty()) return

    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "Following",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(subscriptions, key = { it.feedUrl }) { sub ->
                SubscriptionChip(
                    sub = sub,
                    onTap = { onTap(sub.feedUrl) },
                )
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun SubscriptionChip(
    sub: SubscriptionSummary,
    onTap: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .width(72.dp)
            .clickable(onClick = onTap),
    ) {
        AsyncImage(
            model = sub.artworkUrl,
            contentDescription = sub.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant),
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = sub.title,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// ── Playlist row ──────────────────────────────────────────────────────────────

@Composable
private fun PlaylistRow(
    playlist: Playlist,
    isDragging: Boolean,
    onTap: () -> Unit,
    onDelete: () -> Unit,
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
            .clickable(onClick = onTap)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        dragHandle()

        Spacer(Modifier.width(8.dp))

        PlaylistCoverArt(
            artworkUrls = playlist.artworkUrls,
            modifier = Modifier.size(48.dp),
        )

        Spacer(Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = playlist.name,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${playlist.episodeCount} episode${if (playlist.episodeCount == 1) "" else "s"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        IconButton(onClick = onDelete) {
            Icon(
                imageVector = Icons.Default.Delete,
                contentDescription = "Delete playlist",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
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
            .clip(RoundedCornerShape(8.dp))
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
                // 2×2 collage from up to 4 artwork URLs
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

// ── Loading ───────────────────────────────────────────────────────────────────

@Composable
private fun LoadingContent(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator()
    }
}
