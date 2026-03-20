package com.trilium.syncpods.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.trilium.syncpods.components.PodcastCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverScreen(
    feature: DiscoverFeature,
    onNavigateToPodcast: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by feature.state.collectAsState()

    LaunchedEffect(Unit) {
        feature.process(DiscoverEvent.ScreenVisible)
        feature.effects.collect { effect ->
            when (effect) {
                is DiscoverEffect.NavigateToPodcastDetail -> onNavigateToPodcast(effect.feedUrl)
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

        TextField(
            value = state.query,
            onValueChange = { feature.process(DiscoverEvent.QueryChanged(it)) },
            placeholder = { Text("Search podcasts, episodes…") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            singleLine = true,
            shape = MaterialTheme.shapes.extraLarge,
            colors = TextFieldDefaults.colors(
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
            ),
            modifier = Modifier.fillMaxWidth(),
        )

        LazyRow(
            contentPadding = PaddingValues(vertical = 12.dp),
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
            val podcasts = if (state.query.isBlank()) state.trendingPodcasts else state.searchResults

            if (state.query.isBlank()) {
                Text(
                    text = "Trending",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }

            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(bottom = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(podcasts) { podcast ->
                    PodcastCard(
                        podcast = podcast,
                        onClick = { feature.process(DiscoverEvent.PodcastTapped(podcast)) },
                    )
                }
            }
        }
    }
}
