import type { MetadataRoute } from "next";

// Belt-and-braces with metadata.robots in layout.tsx: that emits a meta
// tag, this emits robots.txt, and crawlers respect them at different
// points. This app has no authentication anywhere in v1 — an unlisted URL
// is the entire access-control model, so a crawled and indexed staff route
// doesn't just weaken that model, it voids it.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
