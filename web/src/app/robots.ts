import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/discover', '/about', '/contact', '/podcast/'],
      disallow: ['/queue', '/history', '/bookmarks', '/playlists', '/settings', '/profile', '/upgrade', '/api/'],
    },
    sitemap: 'https://syncpods.app/sitemap.xml',
  }
}
