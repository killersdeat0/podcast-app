# Dev/Prod Environment Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs that cause both Android and iOS release builds to connect to the DEV Supabase endpoint instead of PROD, and thread the prod credentials through CI.

**Architecture:** `SelectedEnvironment` is the single object that holds the active URL/key at runtime. Android initializes it in `Platform.android.kt` based on `BuildConfig.DEBUG`; `MainActivity` then overrides it for debug builds only (dev/prod toggle via SharedPrefs). iOS initializes it in `initSelectedEnvironment()` based on `KNPlatform.isDebugBinary`. Both are one-line logic fixes. The old redundant `SUPABASE_URL`/`SUPABASE_ANON_KEY` `buildConfigField` entries are removed as cleanup.

**Tech Stack:** Kotlin Multiplatform, Android `BuildConfig`, Kotlin/Native `Platform.isDebugBinary`, GitHub Actions YAML

---

### Task 1: Fix Android `SelectedEnvironment` default and remove old BuildConfig fields

**Files:**
- Modify: `mobile/composeApp/src/androidMain/kotlin/com/trilium/syncpods/Platform.android.kt` — lines 13–16
- Modify: `mobile/composeApp/build.gradle.kts` — lines 99–100

- [ ] **Step 1: Fix `SelectedEnvironment` default in `Platform.android.kt`**

The file is at `mobile/composeApp/src/androidMain/kotlin/com/trilium/syncpods/Platform.android.kt`.

Replace:
```kotlin
object SelectedEnvironment {
    var url: String = BuildConfig.SUPABASE_URL
    var key: String = BuildConfig.SUPABASE_ANON_KEY
}
```

with:
```kotlin
object SelectedEnvironment {
    var url: String = if (BuildConfig.DEBUG) BuildConfig.DEV_SUPABASE_URL else BuildConfig.PROD_SUPABASE_URL
    var key: String = if (BuildConfig.DEBUG) BuildConfig.DEV_SUPABASE_ANON_KEY else BuildConfig.PROD_SUPABASE_ANON_KEY
}
```

Debug builds default to DEV (and `MainActivity` may further override to PROD if the user toggled dev settings). Release builds default to PROD and are never overridden.

- [ ] **Step 2: Remove old redundant `buildConfigField` entries from `build.gradle.kts`**

The file is at `mobile/composeApp/build.gradle.kts`. Inside `android { defaultConfig { ... } }`, remove these two lines (currently lines 99–100):

```kotlin
        buildConfigField("String", "SUPABASE_URL", "\"${localProperties["SYNCPODS_SUPABASE_URL"] ?: project.findProperty("SYNCPODS_SUPABASE_URL") ?: ""}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"${localProperties["SYNCPODS_SUPABASE_ANON_KEY"] ?: project.findProperty("SYNCPODS_SUPABASE_ANON_KEY") ?: ""}\"")
```

After removal the `defaultConfig` block should have exactly these `buildConfigField` lines (and nothing for `SUPABASE_URL` or `SUPABASE_ANON_KEY`):
```kotlin
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"${localProperties["GOOGLE_WEB_CLIENT_ID"] ?: ""}\"")
        buildConfigField("String", "DEV_SUPABASE_URL", "\"${localProperties["SYNCPODS_SUPABASE_URL"] ?: project.findProperty("SYNCPODS_SUPABASE_URL") ?: ""}\"")
        buildConfigField("String", "DEV_SUPABASE_ANON_KEY", "\"${localProperties["SYNCPODS_SUPABASE_ANON_KEY"] ?: project.findProperty("SYNCPODS_SUPABASE_ANON_KEY") ?: ""}\"")
        buildConfigField("String", "PROD_SUPABASE_URL", "\"${localProperties["SYNCPODS_PROD_SUPABASE_URL"] ?: project.findProperty("SYNCPODS_PROD_SUPABASE_URL") ?: ""}\"")
        buildConfigField("String", "PROD_SUPABASE_ANON_KEY", "\"${localProperties["SYNCPODS_PROD_SUPABASE_ANON_KEY"] ?: project.findProperty("SYNCPODS_PROD_SUPABASE_ANON_KEY") ?: ""}\"")
```

- [ ] **Step 3: Verify debug build compiles without the old fields**

```bash
cd /path/to/repo/mobile
./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL` — confirms `Platform.android.kt` no longer references the removed `BuildConfig.SUPABASE_URL`/`SUPABASE_ANON_KEY` fields.

- [ ] **Step 4: Verify release build compiles and picks up prod keys**

```bash
./gradlew :composeApp:bundleRelease
```

Expected: `BUILD SUCCESSFUL` — confirms `BuildConfig.PROD_SUPABASE_URL` and `BuildConfig.PROD_SUPABASE_ANON_KEY` resolve correctly from `local.properties`.

- [ ] **Step 5: Verify unit tests still pass**

```bash
./gradlew :composeApp:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL` with all tests passing.

- [ ] **Step 6: Commit**

```bash
git add mobile/composeApp/src/androidMain/kotlin/com/trilium/syncpods/Platform.android.kt
git add mobile/composeApp/build.gradle.kts
git commit -m "fix: route Android release builds to PROD Supabase endpoint"
```

---

### Task 2: Fix iOS environment selection for release binaries

**Files:**
- Modify: `mobile/composeApp/src/iosMain/kotlin/com/trilium/syncpods/di/PlatformModule.ios.kt` — line 39

- [ ] **Step 1: Fix `initSelectedEnvironment()` logic in `PlatformModule.ios.kt`**

The file is at `mobile/composeApp/src/iosMain/kotlin/com/trilium/syncpods/di/PlatformModule.ios.kt`.

Replace line 39:
```kotlin
    val useProd = KNPlatform.isDebugBinary && env == "prod"
```

with:
```kotlin
    val useProd = !KNPlatform.isDebugBinary || env == "prod"
```

`KNPlatform.isDebugBinary` is `true` for debug builds and `false` for release builds.

- Old logic: `true && "prod"` → only debug builds that explicitly picked PROD ever use PROD. Release builds (`false && anything`) always evaluate to `false` → always DEV. **Bug.**
- New logic: `!false` → release binaries always get `true` → always PROD. Debug binaries check the dev-settings pref as before.

The full `initSelectedEnvironment()` function after the fix:
```kotlin
fun initSelectedEnvironment() {
    val bundle = NSBundle.mainBundle
    val devUrl = bundle.objectForInfoDictionaryKey("SUPABASE_URL") as? String ?: ""
    val devKey = bundle.objectForInfoDictionaryKey("SUPABASE_ANON_KEY") as? String ?: ""
    val prodUrl = bundle.objectForInfoDictionaryKey("PROD_SUPABASE_URL") as? String ?: ""
    val prodKey = bundle.objectForInfoDictionaryKey("PROD_SUPABASE_ANON_KEY") as? String ?: ""

    val userDefaults = NSUserDefaults.standardUserDefaults
    val env = userDefaults.stringForKey(DEV_SETTINGS_ENV_KEY) ?: "dev"
    val useProd = !KNPlatform.isDebugBinary || env == "prod"

    SelectedEnvironment.url = if (useProd) prodUrl else devUrl
    SelectedEnvironment.key = if (useProd) prodKey else devKey
}
```

- [ ] **Step 2: Verify Kotlin/Native compilation succeeds**

```bash
cd /path/to/repo/mobile
./gradlew :composeApp:compileKotlinIosSimulatorArm64
```

Expected: `BUILD SUCCESSFUL` — confirms the iOS source set compiles with the updated logic.

- [ ] **Step 3: Verify unit tests still pass**

```bash
./gradlew :composeApp:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL` — the common and Android tests are unaffected by an iosMain change.

- [ ] **Step 4: Commit**

```bash
git add mobile/composeApp/src/iosMain/kotlin/com/trilium/syncpods/di/PlatformModule.ios.kt
git commit -m "fix: route iOS release binaries to PROD Supabase endpoint"
```

---

### Task 3: Add prod credentials to CI workflow local.properties write steps

**Files:**
- Modify: `.github/workflows/mobile-ci.yml` — two `Write local.properties` steps (android-tests job lines 34–42, ios-tests job lines 72–80)
- Modify: `.github/workflows/mobile-release.yml` — two `Write local.properties` steps (android job lines 55–71, ios-build job lines 107–115)

All four `buildConfigField` entries (`DEV_*` and `PROD_*`) are compiled into every Gradle build, so every CI job that invokes Gradle needs the prod keys present in `local.properties`.

- [ ] **Step 1: Update `android-tests` job in `mobile-ci.yml`**

In `.github/workflows/mobile-ci.yml`, replace the `Write local.properties` step in the `android-tests` job (currently lines 34–42):

```yaml
      - name: Write local.properties
        env:
          SUPABASE_URL: ${{ secrets.SYNCPODS_SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SYNCPODS_SUPABASE_ANON_KEY }}
          GWC_ID: ${{ secrets.GOOGLE_WEB_CLIENT_ID }}
          PROD_URL: ${{ secrets.SYNCPODS_PROD_SUPABASE_URL }}
          PROD_KEY: ${{ secrets.SYNCPODS_PROD_SUPABASE_ANON_KEY }}
        run: |
          echo "SYNCPODS_SUPABASE_URL=$SUPABASE_URL" >> local.properties
          echo "SYNCPODS_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" >> local.properties
          echo "GOOGLE_WEB_CLIENT_ID=$GWC_ID" >> local.properties
          echo "SYNCPODS_PROD_SUPABASE_URL=$PROD_URL" >> local.properties
          echo "SYNCPODS_PROD_SUPABASE_ANON_KEY=$PROD_KEY" >> local.properties
```

- [ ] **Step 2: Update `ios-tests` job in `mobile-ci.yml`**

In `.github/workflows/mobile-ci.yml`, replace the `Write local.properties` step in the `ios-tests` job (currently lines 72–80) with the same updated block:

```yaml
      - name: Write local.properties
        env:
          SUPABASE_URL: ${{ secrets.SYNCPODS_SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SYNCPODS_SUPABASE_ANON_KEY }}
          GWC_ID: ${{ secrets.GOOGLE_WEB_CLIENT_ID }}
          PROD_URL: ${{ secrets.SYNCPODS_PROD_SUPABASE_URL }}
          PROD_KEY: ${{ secrets.SYNCPODS_PROD_SUPABASE_ANON_KEY }}
        run: |
          echo "SYNCPODS_SUPABASE_URL=$SUPABASE_URL" >> local.properties
          echo "SYNCPODS_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" >> local.properties
          echo "GOOGLE_WEB_CLIENT_ID=$GWC_ID" >> local.properties
          echo "SYNCPODS_PROD_SUPABASE_URL=$PROD_URL" >> local.properties
          echo "SYNCPODS_PROD_SUPABASE_ANON_KEY=$PROD_KEY" >> local.properties
```

- [ ] **Step 3: Update `android` job in `mobile-release.yml`**

In `.github/workflows/mobile-release.yml`, replace the `Write local.properties` step in the `android` job (currently lines 55–71):

```yaml
      - name: Write local.properties
        env:
          SUPABASE_URL: ${{ secrets.SYNCPODS_SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SYNCPODS_SUPABASE_ANON_KEY }}
          GWC_ID: ${{ secrets.GOOGLE_WEB_CLIENT_ID }}
          KS_PASSWORD: ${{ secrets.RELEASE_KEYSTORE_PASSWORD }}
          K_ALIAS: ${{ secrets.RELEASE_KEY_ALIAS }}
          K_PASSWORD: ${{ secrets.RELEASE_KEY_PASSWORD }}
          PROD_URL: ${{ secrets.SYNCPODS_PROD_SUPABASE_URL }}
          PROD_KEY: ${{ secrets.SYNCPODS_PROD_SUPABASE_ANON_KEY }}
        run: |
          echo "SYNCPODS_SUPABASE_URL=$SUPABASE_URL" >> local.properties
          echo "SYNCPODS_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" >> local.properties
          echo "GOOGLE_WEB_CLIENT_ID=$GWC_ID" >> local.properties
          echo "KEYSTORE_PATH=$RUNNER_TEMP/release.jks" >> local.properties
          echo "KEYSTORE_PASSWORD=$KS_PASSWORD" >> local.properties
          echo "KEY_ALIAS=$K_ALIAS" >> local.properties
          echo "KEY_PASSWORD=$K_PASSWORD" >> local.properties
          echo "PLAY_SERVICE_ACCOUNT_JSON_PATH=$RUNNER_TEMP/play-service-account.json" >> local.properties
          echo "SYNCPODS_PROD_SUPABASE_URL=$PROD_URL" >> local.properties
          echo "SYNCPODS_PROD_SUPABASE_ANON_KEY=$PROD_KEY" >> local.properties
```

- [ ] **Step 4: Update `ios-build` job in `mobile-release.yml`**

In `.github/workflows/mobile-release.yml`, replace the `Write local.properties` step in the `ios-build` job (currently lines 107–115):

```yaml
      - name: Write local.properties
        env:
          SUPABASE_URL: ${{ secrets.SYNCPODS_SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SYNCPODS_SUPABASE_ANON_KEY }}
          GWC_ID: ${{ secrets.GOOGLE_WEB_CLIENT_ID }}
          PROD_URL: ${{ secrets.SYNCPODS_PROD_SUPABASE_URL }}
          PROD_KEY: ${{ secrets.SYNCPODS_PROD_SUPABASE_ANON_KEY }}
        run: |
          echo "SYNCPODS_SUPABASE_URL=$SUPABASE_URL" >> local.properties
          echo "SYNCPODS_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" >> local.properties
          echo "GOOGLE_WEB_CLIENT_ID=$GWC_ID" >> local.properties
          echo "SYNCPODS_PROD_SUPABASE_URL=$PROD_URL" >> local.properties
          echo "SYNCPODS_PROD_SUPABASE_ANON_KEY=$PROD_KEY" >> local.properties
```

- [ ] **Step 5: Verify YAML syntax of both files**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/mobile-ci.yml')); print('CI YAML valid')"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/mobile-release.yml')); print('Release YAML valid')"
```

Expected:
```
CI YAML valid
Release YAML valid
```

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/mobile-ci.yml .github/workflows/mobile-release.yml
git commit -m "ci: add PROD Supabase credentials to all local.properties write steps"
```

---

### Post-implementation: Add GitHub Secrets

Two new secrets must be added to the GitHub repository before CI will work with the prod credentials:

Navigate to **GitHub → Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|---|---|
| `SYNCPODS_PROD_SUPABASE_URL` | The PROD Supabase project URL (from your `local.properties`) |
| `SYNCPODS_PROD_SUPABASE_ANON_KEY` | The PROD Supabase anon key (from your `local.properties`) |
