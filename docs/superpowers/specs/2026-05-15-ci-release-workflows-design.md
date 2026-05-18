# CI & Release Workflows Design

**Date:** 2026-05-15
**Scope:** Mobile (Android + iOS) GitHub Actions workflows
**Status:** Approved

## Overview

Two GitHub Actions workflow files under `.github/workflows/`:

| File | Trigger | Purpose |
|---|---|---|
| `mobile-ci.yml` | PR opened/updated, `mobile/**` changed | Run all unit tests |
| `mobile-release.yml` | Tag pushed matching `mobile/v*.*.*` | Run tests, build release artifacts, publish Android to Play Console |

## Workflow 1: PR CI (`mobile-ci.yml`)

### Trigger

```yaml
on:
  pull_request:
    paths:
      - 'mobile/**'
```

Skips the workflow entirely when only `web/` or `supabase/` files change.

### Jobs (parallel)

#### `android-tests` — `ubuntu-latest`

1. Checkout
2. Set up JDK 21
3. Cache Gradle wrapper + caches (keyed on `mobile/gradle/libs.versions.toml` hash)
4. Write `local.properties` from GitHub Secrets
5. `./gradlew :composeApp:testDebugUnitTest` — runs common + Android unit tests on JVM

#### `ios-tests` — `macos-latest`

1. Checkout
2. Set up JDK 21
3. Cache Gradle wrapper + caches
4. Write `local.properties` from GitHub Secrets
5. `./gradlew :composeApp:iosSimulatorArm64Test` — runs common tests compiled to iOS simulator target

Both jobs must pass for the PR check to be green. Branch protection rules should require both.

### Secrets required (CI)

| Secret name | Purpose |
|---|---|
| `SYNCPODS_SUPABASE_URL` | `buildConfigField` compilation |
| `SYNCPODS_SUPABASE_ANON_KEY` | `buildConfigField` compilation |
| `GOOGLE_WEB_CLIENT_ID` | `buildConfigField` compilation |

---

## Workflow 2: Release (`mobile-release.yml`)

### Trigger

```yaml
on:
  push:
    tags:
      - 'mobile/v*.*.*'
```

Example tag: `mobile/v1.2.3`

### Version derivation

The tag `mobile/v1.2.3` is parsed in a bash step:

```bash
TAG="${GITHUB_REF_NAME#mobile/v}"   # → "1.2.3"
IFS='.' read -r MAJOR MINOR PATCH <<< "$TAG"
VERSION_CODE=$((MAJOR * 10000 + MINOR * 100 + PATCH))   # → 10203
VERSION_NAME="$TAG"                                       # → "1.2.3"
```

Injected at build time via `-PversionCode=$VERSION_CODE -PversionName=$VERSION_NAME`.

### Jobs (parallel)

#### `android` — `ubuntu-latest`

1. Checkout (full history)
2. JDK 21 + Gradle cache
3. Extract version from tag (see above)
4. Write `local.properties` from secrets (Supabase, Google, signing config)
5. Decode `RELEASE_KEYSTORE_BASE64` → `$RUNNER_TEMP/release.jks`; write the following into `local.properties`:
   - `KEYSTORE_PATH=$RUNNER_TEMP/release.jks`
   - `KEYSTORE_PASSWORD` / `KEY_ALIAS` / `KEY_PASSWORD` from their respective secrets
6. `./gradlew :composeApp:testDebugUnitTest` — tests must pass before building
7. `./gradlew :composeApp:bundleRelease -PversionCode=… -PversionName=…` — build signed AAB
8. `./gradlew :composeApp:publishReleaseBundle` — GPP uploads AAB to Play Console internal track

#### `ios-build` — `macos-latest`

1. Checkout + JDK 21 + Gradle cache
2. Write `local.properties` from secrets
3. Extract version from tag
4. `./gradlew :composeApp:assembleReleaseXCFramework` — build shared Kotlin framework
5. `xcodebuild archive -project iosApp/iosApp.xcodeproj -scheme iosApp -configuration Release -archivePath build/iosApp.xcarchive CODE_SIGNING_ALLOWED=NO` — verifies the iOS app compiles cleanly
6. Archive artifact is not exported or uploaded (future: TestFlight/App Store upload)

Both jobs must pass for the release to be considered successful.

### Secrets required (release, in addition to CI secrets)

| Secret name | Purpose |
|---|---|
| `RELEASE_KEYSTORE_BASE64` | Base64-encoded `.jks` keystore file |
| `RELEASE_KEYSTORE_PASSWORD` | Keystore store password |
| `RELEASE_KEY_ALIAS` | Key alias within the keystore |
| `RELEASE_KEY_PASSWORD` | Key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | Full JSON content of Play Console service account key — written to `$RUNNER_TEMP/play-service-account.json` in CI; path set as `PLAY_SERVICE_ACCOUNT_JSON_PATH` in `local.properties` |

---

## `build.gradle.kts` changes

### Version from Gradle properties

```kotlin
defaultConfig {
    versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
    versionName = project.findProperty("versionName") as String? ?: "1.0"
    // ...existing buildConfigFields...
}
```

### Signing config

```kotlin
signingConfigs {
    create("release") {
        storeFile = file(localProperties["KEYSTORE_PATH"] as String? ?: "")
        storePassword = localProperties["KEYSTORE_PASSWORD"] as String? ?: ""
        keyAlias = localProperties["KEY_ALIAS"] as String? ?: ""
        keyPassword = localProperties["KEY_PASSWORD"] as String? ?: ""
    }
}
buildTypes {
    getByName("release") {
        isMinifyEnabled = false
        signingConfig = signingConfigs.getByName("release")
    }
}
```

### GPP plugin

Added to `plugins {}` block:
```kotlin
id("com.github.triplet.play") version "3.10.1"
```

Configuration:
```kotlin
play {
    serviceAccountCredentials.set(file(localProperties["PLAY_SERVICE_ACCOUNT_JSON_PATH"] as String? ?: ""))
    track.set("internal")
    defaultToAppBundles.set(true)
}
```

GPP plugin also added to `plugins {}` in root `build.gradle.kts` with `apply false`.

---

## Out of scope

- iOS App Store / TestFlight upload (placeholder job exists, upload logic deferred)
- Web CI/CD workflows
- Supabase migration CI
- Android emulator tests (instrumented tests require AVD; deferred)
- Code coverage reporting
