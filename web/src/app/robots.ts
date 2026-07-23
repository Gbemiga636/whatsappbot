import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || "https://bygate.app"}/sitemap.xml`,
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/dashboard/", "/admin/"] },
    ],
  };
}
