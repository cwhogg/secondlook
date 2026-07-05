import type { MetadataRoute } from "next"
import { getAllContent } from "@/lib/content"

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = "https://www.secondlookdx.com"

  const blogEntries: MetadataRoute.Sitemap = getAllContent().map((piece) => ({
    url: `${siteUrl}/blog/${piece.slug}`,
    lastModified: new Date(piece.lastModified),
    changeFrequency: "weekly",
    priority: 0.7,
  }))

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/faq`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    ...blogEntries,
  ]
}
