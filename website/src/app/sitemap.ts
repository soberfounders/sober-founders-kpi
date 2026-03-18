import type { MetadataRoute } from "next";
import { caseStudies } from "@/content/caseStudies";

const SITE_URL = "https://soberfounders.org";

export default function sitemap(): MetadataRoute.Sitemap {
  const caseStudyEntries = caseStudies.map((study) => ({
    url: `${SITE_URL}/case-studies/${study.slug}/`,
    lastModified: new Date("2025-03-18"),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/case-studies/`,
      lastModified: new Date("2025-03-18"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...caseStudyEntries,
  ];
}
