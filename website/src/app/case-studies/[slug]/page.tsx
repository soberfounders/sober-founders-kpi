import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CaseStudyPageContent from "@/components/CaseStudyPageContent";
import { caseStudies, getCaseStudyBySlug } from "@/content/caseStudies";

const SITE_URL = "https://soberfounders.org";

type CaseStudyPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return caseStudies.map((study) => ({ slug: study.slug }));
}

export async function generateMetadata({
  params,
}: CaseStudyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const study = getCaseStudyBySlug(slug);

  if (!study) {
    return {
      title: "Case Study",
    };
  }

  return {
    title: `${study.name} Case Study`,
    description: study.summary,
    alternates: {
      canonical: `${SITE_URL}/case-studies/${study.slug}/`,
    },
    openGraph: {
      title: `${study.name} Case Study | Sober Founders`,
      description: study.summary,
      url: `${SITE_URL}/case-studies/${study.slug}/`,
      siteName: "Sober Founders",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${study.name} Case Study | Sober Founders`,
      description: study.summary,
    },
  };
}

export default async function CaseStudyDetailPage({
  params,
}: CaseStudyPageProps) {
  const { slug } = await params;
  const study = getCaseStudyBySlug(slug);

  if (!study) {
    notFound();
  }

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: study.title,
    description: study.summary,
    mainEntityOfPage: `${SITE_URL}/case-studies/${study.slug}/`,
    author: {
      "@type": "Organization",
      name: "Sober Founders",
    },
    publisher: {
      "@type": "Organization",
      name: "Sober Founders",
      url: SITE_URL,
    },
    about: [
      "entrepreneurs in recovery",
      "sobriety and business growth",
      "peer community for sober founders",
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <CaseStudyPageContent study={study} />
    </>
  );
}
