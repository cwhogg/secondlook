import type { MetadataRoute } from "next"
import { getAllContent } from "@/lib/content"

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = "https://secondlook.vercel.app"

  const blogEntries: MetadataRoute.Sitemap = getAllContent().map((piece) => ({
    url: `${siteUrl}/blog/${piece.slug}`,
    lastModified: new Date(piece.date),
    changeFrequency: "monthly",
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
      url: `${siteUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/step-1`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/step-2`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/step-3`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...blogEntries,
  ]
}
