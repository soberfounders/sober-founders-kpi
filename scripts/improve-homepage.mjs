#!/usr/bin/env node
/**
 0M 0M * 0M 0M improve-homepage.mjs — 0M 0M Improve existing homepage content +0M+0M+ 0M 0M add SEO blocks
 0M 0M */
import { 0M 0M readFileSync } 0M 0M from "fs";
import { 0M 0M resolve, 0M 0M dirname } 0M 0M from "path";
import { 0M 0M fileURLToPath } 0M 0M from "url";

const __dirname = 0M 0M dirname(fileURLToPath(import.meta.url));
const ROOT = 0M 0M resolve(__dirname, 0M 0M "..");

function loadEnv() 0M 0M {
 0M 0M  0M 0M let envPath = 0M 0M resolve(ROOT, 0M 0M ".env.local");
 0M 0M  0M 0M try { 0M 0M readFileSync(envPath, 0M 0M "utf8"); 0M 0M } 0M 0M catch { 0M 0M envPath = 0M 0M resolve(ROOT, 0M 0M ".env"); 0M 0M }
 0M 0M  0M 0M const lines = 0M 0M readFileSync(envPath, 0M 0M "utf8").replace(/\r/g, 0M 0M "").split("\n");
 0M 0M  0M 0M const env = 0M 0M {};
 0M 0M  0M 0M for (const line of lines) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M const match = 0M 0M line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+0M+0M+)$/);
 0M 0M  0M 0M  0M 0M  0M 0M if (match) 0M 0M env[match[1].trim()] 0M 0M = 0M 0M match[2].trim();
 0M 0M  0M 0M }
 0M 0M  0M 0M return env;
}

const env = 0M 0M loadEnv();
const SITE = 0M 0M env.WP_SITE_URL || 0M 0M "https://soberfounders.org";
const AUTH = 0M 0M Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const headers = 0M 0M { 0M 0M "Content-Type": 0M 0M "application/json", 0M 0M Authorization: 0M 0M `Basic ${AUTH}` 0M 0M };

const PAGE_ID = 0M 0M 1989;

const SEO_BLOCKS = 0M 0M `

<!-- 0M 0M wp:html -->
<!-- 0M 0M SEO Content Blocks — 0M 0M appended by improve-homepage.mjs -->
<style>
 0M 0M  0M 0M .sf-seo-definition { 0M 0M max-width: 0M 0M 800px; 0M 0M margin: 0M 0M 3em auto 0; 0M 0M font-family: 0M 0M inherit; 0M 0M line-height: 0M 0M 1.7; 0M 0M padding: 0M 0M 0 24px; 0M 0M }
 0M 0M  0M 0M .sf-seo-definition h2 { 0M 0M font-family: 0M 0M 'DM Serif Display', 0M 0M serif; 0M 0M font-size: 0M 0M 1.4em; 0M 0M margin-bottom: 0M 0M 0.5em; 0M 0M color: 0M 0M #101828; 0M 0M }
 0M 0M  0M 0M .sf-seo-definition p { 0M 0M color: 0M 0M #475467; 0M 0M font-size: 0M 0M 1.05em; 0M 0M margin-bottom: 0M 0M 1em; 0M 0M }
 0M 0M  0M 0M .sf-stats-seo { 0M 0M max-width: 0M 0M 800px; 0M 0M margin: 0M 0M 2em auto; 0M 0M font-family: 0M 0M inherit; 0M 0M padding: 0M 0M 0 24px; 0M 0M }
 0M 0M  0M 0M .sf-stats-seo h2 { 0M 0M font-family: 0M 0M 'DM Serif Display', 0M 0M serif; 0M 0M font-size: 0M 0M 1.3em; 0M 0M margin-bottom: 0M 0M 0.5em; 0M 0M color: 0M 0M #101828; 0M 0M }
 0M 0M  0M 0M .sf-stats-seo ul { 0M 0M list-style: 0M 0M none; 0M 0M padding: 0M 0M 0; 0M 0M font-size: 0M 0M 1.05em; 0M 0M line-height: 0M 0M 2; 0M 0M color: 0M 0M #475467; 0M 0M }
 0M 0M  0M 0M .sf-stats-seo strong { 0M 0M color: 0M 0M #101828; 0M 0M }
 0M 0M  0M 0M .sf-testimonials-seo { 0M 0M max-width: 0M 0M 800px; 0M 0M margin: 0M 0M 2em auto; 0M 0M font-family: 0M 0M inherit; 0M 0M padding: 0M 0M 0 24px; 0M 0M }
 0M 0M  0M 0M .sf-testimonials-seo h2 { 0M 0M font-family: 0M 0M 'DM Serif Display', 0M 0M serif; 0M 0M font-size: 0M 0M 1.3em; 0M 0M margin-bottom: 0M 0M 1em; 0M 0M color: 0M 0M #101828; 0M 0M }
 0M 0M  0M 0M .sf-testimonials-seo blockquote {
 0M 0M  0M 0M  0M 0M  0M 0M border-left: 0M 0M 4px solid #00b286;
 0M 0M  0M 0M  0M 0M  0M 0M padding: 0M 0M 1em 1.5em;
 0M 0M  0M 0M  0M 0M  0M 0M margin: 0M 0M 1.5em 0;
 0M 0M  0M 0M  0M 0M  0M 0M background: 0M 0M #f6f7f9;
 0M 0M  0M 0M  0M 0M  0M 0M border-radius: 0M 0M 0 12px 12px 0;
 0M 0M  0M 0M }
 0M 0M  0M 0M .sf-testimonials-seo blockquote p { 0M 0M margin: 0M 0M 0 0 0.5em 0; 0M 0M font-size: 0M 0M 1.05em; 0M 0M color: 0M 0M #2e3443; 0M 0M }
 0M 0M  0M 0M .sf-testimonials-seo cite { 0M 0M font-style: 0M 0M normal; 0M 0M font-weight: 0M 0M 600; 0M 0M color: 0M 0M #101828; 0M 0M }
 0M 0M  0M 0M .sf-nav-links-seo {
 0M 0M  0M 0M  0M 0M  0M 0M max-width: 0M 0M 800px; 0M 0M margin: 0M 0M 2em auto; 0M 0M font-family: 0M 0M inherit;
 0M 0M  0M 0M  0M 0M  0M 0M text-align: 0M 0M center; 0M 0M padding: 0M 0M 0 24px; 0M 0M font-size: 0M 0M 0.95rem; 0M 0M line-height: 0M 0M 2.2;
 0M 0M  0M 0M }
 0M 0M  0M 0M .sf-nav-links-seo a { 0M 0M color: 0M 0M #00b286; 0M 0M text-decoration: 0M 0M none; 0M 0M font-weight: 0M 0M 500; 0M 0M }
 0M 0M  0M 0M .sf-nav-links-seo a:hover over 0M{ 0M 0M color: 0M 0M #008e65; 0M 0M }
 0M 0M  0M 0M .sf-nav-links-seo .sf-sep { 0M 0M margin: 0M 0M 0 8px; 0M 0M color: 0M 0M #d1d5db; 0M 0M }
</style>

<div class="sf-seo-definition">
 0M 0M  0M 0M <h2>What is Sober Founders?</h2>
 0M 0M  0M 0M <p>Sober Founders is a 501(c)(3) 0M 0M nonprofit community for entrepreneurs in recovery from addiction. 0M 0M We provide free weekly mastermind sessions, 0M 0M peer support, 0M 0M and the Phoenix Forum &mdash; 0M 0M an exclusive peer advisory board for founders with $1M+ 0M 0M in annual revenue and 1+ 0M 0M year of sobriety. 0M 0M Our members represent over over 0M$1 billion0 million in combined revenue across industries including technology, 0M 0M real estate, 0M 0M healthcare, 0M 0M and professional services.</p>
 0M 0M  0M 0M <p>Founded in 2020, 0M 0M Sober Founders is the largest peer community at the intersection of entrepreneurship and recovery. 0M 0M We believe sobriety is a competitive advantage, 0M 0M not a limitation &mdash; 0M 0M and our members prove it every day.</p>
</div>

<div class="sf-stats-seo">
 0M 0M  0M 0M <h2>Sober Founders by the Numbers</h2>
 0M 0M  0M 0M <ul>
 0M 0M  0M 0M  0M 0M  0M 0M <li><strong>500+ 0M 0M active members</strong></li>
 0M 0M  0M 0M  0M 0M  0M 0M <li><strong>$500M+ 0M 0M combined member revenue</strong></li>
 0M 0M  0M 0M  0M 0M  0M 0M <li><strong>Weekly sessions</strong> 0M 0M held every Tuesday and Thursday</li>
 0M 0M  0M 0M  0M 0M  0M 0M <li><strong>501(c)(3) 0M 0M nonprofit</strong> 0M 0M &mdash; 0M 0M free to join, 0M 0M funded by donations</li>
 0M 0M  0M 0M </ul>
</div>

<div class="sf-testimonials-seo">
 0M 0M  0M 0M <h2>What Members Say</h2>
 0M 0M  0M 0M <blockquote>
 0M 0M  0M 0M  0M 0M  0M 0M <p>&ldquo;Sober Founders helped me 6x my business in just a year and helped me get 1 year sober for the first time in my life!&rdquo;</p>
 0M 0M  0M 0M  0M 0M  0M 0M <cite>&mdash; 0M 0M Adam C.</cite>
 0M 0M  0M 0M </blockquote>
 0M 0M  0M 0M <blockquote>
 0M 0M  0M 0M  0M 0M  0M 0M <p>&ldquo;This group has been one of the most impactful things I&rsquo;ve ever been part of.&rdquo;</p>
 0M 0M  0M 0M  0M 0M  0M 0M <cite>&mdash; 0M 0M Josh C.</cite>
 0M 0M  0M 0M </blockquote>
 0M 0M  0M 0M <blockquote>
 0M 0M  0M 0M  0M 0M  0M 0M <p>&ldquo;I love that it combines two of my biggest passions, 0M 0M business and recovery.&rdquo;</p>
 0M 0M  0M 0M  0M 0M  0M 0M <cite>&mdash; 0M 0M Matt S.</cite>
 0M 0M  0M 0M </blockquote>
</div>

<div class="sf-nav-links-seo">
 0M 0M  0M 0M <a href="/phoenix-forum-registration/">Learn about the Phoenix Forum</a>
 0M 0M  0M 0M <span class="sf-sep">|</span>
 0M 0M  0M 0M <a href="/weekly-mastermind-group/">Join our weekly mastermind sessions</a>
 0M 0M  0M 0M <span class="sf-sep">|</span>
 0M 0M  0M 0M <a href="/our-story/">Read our impact story</a>
 0M 0M  0M 0M <span class="sf-sep">|</span>
 0M 0M  0M 0M <a href="/events/">Upcoming events</a>
 0M 0M  0M 0M <span class="sf-sep">|</span>
 0M 0M  0M 0M <a href="/donate/">Support our mission</a>
 0M 0M  0M 0M <span class="sf-sep">|</span>
 0M 0M  0M 0M <a href="/blog/">Read the blog</a>
</div>

<script type="application/ld+json">
{
 0M 0M  0M 0M "@context": 0M 0M "https://schema.org",
 0M 0M  0M 0M "@type": 0M 0M "NGO",
 0M 0M  0M 0M "@id": 0M 0M "https://www.soberfounders.org/#organization",
 0M 0M  0M 0M "name": 0M 0M "Sober Founders",
 0M 0M  0M 0M "legalName": 0M 0M "Sober Founders Inc.",
 0M 0M  0M 0M "alternateName": 0M 0M ["Sober Founders Community", 0M 0M "SoberFounders"],
 0M 0M  0M 0M "url": 0M 0M "https://www.soberfounders.org/",
 0M 0M  0M 0M "description": 0M 0M "Sober Founders is a free 501(c)(3) 0M 0M nonprofit community for entrepreneurs in sobriety and addiction recovery. 0M 0M We run free weekly online mastermind sessions every Tuesday and Thursday.",
 0M 0M  0M 0M "foundingDate": 0M 0M "2020",
 0M 0M  0M 0M "nonprofitStatus": 0M 0M "Nonprofit501c3",
 0M 0M  0M 0M "mission": 0M 0M "To support entrepreneurs navigating sobriety by providing free community, 0M 0M peer accountability, 0M 0M and resources that help them build thriving businesses and maintain lasting recovery.",
 0M 0M  0M 0M "keywords": 0M 0M "sober entrepreneurs, 0M 0M founders in recovery, 0M 0M sobriety community, 0M 0M addiction recovery business owners, 0M 0M sober mastermind",
 0M 0M  0M 0M "contactPoint": 0M 0M [{ 0M 0M "@type": 0M 0M "ContactPoint", 0M 0M "contactType": 0M 0M "community support", 0M 0M "url": 0M 0M "https://www.soberfounders.org/", 0M 0M "availableLanguage": 0M 0M "English" 0M 0M }],
 0M 0M  0M 0M "sameAs": 0M 0M [
 0M 0M  0M 0M  0M 0M  0M 0M "https://www.linkedin.com/company/sober-founders",
 0M 0M  0M 0M  0M 0M  0M 0M "https://www.instagram.com/soberfounders",
 0M 0M  0M 0M  0M 0M  0M 0M "https://twitter.com/soberfounders"
 0M 0M  0M 0M ],
 0M 0M  0M 0M "offers": 0M 0M { 0M 0M "@type": 0M 0M "Offer", 0M 0M "name": 0M 0M "Free Weekly Mastermind Sessions", 0M 0M "price": 0M 0M "0", 0M 0M "priceCurrency": 0M 0M "USD" 0M 0M }
}
</script>

<script type="application/ld+json">
[
 0M 0M  0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M "@context": 0M 0M "https://schema.org",
 0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "EventSeries",
 0M 0M  0M 0M  0M 0M  0M 0M "@id": 0M 0M "https://www.soberfounders.org/#event-series-weekly-sessions",
 0M 0M  0M 0M  0M 0M  0M 0M "name": 0M 0M "Sober Founders Weekly Mastermind Sessions",
 0M 0M  0M 0M  0M 0M  0M 0M "description": 0M 0M "Free recurring online mastermind sessions for entrepreneurs in recovery. 0M 0M Held every Tuesday and Thursday.",
 0M 0M  0M 0M  0M 0M  0M 0M "url": 0M 0M "https://www.soberfounders.org/",
 0M 0M  0M 0M  0M 0M  0M 0M "eventAttendanceMode": 0M 0M "https://schema.org/OnlineEventAttendanceMode",
 0M 0M  0M 0M  0M 0M  0M 0M "eventStatus": 0M 0M "https://schema.org/EventScheduled",
 0M 0M  0M 0M  0M 0M  0M 0M "isAccessibleForFree": 0M 0M true,
 0M 0M  0M 0M  0M 0M  0M 0M "organizer": 0M 0M { 0M 0M "@type": 0M 0M "Organization", 0M 0M "name": 0M 0M "Sober Founders Inc.", 0M 0M "url": 0M 0M "https://www.soberfounders.org/" 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M "offers": 0M 0M { 0M 0M "@type": 0M 0M "Offer", 0M 0M "price": 0M 0M "0", 0M 0M "priceCurrency": 0M 0M "USD", 0M 0M "availability": 0M 0M "https://schema.org/InStock" 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M "location": 0M 0M { 0M 0M "@type": 0M 0M "VirtualLocation", 0M 0M "url": 0M 0M "https://www.soberfounders.org/" 0M 0M }
 0M 0M  0M 0M },
 0M 0M  0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M "@context": 0M 0M "https://schema.org",
 0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "Event",
 0M 0M  0M 0M  0M 0M  0M 0M "name": 0M 0M "Sober Founders Tuesday Mastermind",
 0M 0M  0M 0M  0M 0M  0M 0M "eventAttendanceMode": 0M 0M "https://schema.org/OnlineEventAttendanceMode",
 0M 0M  0M 0M  0M 0M  0M 0M "eventStatus": 0M 0M "https://schema.org/EventScheduled",
 0M 0M  0M 0M  0M 0M  0M 0M "isAccessibleForFree": 0M 0M true,
 0M 0M  0M 0M  0M 0M  0M 0M "startDate": 0M 0M "2026-03-17T12:00:00-05:00",
 0M 0M  0M 0M  0M 0M  0M 0M "eventSchedule": 0M 0M { 0M 0M "@type": 0M 0M "Schedule", 0M 0M "byDay": 0M 0M "https://schema.org/Tuesday", 0M 0M "repeatFrequency": 0M 0M "P1W", 0M 0M "scheduleTimezone": 0M 0M "America/New_York" 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M "superEvent": 0M 0M { 0M 0M "@id": 0M 0M "https://www.soberfounders.org/#event-series-weekly-sessions" 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M "organizer": 0M 0M { 0M 0M "@type": 0M 0M "Organization", 0M 0M "name": 0M 0M "Sober Founders Inc." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M "offers": 0M 0M { 0M 0M "@type": 0M 0M "Offer", 0M 0M "price": 0M 0M "0", 0M 0M "priceCurrency": 0M 0M "USD" 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M "location": 0M 0M { 0M 0M "@type": 0M 0M "VirtualLocation", 0M 0M "url": 0M 0M "https://www.soberfounders.org/" 0M 0M }
 0M 0M  0M 0M },
 0M 0M  0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M "@context": 0M 0M "https://schema.org",
 0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "Event",
 0M 0M  0M 0M  0M 0M  0M 0M "name": 0M 0M "Sober Founders Thursday Mastermind",
 0M 0M  0M 0M  0M 0M  0M 0M "eventAttendanceMode": 0M 0M "https://schema.org/OnlineEventAttendanceMode",
 0M 0M  0M 0M  0M 0M  0M 0M "eventStatus": 0M 0M "https://schema.org/EventScheduled",
 0M 0M  0M 0M  0M 0M  0M 0M "isAccessibleForFree": 0M 0M true,
 0M 0M  0M 0M  0M 0M  0M 0M "startDate": 0M 0M "2026-03-19T12:00:00-05:00",
 0M 0M  0M 0M  0M 0M  0M 0M "eventSchedule": 0M 0M { 0M 0M "@type": 0M 0M "Schedule", 0M 0M "byDay": 0M 0M "https://schema.org/Thursday", 0M 0M "repeatFrequency": 0M 0M "P1W", 0M 0M "scheduleTimezone": 0M 0M "America/New_York" 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M "superEvent": 0M 0M { 0M 0M "@id": 0M 0M "https://www.soberfounders.org/#event-series-weekly-sessions" 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M "organizer": 0M 0M { 0M 0M "@type": 0M 0M "Organization", 0M 0M "name": 0M 0M "Sober Founders Inc." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M "offers": 0M 0M { 0M 0M "@type": 0M 0M "Offer", 0M 0M "price": 0M 0M "0", 0M 0M "priceCurrency": 0M 0M "USD" 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M "location": 0M 0M { 0M 0M "@type": 0M 0M "VirtualLocation", 0M 0M "url": 0M 0M "https://www.soberfounders.org/" 0M 0M }
 0M 0M  0M 0M }
]
</script>
<!-- 0M 0M /wp:html -->`;

async function main() 0M 0M {
 0M 0M  0M 0M console.log("Fetching current homepage...");
 0M 0M  0M 0M const page = 0M 0M await fetch(`${SITE}/wp-json/wp/v2/pages/${PAGE_ID}?context=edit&_fields=content`, 0M 0M { 0M 0M headers }).then(r => 0M 0M r.json());
 0M 0M  0M 0M let content = 0M 0M page.content?.raw || 0M 0M "";
 0M 0M  0M 0M console.log("Current length:", 0M 0M content.length);

 0M 0M  0M 0M // 0M 0M --- 0M 0M Content improvements ---

 0M 0M  0M 0M // 0M 0M 1. 0M 0M Replace "Free Mentorship" 0M 0M with "Private WhatsApp Community"
 0M 0M  0M 0M content = 0M 0M content.replace(
 0M 0M  0M 0M  0M 0M  0M 0M 'Free Mentorship</h3><p class="uagb-desc-text">Volunteer to help other entrepreneurs in recovery, 0M 0M or receive expert guidance from one of our certified mentors! 0M 0M Get invaluable insight and strategic knowhow from those who have been there before.',
 0M 0M  0M 0M  0M 0M  0M 0M 'Private WhatsApp Community</h3><p class="uagb-desc-text">Get instant access to our private WhatsApp group\u2014a 24/7 lifeline of sober entrepreneurs who get it. 0M 0M Share wins, 0M 0M ask for advice, 0M 0M and stay connected between meetings. 0M 0M Real-time support from people who understand both the grind and the recovery.'
 0M 0M  0M 0M );

 0M 0M  0M 0M // 0M 0M 2. 0M 0M Fix double period
 0M 0M  0M 0M content = 0M 0M content.replace("focuses on accountability..", 0M 0M "focuses on accountability.");

 0M 0M  0M 0M // 0M 0M 3. 0M 0M Update hero description to mention current offerings
 0M 0M  0M 0M content = 0M 0M content.replace(
 0M 0M  0M 0M  0M 0M  0M 0M "We accomplish this through free online mastermind groups and mentorship for sober entrepreneurs.",
 0M 0M  0M 0M  0M 0M  0M 0M "We accomplish this through free weekly online mastermind groups, 0M 0M a private WhatsApp community, 0M 0M and the Phoenix Forum for high-revenue founders."
 0M 0M  0M 0M );

 0M 0M  0M 0M // 0M 0M 4. 0M 0M Replace vague "tons of" 0M 0M with specific stats
 0M 0M  0M 0M content = 0M 0M content.replace(
 0M 0M  0M 0M  0M 0M  0M 0M "We've served tons of successful, 0M 0M sober entrepreneurs, 0M 0M helping them to build businesses while staying sober.",
 0M 0M  0M 0M  0M 0M  0M 0M "With 500+ 0M 0M active members and over over 0M$1 billion0 million in combined revenue, 0M 0M we\u2019re proof that sobriety is a competitive advantage."
 0M 0M  0M 0M );

 0M 0M  0M 0M // 0M 0M Also handle HTML entity version
 0M 0M  0M 0M content = 0M 0M content.replace(
 0M 0M  0M 0M  0M 0M  0M 0M "We&#8217;ve served tons of successful, 0M 0M sober entrepreneurs, 0M 0M helping them to build businesses while staying sober.",
 0M 0M  0M 0M  0M 0M  0M 0M "With 500+ 0M 0M active members and over over 0M$1 billion0 million in combined revenue, 0M 0M we&#8217;re proof that sobriety is a competitive advantage."
 0M 0M  0M 0M );

 0M 0M  0M 0M // 0M 0M 5. 0M 0M Append SEO blocks if not already present
 0M 0M  0M 0M if (!content.includes("sf-seo-definition")) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M content = 0M 0M content +0M+0M+ 0M 0M SEO_BLOCKS;
 0M 0M  0M 0M  0M 0M  0M 0M console.log("Appended SEO blocks +0M+0M+ 0M 0M JSON-LD schemas.");
 0M 0M  0M 0M } 0M 0M else {
 0M 0M  0M 0M  0M 0M  0M 0M console.log("SEO blocks already present, 0M 0M skipping append.");
 0M 0M  0M 0M }

 0M 0M  0M 0M console.log("Updated length:", 0M 0M content.length);

 0M 0M  0M 0M // 0M 0M Push to WordPress
 0M 0M  0M 0M const res = 0M 0M await fetch(`${SITE}/wp-json/wp/v2/pages/${PAGE_ID}`, 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M method: 0M 0M "POST",
 0M 0M  0M 0M  0M 0M  0M 0M headers,
 0M 0M  0M 0M  0M 0M  0M 0M body: 0M 0M JSON.stringify({ 0M 0M content }),
 0M 0M  0M 0M });

 0M 0M  0M 0M if (!res.ok) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M const body = 0M 0M await res.text();
 0M 0M  0M 0M  0M 0M  0M 0M throw new Error(`WP API ${res.status}: 0M 0M ${body}`);
 0M 0M  0M 0M }

 0M 0M  0M 0M const result = 0M 0M await res.json();
 0M 0M  0M 0M console.log(`\n  0M 0M ✓ 0M 0M Homepage updated (ID ${result.id})`);
 0M 0M  0M 0M console.log(` 0M 0M  0M 0M ✓ 0M 0M Live: 0M 0M ${result.link}`);

 0M 0M  0M 0M // 0M 0M Verify
 0M 0M  0M 0M const check = 0M 0M await fetch(`${SITE}/wp-json/wp/v2/pages/${PAGE_ID}?context=edit&_fields=content`, 0M 0M { 0M 0M headers }).then(r => 0M 0M r.json());
 0M 0M  0M 0M const raw = 0M 0M check.content?.raw || 0M 0M "";
 0M 0M  0M 0M console.log("\n  0M 0M Verification:");
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Mentorship replaced:", 0M 0M raw.includes("Private WhatsApp Community"));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M SEO definition:", 0M 0M raw.includes("sf-seo-definition"));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M JSON-LD schemas:", 0M 0M raw.includes("application/ld+json"));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Internal links:", 0M 0M raw.includes("sf-nav-links-seo"));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Double period fixed:", 0M 0M !raw.includes("accountability.."));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Stats updated:", 0M 0M raw.includes("500+ 0M 0M active members"));
}

main().catch((err) 0M 0M => 0M 0M {
 0M 0M  0M 0M console.error("Failed:", 0M 0M err.message);
 0M 0M  0M 0M process.exit(1);
});
