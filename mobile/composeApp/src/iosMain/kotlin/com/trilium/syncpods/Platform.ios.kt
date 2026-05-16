package com.trilium.syncpods

import platform.UIKit.UIDevice
import kotlin.native.Platform as KNPlatform

class IOSPlatform: Platform {
    override val name: String = UIDevice.currentDevice.systemName() + " " + UIDevice.currentDevice.systemVersion
}

actual fun getPlatform(): Platform = IOSPlatform()

actual val isDebug: Boolean get() = KNPlatform.isDebugBinary