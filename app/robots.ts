import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/results/", "/expert-results/", "/analysis/", "/step-1", "/step-2", "/step-3", "/step-4", "/step-5", "/step-6", "/admin"],
      },
    ],
    sitemap: "https://www.secondlookdx.com/sitemap.xml",
  }
}
