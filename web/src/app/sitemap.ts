import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://syncpods.app'
  return [
    { url: `${base}/discover`, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${base}/about`,    lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/contact`,  lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ]
}
