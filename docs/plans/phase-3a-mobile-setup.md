# Phase 3a — Mobile Setup

## Goal
Copy the SyncPods Compose Multiplatform project into the monorepo and wire it up to the
shared Supabase backend so both web and mobile share a single source of truth for podcast data.

## Planned

### Setup
- [ ] Restructure repo into monorepo (`/web`, `/mobile`, shared `/packages`)
- [ ] Copy SyncPods CMP project (`/Users/personal/AndroidStudioProjects/SyncPods`) → `/mobile`
      and strip `.git` entirely: `cp -r SyncPods /mobile && rm -rf /mobile/.git`
      (also exclude `.gradle`, `build/`, `.idea/`, `.kotlin/`, `local.properties`)
- [ ] Add Supabase KMP client to `/mobile` (`io.github.jan-tennerd:supabase-kt`)
- [ ] Configure Supabase client via expect/actual (Android + iOS)
- [ ] Update `/mobile/.env.example` — replace `EXPO_PUBLIC_` prefixes with `SYNCPODS_`
      (read via BuildConfig on Android, Info.plist on iOS)
- [ ] Add Compose Multiplatform Navigation (`org.jetbrains.androidx.navigation:navigation-compose`) for screen routing
- [ ] Add remaining libs to `gradle/libs.versions.toml`: Ktor, Koin, Coil, kotlinx-datetime,
      kotlinx-serialization (check composeApp/build.gradle.kts — arch lib may already be present)

### API Architecture
Mobile calls Supabase directly — no Next.js API layer needed for data. The RSS and search
logic must be extracted to Edge Functions so mobile can call them without going through the
web server.

- [ ] Extract `/api/podcasts/feed` (RSS parser) → Supabase Edge Function
- [ ] Extract `/api/podcasts/search` (iTunes proxy) → Supabase Edge Function
- [ ] Update web app to call Edge Functions instead of its own API routes (single source of truth)
- [ ] Mobile calls Supabase client directly for all data (progress, queue, subscriptions, history) — RLS enforces security

### Architecture Standard
All features follow the UDF pipeline from the `composure` arch library (`io.github.reid-mcpherson:arch:1.0.2`):

```
Event → [eventToAction] → Action → [actionToResult] → Result → [handleResult] → State
                                                                      ↓
                                                                   Effect (optional, one-time)
```

Feature-first package structure:
```
commonMain/kotlin/com/trilium/syncpods/
└── <feature>/
    ├── <Feature>Feature.kt   ← STATE, EVENT, ACTION, RESULT, EFFECT + StandardFeature subclass
    └── <Feature>Screen.kt    ← @Composable, maps State → UI, forwards gestures as Events
androidMain/kotlin/com/trilium/syncpods/
└── <feature>/
    └── <Feature>ViewModel.kt ← thin ViewModel, owns CoroutineScope for the Feature
```
