package com.trilium.syncpods

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform