-- Allow unauthenticated (anon) reads of public playlists and their episodes.
-- This replaces the createAdminClient() workaround in GET /api/playlists/[id].

create policy "Anyone can read public playlists" on public.playlists
  for select using (is_public = true);

create policy "Anyone can read episodes of public playlists" on public.playlist_episodes
  for select using (
    exists (
      select 1 from public.playlists
      where playlists.id = playlist_id
      and playlists.is_public = true
    )
  );
