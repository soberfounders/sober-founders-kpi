import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SiteFooter from "@/components/SiteFooter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://soberfounders.org";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Sober Founders — The Peer Community for Entrepreneurs in Recovery",
    template: "%s | Sober Founders",
  },
  description:
    "Sober Founders is a 501(c)(3) nonprofit community for entrepreneurs in recovery. Join our free Thursday mastermind (open to all), our free Tuesday mastermind ($250k+ revenue & >1 yr sober), or the exclusive Phoenix Forum ($1M+ revenue).",
  keywords: [
    "sober entrepreneurs",
    "entrepreneurs in recovery",
    "sober founder",
    "addiction recovery business",
    "sober mastermind group",
    "entrepreneur sobriety",
    "recovery community for business owners",
    "Phoenix Forum",
    "sober business network",
    "501c3 nonprofit recovery",
  ],
  authors: [{ name: "Sober Founders Inc." }],
  creator: "Sober Founders Inc.",
  publisher: "Sober Founders Inc.",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Sober Founders",
    title: "Sober Founders — Sobriety Is a Competitive Advantage",
    description:
      "The peer community for entrepreneurs who build thriving businesses and protect their recovery. 500+ entrepreneurs helped, $500M+ combined revenue.",
    images: [
      {
        url: "/assets/phoenix-static.jpg",
        width: 1920,
        height: 1280,
        alt: "Sober Founders — From Chaos to Clarity",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sober Founders — Sobriety Is a Competitive Advantage",
    description:
      "The peer community for entrepreneurs who build thriving businesses and protect their recovery.",
    images: ["/assets/phoenix-static.jpg"],
  },
  alternates: {
    canonical: SITE_URL,
  },
};

// JSON-LD structured data
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Sober Founders",
      description:
        "The peer community for entrepreneurs in recovery from addiction.",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": ["Organization", "NonprofitOrganization"],
      "@id": `${SITE_URL}/#organization`,
      name: "Sober Founders Inc.",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/assets/phoenix-static.jpg`,
      },
      description:
        "501(c)(3) nonprofit community for entrepreneurs in recovery. We offer three tiers: a free Thursday Business Mastermind for all sober entrepreneurs, a free Tuesday 'All Our Affairs' Mastermind for founders with 2+ employees and $250k+ revenue (>1 year sober), and the Phoenix Forum, an exclusive $499/mo advisory board for founders with $1M+ revenue (>1 year sober).",
      foundingDate: "2024",
      nonprofitStatus: "501(c)(3)",
      taxID: "33-4098435",
      sameAs: [
        "https://www.linkedin.com/company/sober-founders",
        "https://www.instagram.com/soberfounders",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "General Inquiry",
        url: `${SITE_URL}/contact/`,
      },
      makesOffer: [
        {
          "@type": "Offer",
          "name": "Weekly Thursday Business Mastermind",
          "description": "Free and open to all entrepreneurs in recovery.",
          "price": "0",
          "priceCurrency": "USD"
        },
        {
          "@type": "Offer",
          "name": "Weekly Tuesday All Our Affairs Business Mastermind",
          "description": "Free and open to entrepreneurs in recovery who own businesses with at least 2 full-time employees, $250k in revenue, are more than one year sober, and actively work the 12 steps.",
          "price": "0",
          "priceCurrency": "USD"
        },
        {
          "@type": "Offer",
          "name": "Monthly Phoenix Forum",
          "description": "Curated peer advisory group ($499/mo) like YPO or Vistage for entrepreneurs in recovery with $1m+ in revenue and over a year of sobriety. Maximum 10 members per group, featuring a monthly 'hot seat' (essentially a 4th and 5th step on business and life).",
          "price": "499",
          "priceCurrency": "USD",
          "priceComponent": {
            "@type": "UnitPriceSpecification",
            "price": "499",
            "priceCurrency": "USD",
            "referenceQuantity": {
              "@type": "QuantitativeValue",
              "value": "1",
              "unitCode": "MON"
            }
          }
        }
      ],
    },
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/#webpage`,
      url: SITE_URL,
      name: "Sober Founders — The Peer Community for Entrepreneurs in Recovery",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#organization` },
      description:
        "Sober Founders is a 501(c)(3) nonprofit community for entrepreneurs in recovery. Join our free Thursday mastermind (open to all), our free Tuesday mastermind ($250k+ revenue & >1 yr sober), or the exclusive Phoenix Forum ($1M+ revenue).",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0a0a0a] text-white`}
      >
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
