package com.trilium.syncpods.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Whatshot
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.trilium.syncpods.components.PodcastCard
import com.trilium.syncpods.components.PodcastSearchBar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverScreen(
    feature: DiscoverFeature,
    onNavigateToPodcast: (String) -> Unit,
    onNavigateToSearch: (String) -> Unit,
    modifier: Modifier = Modifier,
    bottomContentPadding: Dp = 0.dp,
) {
    val state by feature.state.collectAsState()
    var localQuery by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(Unit) {
        feature.process(DiscoverEvent.ScreenVisible)
        feature.effects.collect { effect ->
            when (effect) {
                is DiscoverEffect.NavigateToPodcastDetail -> onNavigateToPodcast(effect.feedUrl)
                is DiscoverEffect.NavigateToSearch -> onNavigateToSearch(effect.query)
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
    ) {
        Text(
            text = "Discover",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(top = 16.dp, bottom = 12.dp),
        )

        PodcastSearchBar(
            value = localQuery,
            onValueChange = {
                localQuery = it
                feature.process(DiscoverEvent.SearchQueryChanged(it))
            },
            onSearch = { feature.process(DiscoverEvent.SearchSubmitted(localQuery)) },
            modifier = Modifier.fillMaxWidth(),
            suggestions = state.suggestions,
            isSuggestionsLoading = state.isSuggestionsLoading,
            onSuggestionClick = { feature.process(DiscoverEvent.SuggestionTapped(it)) },
            onFocusGained = {
                if (localQuery.isNotBlank()) feature.process(DiscoverEvent.SearchQueryChanged(localQuery))
            },
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
        ) {
            Icon(
                imageVector = Icons.Default.Whatshot,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(4.dp))
            Text(
                text = "Trending",
                style = MaterialTheme.typography.titleMedium,
            )
        }

        LazyRow(
            contentPadding = PaddingValues(vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(PODCAST_GENRES) { genre ->
                FilterChip(
                    selected = state.selectedGenreId == genre.id,
                    onClick = { feature.process(DiscoverEvent.GenreSelected(genre.id)) },
                    label = { Text(genre.label) },
                )
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.error != null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = state.error!!,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(bottom = 16.dp + bottomContentPadding),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(state.trendingPodcasts) { podcast ->
                    PodcastCard(
                        podcast = podcast,
                        onClick = { feature.process(DiscoverEvent.PodcastTapped(podcast)) },
                    )
                }
            }
        }
    }
}
