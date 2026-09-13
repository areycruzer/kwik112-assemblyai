import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/dashboard", "/for-judges", "/benchmark", "/transcript"].map((route) => ({
    url: `${siteUrl}${route}`,
    changeFrequency: "weekly" as const,
    priority: route ? 0.9 : 1,
  }));
}
