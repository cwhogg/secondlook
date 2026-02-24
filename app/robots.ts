import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/results/", "/expert-results/", "/analysis/", "/step-1", "/step-2", "/step-3", "/testing"],
      },
    ],
    sitemap: "https://secondlook.vercel.app/sitemap.xml",
  }
}
