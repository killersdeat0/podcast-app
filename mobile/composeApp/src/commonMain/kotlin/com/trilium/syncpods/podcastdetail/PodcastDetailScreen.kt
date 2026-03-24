package com.trilium.syncpods.podcastdetail

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
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.automirrored.filled.PlaylistAdd
import androidx.compose.material.icons.filled.PlaylistRemove
import androidx.compose.material3.Button
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.trilium.syncpods.auth.LoginPromptReason
import com.trilium.syncpods.auth.LoginPromptSheet
import com.trilium.syncpods.player.NowPlaying

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PodcastDetailScreen(
    feature: PodcastDetailFeature,
    onBack: () -> Unit,
    onPlayEpisode: (NowPlaying) -> Unit,
    onNavigateToSignIn: () -> Unit,
    onNavigateToCreateAccount: () -> Unit,
    modifier: Modifier = Modifier,
    topContentPadding: Dp = 0.dp,
    bottomContentPadding: Dp = 0.dp,
) {
    val state by feature.state.collectAsState()
    val coroutineScope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        feature.process(PodcastDetailEvent.ScreenVisible)
        feature.effects.collect { effect ->
            when (effect) {
                is PodcastDetailEffect.EpisodeQueuedAdded ->
                    coroutineScope.launch { snackbarHostState.showSnackbar("Added to queue") }
                is PodcastDetailEffect.EpisodeQueuedRemoved ->
                    coroutineScope.launch { snackbarHostState.showSnackbar("Removed from queue") }
                is PodcastDetailEffect.NavigateBack -> onBack()
                is PodcastDetailEffect.NavigateToSignIn -> onNavigateToSignIn()
                is PodcastDetailEffect.NavigateToCreateAccount -> onNavigateToCreateAccount()
                is PodcastDetailEffect.PlayEpisode -> onPlayEpisode(
                    NowPlaying(
                        guid = effect.episode.guid,
                        title = effect.episode.title,
                        podcastName = feature.state.value.podcastTitle,
                        artworkUrl = feature.state.value.artworkUrl,
                        audioUrl = effect.episode.audioUrl,
                    )
                )
                is PodcastDetailEffect.PlayLatest -> {
                    val s = feature.state.value
                    val episode = if (s.sortNewestFirst) s.episodes.firstOrNull() else s.episodes.lastOrNull()
                    if (episode != null) {
                        onPlayEpisode(
                            NowPlaying(
                                guid = episode.guid,
                                title = episode.title,
                                podcastName = s.podcastTitle,
                                artworkUrl = s.artworkUrl,
                                audioUrl = episode.audioUrl,
                            )
                        )
                    }
                }
            }
        }
    }

    val sortedEpisodes = if (state.sortNewestFirst) state.episodes else state.episodes.reversed()

    Box(modifier = modifier.fillMaxSize()) {
        if (state.isLoading && state.episodes.isEmpty() && state.podcastTitle.isEmpty()) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
        } else if (state.error != null && state.episodes.isEmpty()) {
            Column(
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = state.error ?: "Failed to load podcast",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(onClick = { feature.process(PodcastDetailEvent.RetryTapped) }) {
                    Text("Retry")
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 24.dp + bottomContentPadding),
            ) {
                // Hero artwork
                item {
                    Box {
                        AsyncImage(
                            model = state.artworkUrl,
                            contentDescription = state.podcastTitle,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(1f),
                        )
                        // Scrim for back button legibility
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(80.dp)
                                .background(
                                    Brush.verticalGradient(
                                        listOf(
                                            MaterialTheme.colorScheme.background.copy(alpha = 0.7f),
                                            Color.Transparent,
                                        )
                                    )
                                )
                        )
                    }
                }

                // Title, bell, artist, genres
                item {
                    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = state.podcastTitle,
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(1f),
                            )
                            IconButton(onClick = { /* stub: notification settings */ }) {
                                Icon(
                                    imageVector = Icons.Default.Notifications,
                                    contentDescription = "Notification settings",
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        if (state.artistName.isNotEmpty()) {
                            Text(
                                text = state.artistName,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (state.genres.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                items(state.genres) { genre ->
                                    SuggestionChip(
                                        onClick = {},
                                        label = { Text(genre, style = MaterialTheme.typography.labelSmall) },
                                    )
                                }
                            }
                        }
                    }
                }

                // Description
                if (state.description.isNotEmpty()) {
                    item {
                        Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                            Text(
                                text = state.description,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = if (state.isDescriptionExpanded) Int.MAX_VALUE else 3,
                                overflow = TextOverflow.Ellipsis,
                            )
                            TextButton(
                                onClick = { feature.process(PodcastDetailEvent.ExpandDescriptionTapped) },
                                contentPadding = PaddingValues(0.dp),
                            ) {
                                Text(
                                    text = if (state.isDescriptionExpanded) "Show less" else "Read more",
                                    style = MaterialTheme.typography.labelMedium,
                                )
                            }
                        }
                    }
                }

                // Action buttons: Play Latest + Follow
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        FilledTonalButton(
                            onClick = { feature.process(PodcastDetailEvent.PlayLatestTapped) },
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Play Latest")
                        }
                        OutlinedButton(
                            onClick = { feature.process(PodcastDetailEvent.FollowTapped) },
                            modifier = Modifier.weight(1f),
                        ) {
                            if (state.isFollowLoading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                )
                            } else {
                                Text(if (state.isFollowing) "Following" else "+ Follow")
                            }
                        }
                    }
                }

                // Episodes header
                item {
                    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Episodes",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f),
                        )
                        Row(
                            modifier = Modifier.clickable { feature.process(PodcastDetailEvent.SortToggled) },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "Sort",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Icon(
                                imageVector = Icons.Default.MoreVert,
                                contentDescription = "Sort options",
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                // Loading indicator for episodes (when header already visible from cache)
                if (state.isLoading && state.episodes.isEmpty()) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(32.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator()
                        }
                    }
                }

                // Paged episode list
                if (sortedEpisodes.isNotEmpty()) {
                    item {
                        val pages = sortedEpisodes.chunked(10)
                        val pagerState = rememberPagerState(
                            initialPage = state.currentPage,
                            pageCount = { pages.size },
                        )
                        LaunchedEffect(pagerState.currentPage) {
                            if (pagerState.currentPage != state.currentPage) {
                                feature.process(PodcastDetailEvent.PageChanged(pagerState.currentPage))
                            }
                        }
                        Column {
                            HorizontalPager(
                                state = pagerState,
                                modifier = Modifier.wrapContentHeight(align = Alignment.Top),
                                verticalAlignment = Alignment.Top,
                            ) { pageIndex ->
                                Column {
                                    pages.getOrElse(pageIndex) { emptyList() }.forEach { episode ->
                                        EpisodeCard(
                                            episode = episode,
                                            isQueued = episode.guid in state.queuedGuids,
                                            onPlayTapped = { feature.process(PodcastDetailEvent.EpisodePlayTapped(episode)) },
                                            onQueueToggleTapped = { feature.process(PodcastDetailEvent.EpisodeQueueToggleTapped(episode)) },
                                        )
                                    }
                                }
                            }
                            // Page indicator
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 8.dp),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                IconButton(
                                    onClick = {
                                        coroutineScope.launch {
                                            pagerState.animateScrollToPage(pagerState.currentPage - 1)
                                        }
                                    },
                                    enabled = pagerState.currentPage > 0,
                                ) {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                        contentDescription = "Previous page",
                                    )
                                }
                                Text(
                                    text = "Page ${pagerState.currentPage + 1} / ${pages.size}",
                                    style = MaterialTheme.typography.labelMedium,
                                    modifier = Modifier.padding(horizontal = 8.dp),
                                )
                                IconButton(
                                    onClick = {
                                        coroutineScope.launch {
                                            pagerState.animateScrollToPage(pagerState.currentPage + 1)
                                        }
                                    },
                                    enabled = pagerState.currentPage < pages.size - 1,
                                ) {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                                        contentDescription = "Next page",
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = bottomContentPadding),
        )

        // Overlay back button
        IconButton(
            onClick = onBack,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(top = topContentPadding + 4.dp, start = 4.dp),
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Back",
                tint = MaterialTheme.colorScheme.onBackground,
            )
        }
    }

    // Login prompt sheet
    if (state.showLoginPrompt) {
        LoginPromptSheet(
            reason = LoginPromptReason.SUBSCRIBE,
            onSignIn = { feature.process(PodcastDetailEvent.LoginPromptSignInTapped) },
            onCreateAccount = { feature.process(PodcastDetailEvent.LoginPromptCreateAccountTapped) },
            onDismiss = { feature.process(PodcastDetailEvent.LoginPromptDismissed) },
        )
    }
}

@Composable
private fun EpisodeCard(
    episode: Episode,
    isQueued: Boolean,
    onPlayTapped: () -> Unit,
    onQueueToggleTapped: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer,
        ),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = episode.title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (episode.description.isNotEmpty()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = episode.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Date
                Icon(
                    imageVector = Icons.Default.CalendarToday,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = formatPubDate(episode.pubDate),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                // Duration
                episode.duration?.let {
                    Spacer(modifier = Modifier.width(12.dp))
                    Icon(
                        imageVector = Icons.Default.AccessTime,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = formatDuration(it),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(modifier = Modifier.weight(1f))
                // Add/remove from queue
                IconButton(
                    onClick = onQueueToggleTapped,
                    modifier = Modifier.size(32.dp),
                ) {
                    Icon(
                        imageVector = if (isQueued) Icons.Default.PlaylistRemove else Icons.AutoMirrored.Filled.PlaylistAdd,
                        contentDescription = if (isQueued) "Remove from queue" else "Add to queue",
                        modifier = Modifier.size(18.dp),
                        tint = if (isQueued) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(modifier = Modifier.width(4.dp))
                // Download
                IconButton(
                    onClick = { /* stub: download */ },
                    modifier = Modifier.size(32.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Download,
                        contentDescription = "Download",
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(modifier = Modifier.width(8.dp))
                // Circular play button
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.onSurface)
                        .clickable { onPlayTapped() },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = "Play episode",
                        modifier = Modifier.size(24.dp),
                        tint = MaterialTheme.colorScheme.surface,
                    )
                }
            }
        }
        // Progress bar at bottom of card
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(3.dp)
                .background(MaterialTheme.colorScheme.surfaceVariant),
        )
    }
}

/** Extract "Mon Day" from RFC 2822 pubDate strings like "Mon, 01 Jan 2024 00:00:00 +0000" */
private fun formatPubDate(pubDate: String): String {
    if (pubDate.isBlank()) return ""
    val parts = pubDate.trim().split(" ")
    // parts: ["Mon,", "01", "Jan", "2024", ...]
    return if (parts.size >= 3) "${parts[2]} ${parts[1].trimStart('0').ifEmpty { "0" }}" else pubDate
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
