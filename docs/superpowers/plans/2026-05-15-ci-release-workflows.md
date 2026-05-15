# CI & Release Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two GitHub Actions workflows — one that runs mobile unit tests on PRs, one that builds and publishes a signed Android release (and verifies the iOS build) on version tags.

**Architecture:** Two independent YAML files in `.github/workflows/`. `build.gradle.kts` is updated to read `versionCode`/`versionName` from Gradle properties, conditionally apply a signing config from `local.properties`, and configure GPP for Play Console upload. All secrets are written to `local.properties` at CI runtime from GitHub Secrets. The release workflow triggers on tags matching `mobile/v*.*.*`.

**Tech Stack:** GitHub Actions (`actions/checkout@v4`, `actions/setup-java@v4`, `actions/cache@v4`), Gradle Kotlin DSL, GPP plugin `com.github.triplet.play:3.10.1`, `xcodebuild`

---

### Task 1: Add GPP plugin to version catalog and root build

**Files:**
- Modify: `mobile/gradle/libs.versions.toml`
- Modify: `mobile/build.gradle.kts`

- [ ] **Step 1: Add GPP version entry to `libs.versions.toml`**

In `mobile/gradle/libs.versions.toml`, add to the `[versions]` section (after the last entry):

```toml
gradlePlayPublisher = "3.10.1"
```

> Verify this is the latest stable release at https://github.com/Triple-T/gradle-play-publisher/releases before proceeding.

- [ ] **Step 2: Add GPP plugin entry to `libs.versions.toml`**

In `mobile/gradle/libs.versions.toml`, add to the `[plugins]` section (after the `kotlinSerialization` line):

```toml
gradlePlayPublisher = { id = "com.github.triplet.play", version.ref = "gradlePlayPublisher" }
```

- [ ] **Step 3: Add GPP to root `build.gradle.kts` with `apply false`**

In `mobile/build.gradle.kts`, the full `plugins {}` block should become:

```kotlin
plugins {
    // this is necessary to avoid the plugins to be loaded multiple times
    // in each subproject's classloader
    alias(libs.plugins.androidApplication) apply false
    alias(libs.plugins.androidLibrary) apply false
    alias(libs.plugins.composeMultiplatform) apply false
    alias(libs.plugins.composeCompiler) apply false
    alias(libs.plugins.kotlinMultiplatform) apply false
    alias(libs.plugins.gradlePlayPublisher) apply false
}
```

- [ ] **Step 4: Verify build parses cleanly**

```bash
cd mobile
./gradlew help
```

Expected: `BUILD SUCCESSFUL` — confirms all build files parse without errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/gradle/libs.versions.toml mobile/build.gradle.kts
git commit -m "build: add gradle-play-publisher plugin to version catalog"
```

---

### Task 2: Update `composeApp/build.gradle.kts` for versioning, signing, and GPP

**Files:**
- Modify: `mobile/composeApp/build.gradle.kts`

- [ ] **Step 1: Apply GPP plugin in the `plugins {}` block**

Replace the existing `plugins {}` block (lines 10–16 of `composeApp/build.gradle.kts`) with:

```kotlin
plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.gradlePlayPublisher)
}
```

- [ ] **Step 2: Change `versionCode` and `versionName` to read from Gradle properties**

In the `android { defaultConfig { ... } }` block, replace:

```kotlin
        versionCode = 1
        versionName = "1.0"
```

with:

```kotlin
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = project.findProperty("versionName") as String? ?: "1.0"
```

When `-PversionCode=10203 -PversionName=1.2.3` is passed to Gradle (as done in the release workflow), these override the fallback values. Local builds continue to use `1` and `"1.0"`.

- [ ] **Step 3: Replace `buildTypes` block with conditional signing config + updated `buildTypes`**

In `mobile/composeApp/build.gradle.kts`, replace:

```kotlin
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
        }
    }
```

with:

```kotlin
    val keystorePath = localProperties["KEYSTORE_PATH"] as? String
    if (!keystorePath.isNullOrEmpty()) {
        signingConfigs {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = localProperties["KEYSTORE_PASSWORD"] as? String ?: ""
                keyAlias = localProperties["KEY_ALIAS"] as? String ?: ""
                keyPassword = localProperties["KEY_PASSWORD"] as? String ?: ""
            }
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            if (!keystorePath.isNullOrEmpty()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
```

When `KEYSTORE_PATH` is absent (local dev), the release build is unsigned. In CI, `KEYSTORE_PATH` is written to `local.properties` before Gradle runs, so the signing config is applied.

- [ ] **Step 4: Add `play {}` block after the `android {}` closing brace**

Insert after the closing `}` of the `android { ... }` block and before `dependencies { ... }`:

```kotlin
play {
    serviceAccountCredentials.set(
        file(localProperties["PLAY_SERVICE_ACCOUNT_JSON_PATH"] as? String ?: "play-credentials-not-configured.json")
    )
    track.set("internal")
    defaultToAppBundles.set(true)
}
```

The fallback `"play-credentials-not-configured.json"` is only accessed when `publishReleaseBundle` actually runs — it causes no issues for regular `assembleDebug` or `testDebugUnitTest` calls.

- [ ] **Step 5: Verify debug build still compiles**

```bash
cd mobile
./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: Verify unit tests still pass**

```bash
./gradlew :composeApp:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL` with all tests passing

- [ ] **Step 7: Commit**

```bash
git add mobile/composeApp/build.gradle.kts
git commit -m "build: add GPP plugin, conditional signing config, and version properties to composeApp"
```

---

### Task 3: Create PR CI workflow

**Files:**
- Create: `.github/workflows/mobile-ci.yml`

- [ ] **Step 1: Create the `.github/workflows/` directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create `.github/workflows/mobile-ci.yml`** with the following content:

```yaml
name: Mobile CI

on:
  pull_request:
    paths:
      - 'mobile/**'

jobs:
  android-tests:
    name: Android Unit Tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mobile

    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Cache Gradle
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: ${{ runner.os }}-gradle-${{ hashFiles('mobile/gradle/libs.versions.toml') }}
          restore-keys: ${{ runner.os }}-gradle-

      - name: Write local.properties
        env:
          SUPABASE_URL: ${{ secrets.SYNCPODS_SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SYNCPODS_SUPABASE_ANON_KEY }}
          GWC_ID: ${{ secrets.GOOGLE_WEB_CLIENT_ID }}
        run: |
          echo "SYNCPODS_SUPABASE_URL=$SUPABASE_URL" >> local.properties
          echo "SYNCPODS_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" >> local.properties
          echo "GOOGLE_WEB_CLIENT_ID=$GWC_ID" >> local.properties

      - name: Run Android unit tests
        run: ./gradlew :composeApp:testDebugUnitTest

  ios-tests:
    name: iOS Unit Tests
    runs-on: macos-latest
    defaults:
      run:
        working-directory: mobile

    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Cache Gradle
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: ${{ runner.os }}-gradle-${{ hashFiles('mobile/gradle/libs.versions.toml') }}
          restore-keys: ${{ runner.os }}-gradle-

      - name: Write local.properties
        env:
          SUPABASE_URL: ${{ secrets.SYNCPODS_SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SYNCPODS_SUPABASE_ANON_KEY }}
          GWC_ID: ${{ secrets.GOOGLE_WEB_CLIENT_ID }}
        run: |
          echo "SYNCPODS_SUPABASE_URL=$SUPABASE_URL" >> local.properties
          echo "SYNCPODS_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" >> local.properties
          echo "GOOGLE_WEB_CLIENT_ID=$GWC_ID" >> local.properties

      - name: Run iOS unit tests
        run: ./gradlew :composeApp:iosSimulatorArm64Test
```

- [ ] **Step 3: Verify YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/mobile-ci.yml')); print('YAML valid')"
```

Expected: `YAML valid`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/mobile-ci.yml
git commit -m "ci: add mobile PR test workflow (Android + iOS parallel jobs)"
```

---

### Task 4: Create release workflow

**Files:**
- Create: `.github/workflows/mobile-release.yml`

- [ ] **Step 1: Create `.github/workflows/mobile-release.yml`** with the following content:

```yaml
name: Mobile Release

on:
  push:
    tags:
      - 'mobile/v*.*.*'

jobs:
  android:
    name: Android Release Build & Publish
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mobile

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Cache Gradle
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: ${{ runner.os }}-gradle-${{ hashFiles('mobile/gradle/libs.versions.toml') }}
          restore-keys: ${{ runner.os }}-gradle-

      - name: Extract version from tag
        id: version
        run: |
          TAG="${GITHUB_REF_NAME#mobile/v}"
          IFS='.' read -r MAJOR MINOR PATCH <<< "$TAG"
          VERSION_CODE=$((MAJOR * 10000 + MINOR * 100 + PATCH))
          echo "version_code=$VERSION_CODE" >> $GITHUB_OUTPUT
          echo "version_name=$TAG" >> $GITHUB_OUTPUT

      - name: Decode keystore
        run: echo "${{ secrets.RELEASE_KEYSTORE_BASE64 }}" | base64 --decode > $RUNNER_TEMP/release.jks

      - name: Write Play service account JSON
        env:
          PLAY_JSON: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}
        run: echo "$PLAY_JSON" > $RUNNER_TEMP/play-service-account.json

      - name: Write local.properties
        env:
          SUPABASE_URL: ${{ secrets.SYNCPODS_SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SYNCPODS_SUPABASE_ANON_KEY }}
          GWC_ID: ${{ secrets.GOOGLE_WEB_CLIENT_ID }}
          KS_PASSWORD: ${{ secrets.RELEASE_KEYSTORE_PASSWORD }}
          K_ALIAS: ${{ secrets.RELEASE_KEY_ALIAS }}
          K_PASSWORD: ${{ secrets.RELEASE_KEY_PASSWORD }}
        run: |
          echo "SYNCPODS_SUPABASE_URL=$SUPABASE_URL" >> local.properties
          echo "SYNCPODS_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" >> local.properties
          echo "GOOGLE_WEB_CLIENT_ID=$GWC_ID" >> local.properties
          echo "KEYSTORE_PATH=$RUNNER_TEMP/release.jks" >> local.properties
          echo "KEYSTORE_PASSWORD=$KS_PASSWORD" >> local.properties
          echo "KEY_ALIAS=$K_ALIAS" >> local.properties
          echo "KEY_PASSWORD=$K_PASSWORD" >> local.properties
          echo "PLAY_SERVICE_ACCOUNT_JSON_PATH=$RUNNER_TEMP/play-service-account.json" >> local.properties

      - name: Run tests
        run: ./gradlew :composeApp:testDebugUnitTest

      - name: Build & publish to Play Console (internal track)
        run: |
          ./gradlew :composeApp:publishReleaseBundle \
            -PversionCode=${{ steps.version.outputs.version_code }} \
            -PversionName=${{ steps.version.outputs.version_name }}

  ios-build:
    name: iOS Release Build
    runs-on: macos-latest
    defaults:
      run:
        working-directory: mobile

    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Cache Gradle
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: ${{ runner.os }}-gradle-${{ hashFiles('mobile/gradle/libs.versions.toml') }}
          restore-keys: ${{ runner.os }}-gradle-

      - name: Write local.properties
        env:
          SUPABASE_URL: ${{ secrets.SYNCPODS_SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SYNCPODS_SUPABASE_ANON_KEY }}
          GWC_ID: ${{ secrets.GOOGLE_WEB_CLIENT_ID }}
        run: |
          echo "SYNCPODS_SUPABASE_URL=$SUPABASE_URL" >> local.properties
          echo "SYNCPODS_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" >> local.properties
          echo "GOOGLE_WEB_CLIENT_ID=$GWC_ID" >> local.properties

      - name: Build iOS archive (no signing)
        run: |
          xcodebuild archive \
            -project iosApp/iosApp.xcodeproj \
            -scheme iosApp \
            -configuration Release \
            -destination "generic/platform=iOS" \
            -archivePath $RUNNER_TEMP/iosApp.xcarchive \
            CODE_SIGNING_ALLOWED=NO
```

> **Note on the iOS build:** The `xcodebuild archive` step triggers the project's Run Script build phase, which calls `./gradlew :composeApp:embedAndSignAppleFrameworkForXcode` internally. JDK 21 and Gradle cache are set up before this step, so Gradle is available. The archive is not exported or uploaded — that is deferred to a future task when TestFlight/App Store upload is added.

- [ ] **Step 2: Verify YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/mobile-release.yml')); print('YAML valid')"
```

Expected: `YAML valid`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/mobile-release.yml
git commit -m "ci: add mobile release workflow (Android publish + iOS archive)"
```

---

### Task 5: Configure GitHub Secrets

This is a manual step in the GitHub repository settings. Navigate to **Settings → Secrets and variables → Actions → New repository secret** for each of the following.

**Required for both workflows (CI + release):**

| Secret name | How to get it |
|---|---|
| `SYNCPODS_SUPABASE_URL` | Copy from your `local.properties` |
| `SYNCPODS_SUPABASE_ANON_KEY` | Copy from your `local.properties` |
| `GOOGLE_WEB_CLIENT_ID` | Copy from your `local.properties` |

**Required for release workflow only:**

| Secret name | How to get it |
|---|---|
| `RELEASE_KEYSTORE_BASE64` | `base64 -i release.jks \| pbcopy` — if you don't have a keystore yet, generate one first (see note below) |
| `RELEASE_KEYSTORE_PASSWORD` | The password you set when generating the keystore |
| `RELEASE_KEY_ALIAS` | The alias you set when generating the keystore |
| `RELEASE_KEY_PASSWORD` | The key password (often same as store password) |
| `PLAY_SERVICE_ACCOUNT_JSON` | Full JSON content of a Google Play service account key (see note below) |

**Generating a release keystore (if you don't have one):**

```bash
keytool -genkey -v \
  -keystore release.jks \
  -alias syncpods \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Store `release.jks` somewhere safe (e.g., a local password manager) — losing it means you can never update the app on the Play Store.

**Creating a Play Console service account:**
1. Go to [Play Console](https://play.google.com/console) → Setup → API access
2. Link to a Google Cloud project (or create one)
3. Create a service account with **Release to internal testing** permission
4. Download the JSON key — paste its entire contents as `PLAY_SERVICE_ACCOUNT_JSON`

**Prerequisites for `publishReleaseBundle` to succeed:**
- The app (`com.trilium.syncpods`) must already exist in Play Console (at least one manual APK/AAB upload required to create the listing)

- [ ] **Confirm all 8 secrets are added to the repository**

---

### Task 6: Verify end-to-end

- [ ] **Enable branch protection:** In GitHub → Settings → Branches → Add branch protection rule for `main`. Under "Require status checks to pass before merging", add both `Android Unit Tests` and `iOS Unit Tests` as required checks. This prevents merging a PR when either job fails.

- [ ] **Test the CI workflow:** Open a PR that touches any file under `mobile/`. Confirm both `android-tests` and `ios-tests` jobs appear and pass in the GitHub Actions tab.

- [ ] **Test the release workflow:** Push a tag:

```bash
git tag mobile/v0.1.0
git push origin mobile/v0.1.0
```

Confirm both `android` and `ios-build` jobs run. The `android` job should publish an AAB to the Play Console internal track. The `ios-build` job should complete the archive step without errors.
