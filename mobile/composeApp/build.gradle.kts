import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

val localProperties = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) load(f.inputStream())
}

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.kotlinSerialization)
}

kotlin {
    androidTarget {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_11)
        }
    }
    
    listOf(
        iosArm64(),
        iosSimulatorArm64()
    ).forEach { iosTarget ->
        iosTarget.binaries.framework {
            baseName = "ComposeApp"
            isStatic = true
        }
    }
    
    sourceSets {
        androidMain.dependencies {
            implementation(libs.compose.uiToolingPreview)
            implementation(libs.androidx.activity.compose)
            implementation(libs.ktor.client.android)
            implementation(libs.koin.android)
            implementation(libs.androidx.media3.exoplayer)
            implementation(libs.credentials)
            implementation(libs.credentials.play.services)
            implementation(libs.googleid)
        }
        commonMain.dependencies {
            implementation(libs.supabase.compose.auth)
            implementation(libs.compose.runtime)
            implementation(libs.compose.foundation)
            implementation(libs.compose.material3)
            implementation(libs.compose.ui)
            implementation(libs.compose.components.resources)
            implementation(libs.compose.uiToolingPreview)
            implementation(libs.androidx.lifecycle.viewmodelCompose)
            implementation(libs.androidx.lifecycle.runtimeCompose)
            implementation("io.github.reid-mcpherson:arch:1.0.2")
            implementation(libs.supabase.postgrest)
            implementation(libs.supabase.auth)
            implementation(libs.supabase.realtime)
            implementation(libs.ktor.client.core)
            implementation(libs.koin.compose)
            implementation(libs.koin.compose.viewmodel)
            implementation(libs.coil.compose)
            implementation(libs.coil.network.ktor)
            implementation(libs.kotlinx.datetime)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.navigation.compose)
            implementation(compose.materialIconsExtended)
            implementation(libs.sh.calvin.reorderable)
            implementation(libs.multiplatform.settings)
            implementation(libs.multiplatform.settings.serialization)
        }
        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.turbine)
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.multiplatform.settings.test)
        }
    }
}

android {
    namespace = "com.trilium.syncpods"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.trilium.syncpods"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "SUPABASE_URL", "\"${localProperties["SYNCPODS_SUPABASE_URL"] ?: project.findProperty("SYNCPODS_SUPABASE_URL") ?: ""}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"${localProperties["SYNCPODS_SUPABASE_ANON_KEY"] ?: project.findProperty("SYNCPODS_SUPABASE_ANON_KEY") ?: ""}\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"${localProperties["GOOGLE_WEB_CLIENT_ID"] ?: ""}\"")
    }
    buildFeatures {
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    debugImplementation(libs.compose.uiTooling)
}

val generateIosSecrets by tasks.registering {
    group = "ios"
    description = "Generates iosApp/Configuration/Secrets.xcconfig from local.properties"
    val secretsFile = rootProject.file("iosApp/Configuration/Secrets.xcconfig")
    outputs.file(secretsFile)
    // Capture values at configuration time so the task is configuration-cache compatible
    val googleWebClientId = localProperties["GOOGLE_WEB_CLIENT_ID"] as? String ?: ""
    val googleIosClientId = localProperties["GOOGLE_IOS_CLIENT_ID"] as? String ?: ""
    val googleIosReverseClientId = localProperties["GOOGLE_IOS_REVERSE_CLIENT_ID"] as? String ?: ""
    doLast {
        secretsFile.writeText(buildString {
            appendLine("// Auto-generated from local.properties — do not commit")
            appendLine("GOOGLE_WEB_CLIENT_ID = $googleWebClientId")
            appendLine("GOOGLE_IOS_CLIENT_ID = $googleIosClientId")
            appendLine("GIDClientID = $googleIosClientId")
            appendLine("GOOGLE_IOS_REVERSE_CLIENT_ID = $googleIosReverseClientId")
        })
    }
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinNativeLink>().configureEach {
    dependsOn(generateIosSecrets)
}

