#!/usr/bin/env node
/**
 0M 0M * 0M 0M deploy-seo.mjs — 0M 0M Push SEO content to soberfounders.org via WP REST API
 0M 0M *
 0M 0M * 0M 0M Usage:
 0M 0M * 0M 0M  0M 0M  0M 0M node scripts/deploy-seo.mjs [--dry-run]
 0M 0M *
 0M 0M * 0M 0M What it does:
 0M 0M * 0M 0M  0M 0M  0M 0M 1. 0M 0M Creates or updates the FAQ page at /resources/faq/
 0M 0M * 0M 0M  0M 0M  0M 0M 2. 0M 0M Creates or updates the Phoenix Forum pillar page
 0M 0M * 0M 0M  0M 0M  0M 0M 3. 0M 0M Appends SEO content blocks +0M+0M+ 0M 0M JSON-LD to the homepage
 0M 0M * 0M 0M  0M 0M  0M 0M 4. 0M 0M Injects Organization +0M+0M+ 0M 0M Event schemas via a Custom HTML widget approach
 0M 0M *
 0M 0M * 0M 0M Prerequisites:
 0M 0M * 0M 0M  0M 0M  0M 0M - 0M 0M WP_SITE_URL, 0M 0M WP_USERNAME, 0M 0M WP_APP_PASSWORD in .env.local
 0M 0M */

import { 0M 0M readFileSync } 0M 0M from "fs";
import { 0M 0M resolve, 0M 0M dirname } 0M 0M from "path";
import { 0M 0M fileURLToPath } 0M 0M from "url";

const __dirname = 0M 0M dirname(fileURLToPath(import.meta.url));
const ROOT = 0M 0M resolve(__dirname, 0M 0M "..");

// 0M 0M ---------------------------------------------------------------------------
// 0M 0M Config
// 0M 0M ---------------------------------------------------------------------------
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
const AUTH = 0M 0M Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString(
 0M 0M  0M 0M "base64"
);
const DRY_RUN = 0M 0M process.argv.includes("--dry-run");

const headers = 0M 0M {
 0M 0M  0M 0M "Content-Type": 0M 0M "application/json",
 0M 0M  0M 0M Authorization: 0M 0M `Basic ${AUTH}`,
};

// 0M 0M ---------------------------------------------------------------------------
// 0M 0M WP REST helpers
// 0M 0M ---------------------------------------------------------------------------
async function wpFetch(endpoint, 0M 0M options = 0M 0M {}) 0M 0M {
 0M 0M  0M 0M const url = 0M 0M `${SITE}/wp-json/wp/v2${endpoint}`;
 0M 0M  0M 0M const res = 0M 0M await fetch(url, 0M 0M { 0M 0M ...options, 0M 0M headers: 0M 0M { 0M 0M ...headers, 0M 0M ...options.headers } 0M 0M });
 0M 0M  0M 0M if (!res.ok) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M const body = 0M 0M await res.text();
 0M 0M  0M 0M  0M 0M  0M 0M throw new Error(`WP API ${res.status} 0M 0M ${res.statusText}: 0M 0M ${body}`);
 0M 0M  0M 0M }
 0M 0M  0M 0M return res.json();
}

async function findPageBySlug(slug) 0M 0M {
 0M 0M  0M 0M const pages = 0M 0M await wpFetch(`/pages?slug=${slug}&status=publish,draft`);
 0M 0M  0M 0M return pages[0] 0M 0M || 0M 0M null;
}

async function createOrUpdatePage(slug, 0M 0M data) 0M 0M {
 0M 0M  0M 0M const existing = 0M 0M await findPageBySlug(slug);
 0M 0M  0M 0M if (DRY_RUN) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M console.log(` 0M 0M  0M 0M [DRY RUN] 0M 0M Would ${existing ? 0M 0M "update" 0M 0M : 0M 0M "create"} 0M 0M page: 0M 0M /${slug}/`);
 0M 0M  0M 0M  0M 0M  0M 0M return existing || 0M 0M { 0M 0M id: 0M 0M "dry-run", 0M 0M slug };
 0M 0M  0M 0M }
 0M 0M  0M 0M if (existing) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M console.log(` 0M 0M  0M 0M Updating existing page (ID ${existing.id}): 0M 0M /${slug}/`);
 0M 0M  0M 0M  0M 0M  0M 0M return wpFetch(`/pages/${existing.id}`, 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M method: 0M 0M "POST",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M body: 0M 0M JSON.stringify(data),
 0M 0M  0M 0M  0M 0M  0M 0M });
 0M 0M  0M 0M } 0M 0M else {
 0M 0M  0M 0M  0M 0M  0M 0M console.log(` 0M 0M  0M 0M Creating new page: 0M 0M /${slug}/`);
 0M 0M  0M 0M  0M 0M  0M 0M return wpFetch("/pages", 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M method: 0M 0M "POST",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M body: 0M 0M JSON.stringify({ 0M 0M slug, 0M 0M ...data }),
 0M 0M  0M 0M  0M 0M  0M 0M });
 0M 0M  0M 0M }
}

// 0M 0M ---------------------------------------------------------------------------
// 0M 0M Content Builders
// 0M 0M ---------------------------------------------------------------------------

function buildFaqPageHtml() 0M 0M {
 0M 0M  0M 0M const questions = 0M 0M [
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "What is Sober Founders?", 0M 0M a: 0M 0M "Sober Founders is a 501(c)(3) 0M 0M nonprofit community for entrepreneurs in recovery from addiction. 0M 0M It provides free weekly virtual sessions, 0M 0M peer mentorship, 0M 0M and — 0M 0M for high-revenue founders — 0M 0M the Phoenix Forum, 0M 0M an exclusive membership for those with $1M+ 0M 0M in annual revenue and at least one year of sobriety. 0M 0M The organization exists at the unique intersection of entrepreneurship and recovery, 0M 0M giving founders a space where sobriety is a shared foundation, 0M 0M not a secret." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "Who can join Sober Founders?", 0M 0M a: 0M 0M "Any entrepreneur or business owner in recovery from addiction is welcome to join Sober Founders. 0M 0M There is no revenue minimum, 0M 0M no industry restriction, 0M 0M and no requirement to be enrolled in a formal treatment program. 0M 0M The only expectation is that members are committed to sobriety and want to build their business alongside a community that understands both the demands of entrepreneurship and the challenges of recovery." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "What is the Phoenix Forum?", 0M 0M a: 0M 0M "The Phoenix Forum is Sober Founders' 0M 0M premium membership tier for high-achieving founders in recovery. 0M 0M To qualify, 0M 0M members must have at least $1 million in annual business revenue and a minimum of one year of continuous sobriety. 0M 0M Phoenix Forum members participate in small-group peer advisory sessions, 0M 0M gain access to senior mentors, 0M 0M and connect with a network of accomplished founders who share their commitment to recovery. 0M 0M It is modeled after high-performance mastermind groups but built specifically around the sober founder experience." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "How much does it cost to join Sober Founders?", 0M 0M a: 0M 0M "Joining Sober Founders' 0M 0M general community and attending the weekly virtual sessions is completely free. 0M 0M Sober Founders is a 501(c)(3) 0M 0M nonprofit, 0M 0M and open participation is core to its mission of making recovery-focused entrepreneurship support accessible to all founders regardless of financial means. 0M 0M The Phoenix Forum premium membership has its own application process; 0M 0M contact the team at soberfounders.org for current Phoenix Forum membership details." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "How do I join the Phoenix Forum?", 0M 0M a: 0M 0M `To join the Phoenix Forum, 0M 0M you must meet two criteria: 0M 0M at least $1 million in annual business revenue and a minimum of one year of sobriety. 0M 0M Eligible founders can apply through <a href="https://soberfounders.org/phoenix-forum-good-fit-call/">soberfounders.org</a>. 0M 0M The application process includes a review of your business and sobriety background, 0M 0M followed by a conversation with the Sober Founders team to ensure the program is the right fit. 0M 0M Spots are limited to maintain the quality of peer connections.` 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "What happens at a Sober Founders session?", 0M 0M a: 0M 0M "Sober Founders sessions are structured virtual gatherings where founders in recovery share business challenges, 0M 0M discuss strategies, 0M 0M and support one another. 0M 0M Each session typically combines open discussion with topic-driven conversation — 0M 0M covering subjects like managing stress without substances, 0M 0M scaling a business in recovery, 0M 0M and navigating investor relationships as a sober founder. 0M 0M Sessions run on Zoom and are designed to feel like a trusted peer group, 0M 0M not a formal meeting or treatment setting." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "When are Sober Founders meetings held?", 0M 0M a: 0M 0M "Sober Founders holds weekly virtual sessions every Tuesday and Thursday. 0M 0M Sessions are held online via Zoom, 0M 0M making them accessible to founders anywhere in the world regardless of time zone. 0M 0M The consistent twice-weekly schedule provides the accountability and community connection that recovery and business growth both benefit from. 0M 0M Check soberfounders.org or the community calendar for current session times." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "Is Sober Founders anonymous?", 0M 0M a: 0M 0M "Sober Founders upholds strong confidentiality norms — 0M 0M what is shared in sessions stays within the community. 0M 0M While the organization is not formally structured as an anonymous program like AA or NA, 0M 0M privacy and discretion are core cultural values. 0M 0M Members are not required to disclose personal recovery details publicly, 0M 0M and the community actively protects what is shared in sessions." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "Do I need to be in a 12-step program to join Sober Founders?", 0M 0M a: 0M 0M "No. 0M 0M Sober Founders does not require membership in any 12-step program or any specific recovery path. 0M 0M The community is inclusive of all approaches to sobriety — 0M 0M including 12-step, 0M 0M SMART Recovery, 0M 0M medication-assisted treatment, 0M 0M therapy, 0M 0M and others. 0M 0M The only requirement is a personal commitment to sobriety. 0M 0M Sober Founders is not a treatment program; 0M 0M it is a peer community that complements whatever recovery approach you choose." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "What is the revenue requirement for Phoenix Forum?", 0M 0M a: 0M 0M "The Phoenix Forum requires a minimum of $1 million in annual business revenue. 0M 0M This threshold ensures that members are navigating similar-scale business challenges — 0M 0M fundraising, 0M 0M hiring, 0M 0M managing teams, 0M 0M and scaling operations — 0M 0M which makes peer advice more relevant and actionable. 0M 0M Founders who do not yet meet the $1M revenue mark are encouraged to participate in Sober Founders' 0M 0M free community sessions while growing toward that milestone." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "How is Sober Founders different from AA or NA?", 0M 0M a: 0M 0M "Sober Founders is not a 12-step recovery program. 0M 0M It is a professional peer community specifically for entrepreneurs and business owners in recovery. 0M 0M Where AA and NA focus on personal recovery through a spiritual framework and step-based process, 0M 0M Sober Founders focuses on the intersection of sobriety and running a business — 0M 0M covering hiring, 0M 0M revenue strategy, 0M 0M investor dynamics, 0M 0M and leadership challenges. 0M 0M Many Sober Founders members also attend AA or NA; 0M 0M the two are complementary." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "Can I attend if I'm sober-curious but not fully sober?", 0M 0M a: 0M 0M "Sober Founders' 0M 0M primary community is designed for entrepreneurs committed to sobriety, 0M 0M but the organization welcomes those seriously exploring sobriety as part of their recovery journey. 0M 0M If you are sober-curious and taking concrete steps toward sobriety, 0M 0M reach out at soberfounders.org to discuss whether participation is a good fit. 0M 0M The Phoenix Forum requires a minimum of one year of continuous sobriety for membership." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "How does Sober Founders help my business?", 0M 0M a: 0M 0M "Sober Founders helps your business by surrounding you with peers who understand both entrepreneurship and recovery and can give honest, 0M 0M experience-based advice without judgment. 0M 0M Research shows that peer accountability and strong social support networks improve both business performance and recovery outcomes. 0M 0M Phoenix Forum members gain access to a high-trust group of founders with $1M+ 0M 0M revenue, 0M 0M where conversations go deep on real business challenges. 0M 0M Many members report that the clarity sobriety provides, 0M 0M combined with community accountability, 0M 0M is a measurable competitive advantage." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "Is Sober Founders a 501(c)(3) 0M 0M nonprofit?", 0M 0M a: 0M 0M "Yes. 0M 0M Sober Founders is a registered 501(c)(3) 0M 0M nonprofit organization. 0M 0M This means the organization is legally recognized as tax-exempt and dedicated to its public mission of supporting entrepreneurs in recovery. 0M 0M Donations to Sober Founders are tax-deductible for U.S. 0M 0M donors to the extent permitted by law. 0M 0M The nonprofit structure reflects the organization's commitment to keeping its core community programs free and accessible to all founders regardless of business stage or financial means." 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M q: 0M 0M "How can I donate to Sober Founders?", 0M 0M a: 0M 0M `You can donate to Sober Founders at <a href="https://soberfounders.org/donate/">soberfounders.org/donate</a>. 0M 0M As a 501(c)(3) 0M 0M nonprofit, 0M 0M all donations are tax-deductible for U.S. 0M 0M taxpayers to the extent permitted by law. 0M 0M Contributions directly fund the free weekly sessions, 0M 0M mentorship programs, 0M 0M and operational infrastructure that keep the community running. 0M 0M If you are a founder who has benefited from Sober Founders and want to help more entrepreneurs access recovery-supportive community, 0M 0M donating is one of the most direct ways to make an impact.` 0M 0M },
 0M 0M  0M 0M ];

 0M 0M  0M 0M // 0M 0M Build visible HTML (accordion-style with details/summary for Elementor compatibility)
 0M 0M  0M 0M let html = 0M 0M `<div class="sf-faq-page" 0M 0M style="max-width: 0M 0M 800px; 0M 0M margin: 0M 0M 0 auto; 0M 0M font-family: 0M 0M inherit;">\n`;
 0M 0M  0M 0M html +0M+0M+= 0M 0M `<h1 style="text-align: 0M 0M center; 0M 0M margin-bottom: 0M 0M 0.5em;">Sober Founders FAQ</h1>\n`;
 0M 0M  0M 0M html +0M+0M+= 0M 0M `<p style="text-align: 0M 0M center; 0M 0M color: 0M 0M #666; 0M 0M margin-bottom: 0M 0M 2em;">Answers to common questions about our community, 0M 0M the Phoenix Forum, 0M 0M and how to get involved.</p>\n\n`;

 0M 0M  0M 0M for (const { 0M 0M q, 0M 0M a } 0M 0M of questions) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M html +0M+0M+= 0M 0M `<div class="sf-faq-item" 0M 0M style="border-bottom: 0M 0M 1px solid #e0e0e0; 0M 0M padding: 0M 0M 1.5em 0;">\n`;
 0M 0M  0M 0M  0M 0M  0M 0M html +0M+0M+= 0M 0M ` 0M 0M  0M 0M <h2 style="font-size: 0M 0M 1.2em; 0M 0M margin: 0M 0M 0 0 0.5em 0; 0M 0M color: 0M 0M #1a1a1a;">${q}</h2>\n`;
 0M 0M  0M 0M  0M 0M  0M 0M html +0M+0M+= 0M 0M ` 0M 0M  0M 0M <p style="margin: 0M 0M 0; 0M 0M line-height: 0M 0M 1.7; 0M 0M color: 0M 0M #333;">${a}</p>\n`;
 0M 0M  0M 0M  0M 0M  0M 0M html +0M+0M+= 0M 0M `</div>\n\n`;
 0M 0M  0M 0M }
 0M 0M  0M 0M html +0M+0M+= 0M 0M `</div>\n\n`;

 0M 0M  0M 0M // 0M 0M JSON-LD FAQPage schema
 0M 0M  0M 0M const schema = 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M "@context": 0M 0M "https://schema.org",
 0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "FAQPage",
 0M 0M  0M 0M  0M 0M  0M 0M mainEntity: 0M 0M questions.map(({ 0M 0M q, 0M 0M a }) 0M 0M => 0M 0M ({
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "Question",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M name: 0M 0M q,
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M acceptedAnswer: 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "Answer",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M text: 0M 0M a.replace(/<[^>]+0M+0M+>/g, 0M 0M ""), 0M 0M // 0M 0M strip HTML for schema
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M })),
 0M 0M  0M 0M };

 0M 0M  0M 0M html +0M+0M+= 0M 0M `<script type="application/ld+json">\n${JSON.stringify(schema, 0M 0M null, 0M 0M 2)}\n</script>`;

 0M 0M  0M 0M return html;
}

function buildPhoenixForumHtml() 0M 0M {
 0M 0M  0M 0M let html = 0M 0M `<div class="sf-phoenix-pillar" 0M 0M style="max-width: 0M 0M 800px; 0M 0M margin: 0M 0M 0 auto; 0M 0M font-family: 0M 0M inherit; 0M 0M line-height: 0M 0M 1.7;">

<h1 style="text-align: 0M 0M center; 0M 0M margin-bottom: 0M 0M 0.3em;">Phoenix Forum</h1>
<p style="text-align: 0M 0M center; 0M 0M font-size: 0M 0M 1.1em; 0M 0M color: 0M 0M #666; 0M 0M margin-bottom: 0M 0M 2em;">The Peer Mastermind Group for Sober Founders</p>

<h2>What Is the Phoenix Forum?</h2>
<p>The Phoenix Forum is a weekly peer mastermind group for entrepreneurs in recovery, 0M 0M operated by Sober Founders — 0M 0M a 501(c)(3) 0M 0M nonprofit. 0M 0M Membership requires at least $1 million in annual revenue and more than one year of continuous sobriety. 0M 0M Members meet on Tuesdays and Thursdays for structured peer accountability sessions designed to accelerate business growth while supporting long-term recovery.</p>

<hr style="border: 0M 0M none; 0M 0M border-top: 0M 0M 1px solid #e0e0e0; 0M 0M margin: 0M 0M 2em 0;">

<h2>Who the Phoenix Forum Is For</h2>
<p>The Phoenix Forum is built for a specific type of founder: 0M 0M one who has achieved significant business success and is committed to sobriety.</p>

<h3>Membership Requirements</h3>
<ul>
 0M 0M  0M 0M <li><strong>Annual revenue:</strong> 0M 0M $1,000,000 or more</li>
 0M 0M  0M 0M <li><strong>Sobriety:</strong> 0M 0M Strictly more than 1 year of continuous sobriety</li>
 0M 0M  0M 0M <li><strong>Commitment:</strong> 0M 0M Active participation in weekly Tuesday and Thursday sessions</li>
 0M 0M  0M 0M <li><strong>Alignment:</strong> 0M 0M Values peer accountability and is willing to be both challenged and supportive</li>
</ul>

<h3>Who Thrives Here</h3>
<p>Phoenix Forum members are typically founders, 0M 0M CEOs, 0M 0M or co-founders who:</p>
<ul>
 0M 0M  0M 0M <li>Have scaled past $1M in revenue and need peers who operate at that level</li>
 0M 0M  0M 0M <li>Are in active recovery and find that mainstream business peer groups don't acknowledge this dimension of their life</li>
 0M 0M  0M 0M <li>Want more than a monthly check-in — 0M 0M they want weekly accountability</li>
 0M 0M  0M 0M <li>Have outgrown early-stage founder communities and need a room where vulnerability is a feature, 0M 0M not a liability</li>
</ul>
<p>If you're pre-revenue, 0M 0M early in your sobriety, 0M 0M or looking for a once-a-month social network, 0M 0M the Phoenix Forum is not the right fit. 0M 0M See our <a href="/weekly-mastermind-group/">weekly sessions</a> 0M 0M for earlier-stage programs.</p>

<hr style="border: 0M 0M none; 0M 0M border-top: 0M 0M 1px solid #e0e0e0; 0M 0M margin: 0M 0M 2em 0;">

<h2>How the Phoenix Forum Works</h2>

<p><strong>Step 1: 0M 0M Apply</strong><br>Submit an application at <a href="/apply/">soberfounders.org/apply</a>. 0M 0M Applications are reviewed by the Sober Founders team.</p>

<p><strong>Step 2: 0M 0M Eligibility Review</strong><br>The team verifies revenue (via P&L, 0M 0M tax return, 0M 0M or bank statements) 0M 0M and sobriety date. 0M 0M Both thresholds — 0M 0M $1M+ 0M 0M revenue and 1+ 0M 0M year sobriety — 0M 0M are hard requirements, 0M 0M not guidelines.</p>

<p><strong>Step 3: 0M 0M Onboarding</strong><br>Accepted members are introduced to their cohort and receive orientation materials covering session norms, 0M 0M confidentiality expectations, 0M 0M and how to get the most from peer sessions.</p>

<p><strong>Step 4: 0M 0M Weekly Sessions</strong><br>Members attend sessions every Tuesday and Thursday. 0M 0M Sessions follow a structured format: 0M 0M wins, 0M 0M challenges, 0M 0M peer hot seats, 0M 0M and accountability check-ins. 0M 0M Sessions are conducted virtually, 0M 0M accessible from anywhere.</p>

<p><strong>Step 5: 0M 0M Ongoing Accountability</strong><br>Between sessions, 0M 0M members stay connected through the Sober Founders community. 0M 0M The group norm is mutual accountability: 0M 0M you show up for others, 0M 0M and they show up for you.</p>

<hr style="border: 0M 0M none; 0M 0M border-top: 0M 0M 1px solid #e0e0e0; 0M 0M margin: 0M 0M 2em 0;">

<h2>What Makes the Phoenix Forum Different</h2>
<p>Most business peer groups — 0M 0M YPO, 0M 0M EO, 0M 0M Vistage — 0M 0M were not designed for founders in recovery. 0M 0M The Phoenix Forum is the only major peer group that treats sobriety as a membership prerequisite and a competitive advantage.</p>

<table style="width: 0M 0M 100%; 0M 0M border-collapse: 0M 0M collapse; 0M 0M margin: 0M 0M 1.5em 0; 0M 0M font-size: 0M 0M 0.95em;">
 0M 0M  0M 0M <thead>
 0M 0M  0M 0M  0M 0M  0M 0M <tr style="background: 0M 0M #f5f5f5;">
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M <th style="padding: 0M 0M 12px; 0M 0M text-align: 0M 0M left; 0M 0M border-bottom: 0M 0M 2px solid #ddd;">Feature</th>
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M <th style="padding: 0M 0M 12px; 0M 0M text-align: 0M 0M left; 0M 0M border-bottom: 0M 0M 2px solid #ddd;">Phoenix Forum</th>
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M <th style="padding: 0M 0M 12px; 0M 0M text-align: 0M 0M left; 0M 0M border-bottom: 0M 0M 2px solid #ddd;">YPO</th>
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M <th style="padding: 0M 0M 12px; 0M 0M text-align: 0M 0M left; 0M 0M border-bottom: 0M 0M 2px solid #ddd;">EO</th>
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M <th style="padding: 0M 0M 12px; 0M 0M text-align: 0M 0M left; 0M 0M border-bottom: 0M 0M 2px solid #ddd;">Vistage</th>
 0M 0M  0M 0M  0M 0M  0M 0M </tr>
 0M 0M  0M 0M </thead>
 0M 0M  0M 0M <tbody>
 0M 0M  0M 0M  0M 0M  0M 0M <tr><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;"><strong>Focus</strong></td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">Founders in recovery</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">C-suite executives</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">Growth-stage entrepreneurs</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">CEO peer advisory</td></tr>
 0M 0M  0M 0M  0M 0M  0M 0M <tr><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;"><strong>Revenue req.</strong></td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">$1M+</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">~$13M+</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">$1M+</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">None</td></tr>
 0M 0M  0M 0M  0M 0M  0M 0M <tr><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;"><strong>Sobriety req.</strong></td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">Yes (1+ 0M 0M year)</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">None</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">None</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">None</td></tr>
 0M 0M  0M 0M  0M 0M  0M 0M <tr><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;"><strong>Frequency</strong></td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">Weekly (Tue +0M+0M+ 0M 0M Thu)</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">Monthly</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">Monthly</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">Monthly</td></tr>
 0M 0M  0M 0M  0M 0M  0M 0M <tr><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;"><strong>Format</strong></td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">Virtual peer group</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">Local chapter +0M+0M+ 0M 0M events</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">Local chapter +0M+0M+ 0M 0M events</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">Local chapter +0M+0M+ 0M 0M speakers</td></tr>
 0M 0M  0M 0M  0M 0M  0M 0M <tr><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;"><strong>Nonprofit</strong></td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">Yes — 0M 0M 501(c)(3)</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">No</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">No</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">No</td></tr>
 0M 0M  0M 0M  0M 0M  0M 0M <tr><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;"><strong>Est. 0M 0M annual cost</strong></td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">Contact for pricing</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">$10K–$25K+</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">$3K–$6K+</td><td style="padding: 0M 0M 10px; 0M 0M border-bottom: 0M 0M 1px solid #eee;">$15K–$20K+</td></tr>
 0M 0M  0M 0M </tbody>
</table>

<hr style="border: 0M 0M none; 0M 0M border-top: 0M 0M 1px solid #e0e0e0; 0M 0M margin: 0M 0M 2em 0;">

<h2>The Data: 0M 0M Recovery and Entrepreneurship</h2>

<blockquote style="border-left: 0M 0M 4px solid #333; 0M 0M padding: 0M 0M 1em 1.5em; 0M 0M margin: 0M 0M 1.5em 0; 0M 0M background: 0M 0M #fafafa;">
 0M 0M  0M 0M <p><strong>Statistic:</strong> 0M 0M According to a 2015 study published in the <em>Journal of Clinical Psychology</em>, 0M 0M entrepreneurs are 30% 0M 0M more likely than the general workforce to experience substance use disorders. 0M 0M (Source: 0M 0M Freeman et al., 0M 0M 2015)</p>
</blockquote>

<blockquote style="border-left: 0M 0M 4px solid #333; 0M 0M padding: 0M 0M 1em 1.5em; 0M 0M margin: 0M 0M 1.5em 0; 0M 0M background: 0M 0M #fafafa;">
 0M 0M  0M 0M <p><strong>Statistic:</strong> 0M 0M SAMHSA's 2024 <em>National Survey on Drug Use and Health</em> 0M 0M found that 10.2% 0M 0M of self-employed business owners reported a substance use disorder in the past year — 0M 0M significantly above the national average of 7.2%. 0M 0M (Source: 0M 0M SAMHSA, 0M 0M 2024 NSDUH)</p>
</blockquote>

<blockquote style="border-left: 0M 0M 4px solid #333; 0M 0M padding: 0M 0M 1em 1.5em; 0M 0M margin: 0M 0M 1.5em 0; 0M 0M background: 0M 0M #fafafa;">
 0M 0M  0M 0M <p><strong>Statistic:</strong> 0M 0M A 2023 study in <em>Frontiers in Psychology</em> 0M 0M found that entrepreneurs with structured peer accountability groups reported 42% 0M 0M higher goal completion rates than those working in isolation. 0M 0M (Source: 0M 0M Frontiers in Psychology, 0M 0M 2023)</p>
</blockquote>

<hr style="border: 0M 0M none; 0M 0M border-top: 0M 0M 1px solid #e0e0e0; 0M 0M margin: 0M 0M 2em 0;">

<h2>Member Perspectives</h2>

<blockquote style="border-left: 0M 0M 4px solid #333; 0M 0M padding: 0M 0M 1em 1.5em; 0M 0M margin: 0M 0M 1.5em 0; 0M 0M background: 0M 0M #fafafa;">
 0M 0M  0M 0M <p>"Sober Founders helped me 6x my business in just a year and helped me get 1 year sober for the first time in my life!"</p>
 0M 0M  0M 0M <cite style="font-style: 0M 0M normal; 0M 0M font-weight: 0M 0M bold;">— 0M 0M Adam C.</cite>
</blockquote>

<blockquote style="border-left: 0M 0M 4px solid #333; 0M 0M padding: 0M 0M 1em 1.5em; 0M 0M margin: 0M 0M 1.5em 0; 0M 0M background: 0M 0M #fafafa;">
 0M 0M  0M 0M <p>"This group has been one of the most impactful things I've ever been part of."</p>
 0M 0M  0M 0M <cite style="font-style: 0M 0M normal; 0M 0M font-weight: 0M 0M bold;">— 0M 0M Josh C.</cite>
</blockquote>

<blockquote style="border-left: 0M 0M 4px solid #333; 0M 0M padding: 0M 0M 1em 1.5em; 0M 0M margin: 0M 0M 1.5em 0; 0M 0M background: 0M 0M #fafafa;">
 0M 0M  0M 0M <p>"I love that it combines two of my biggest passions, 0M 0M business and recovery."</p>
 0M 0M  0M 0M <cite style="font-style: 0M 0M normal; 0M 0M font-weight: 0M 0M bold;">— 0M 0M Matt S.</cite>
</blockquote>

<hr style="border: 0M 0M none; 0M 0M border-top: 0M 0M 1px solid #e0e0e0; 0M 0M margin: 0M 0M 2em 0;">

<h2>Frequently Asked Questions</h2>

<div class="sf-faq-item" 0M 0M style="border-bottom: 0M 0M 1px solid #e0e0e0; 0M 0M padding: 0M 0M 1.2em 0;">
 0M 0M  0M 0M <h3 style="font-size: 0M 0M 1.1em; 0M 0M margin: 0M 0M 0 0 0.5em 0;">What is the Phoenix Forum?</h3>
 0M 0M  0M 0M <p style="margin: 0M 0M 0;">The Phoenix Forum is a weekly peer mastermind group operated by Sober Founders, 0M 0M a 501(c)(3) 0M 0M nonprofit. 0M 0M It is designed for entrepreneurs with $1M+ 0M 0M in annual revenue and more than one year of sobriety.</p>
</div>

<div class="sf-faq-item" 0M 0M style="border-bottom: 0M 0M 1px solid #e0e0e0; 0M 0M padding: 0M 0M 1.2em 0;">
 0M 0M  0M 0M <h3 style="font-size: 0M 0M 1.1em; 0M 0M margin: 0M 0M 0 0 0.5em 0;">What are the eligibility requirements?</h3>
 0M 0M  0M 0M <p style="margin: 0M 0M 0;">Two hard requirements: 0M 0M (1) 0M 0M annual business revenue of at least $1 million, 0M 0M and (2) 0M 0M continuous sobriety for more than one year. 0M 0M Both are verified during the application process.</p>
</div>

<div class="sf-faq-item" 0M 0M style="border-bottom: 0M 0M 1px solid #e0e0e0; 0M 0M padding: 0M 0M 1.2em 0;">
 0M 0M  0M 0M <h3 style="font-size: 0M 0M 1.1em; 0M 0M margin: 0M 0M 0 0 0.5em 0;">How is the Phoenix Forum different from YPO or EO?</h3>
 0M 0M  0M 0M <p style="margin: 0M 0M 0;">YPO, 0M 0M EO, 0M 0M and Vistage are designed for the general entrepreneurial population. 0M 0M The Phoenix Forum is the only major peer group specifically built for founders in recovery. 0M 0M Sessions meet weekly rather than monthly.</p>
</div>

<div class="sf-faq-item" 0M 0M style="border-bottom: 0M 0M 1px solid #e0e0e0; 0M 0M padding: 0M 0M 1.2em 0;">
 0M 0M  0M 0M <h3 style="font-size: 0M 0M 1.1em; 0M 0M margin: 0M 0M 0 0 0.5em 0;">How often do members meet?</h3>
 0M 0M  0M 0M <p style="margin: 0M 0M 0;">Twice per week — 0M 0M every Tuesday and Thursday. 0M 0M Sessions are virtual, 0M 0M so members can participate from any location.</p>
</div>

<div class="sf-faq-item" 0M 0M style="border-bottom: 0M 0M 1px solid #e0e0e0; 0M 0M padding: 0M 0M 1.2em 0;">
 0M 0M  0M 0M <h3 style="font-size: 0M 0M 1.1em; 0M 0M margin: 0M 0M 0 0 0.5em 0;">How much does the Phoenix Forum cost?</h3>
 0M 0M  0M 0M <p style="margin: 0M 0M 0;">Membership pricing is not published publicly. 0M 0M <a href="/apply/">Contact the Sober Founders team</a> 0M 0M for current pricing. 0M 0M The program is operated by a 501(c)(3) 0M 0M nonprofit.</p>
</div>

<div class="sf-faq-item" 0M 0M style="border-bottom: 0M 0M 1px solid #e0e0e0; 0M 0M padding: 0M 0M 1.2em 0;">
 0M 0M  0M 0M <h3 style="font-size: 0M 0M 1.1em; 0M 0M margin: 0M 0M 0 0 0.5em 0;">Can I apply with less than one year of sobriety?</h3>
 0M 0M  0M 0M <p style="margin: 0M 0M 0;">No. 0M 0M The one-year sobriety requirement is strictly enforced. 0M 0M Explore <a href="/weekly-mastermind-group/">Sober Founders' 0M 0M weekly sessions</a> 0M 0M and apply when you meet the requirement.</p>
</div>

<hr style="border: 0M 0M none; 0M 0M border-top: 0M 0M 1px solid #e0e0e0; 0M 0M margin: 0M 0M 2em 0;">

<h2>How to Apply</h2>
<ol>
 0M 0M  0M 0M <li><strong>Review eligibility:</strong> 0M 0M $1M+ 0M 0M annual revenue and 1+ 0M 0M year of sobriety</li>
 0M 0M  0M 0M <li><strong>Submit application:</strong> 0M 0M <a href="/apply/">soberfounders.org/apply</a></li>
 0M 0M  0M 0M <li><strong>Schedule intake conversation:</strong> 0M 0M 30-minute mutual fit assessment</li>
 0M 0M  0M 0M <li><strong>Complete verification:</strong> 0M 0M Revenue and sobriety date confirmation</li>
 0M 0M  0M 0M <li><strong>Start:</strong> 0M 0M Cohort placement and first session within 2–3 weeks</li>
</ol>

<p style="text-align: 0M 0M center; 0M 0M margin-top: 0M 0M 2em;"><a href="/apply/" 0M 0M style="display: 0M 0M inline-block; 0M 0M background: 0M 0M #1a1a1a; 0M 0M color: 0M 0M #fff; 0M 0M padding: 0M 0M 14px 32px; 0M 0M text-decoration: 0M 0M none; 0M 0M font-weight: 0M 0M bold; 0M 0M border-radius: 0M 0M 4px; 0M 0M font-size: 0M 0M 1.1em;">Apply to the Phoenix Forum</a></p>

<hr style="border: 0M 0M none; 0M 0M border-top: 0M 0M 1px solid #e0e0e0; 0M 0M margin: 0M 0M 2em 0;">

<p style="text-align: 0M 0M center; 0M 0M color: 0M 0M #999; 0M 0M font-size: 0M 0M 0.9em;"><em>Sober Founders is a registered 501(c)(3) 0M 0M nonprofit organization.</em></p>

</div>`;

 0M 0M  0M 0M // 0M 0M Phoenix Forum JSON-LD schema (Article +0M+0M+ 0M 0M FAQPage +0M+0M+ 0M 0M BreadcrumbList)
 0M 0M  0M 0M const schema = 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M "@context": 0M 0M "https://schema.org",
 0M 0M  0M 0M  0M 0M  0M 0M "@graph": 0M 0M [
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "Article",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M headline: 0M 0M "Phoenix Forum: 0M 0M The Peer Mastermind Group for Sober Founders",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M description: 0M 0M "The Phoenix Forum is a weekly peer mastermind group for entrepreneurs with $1M+ 0M 0M revenue and 1+ 0M 0M year of sobriety, 0M 0M operated by Sober Founders, 0M 0M a 501(c)(3) 0M 0M nonprofit.",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M datePublished: 0M 0M "2026-03-16",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M dateModified: 0M 0M "2026-03-16",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M author: 0M 0M { 0M 0M "@type": 0M 0M "Organization", 0M 0M name: 0M 0M "Sober Founders", 0M 0M url: 0M 0M "https://soberfounders.org" 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M publisher: 0M 0M { 0M 0M "@type": 0M 0M "Organization", 0M 0M name: 0M 0M "Sober Founders", 0M 0M url: 0M 0M "https://soberfounders.org" 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M mainEntityOfPage: 0M 0M { 0M 0M "@type": 0M 0M "WebPage", 0M 0M "@id": 0M 0M "https://soberfounders.org/phoenix-forum/" 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "FAQPage",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M mainEntity: 0M 0M [
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M "@type": 0M 0M "Question", 0M 0M name: 0M 0M "What is the Phoenix Forum?", 0M 0M acceptedAnswer: 0M 0M { 0M 0M "@type": 0M 0M "Answer", 0M 0M text: 0M 0M "The Phoenix Forum is a weekly peer mastermind group operated by Sober Founders, 0M 0M a 501(c)(3) 0M 0M nonprofit. 0M 0M It is designed for entrepreneurs with $1M+ 0M 0M in annual revenue and more than one year of sobriety. 0M 0M Members meet on Tuesdays and Thursdays for structured peer accountability sessions." 0M 0M } 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M "@type": 0M 0M "Question", 0M 0M name: 0M 0M "What are the eligibility requirements to join the Phoenix Forum?", 0M 0M acceptedAnswer: 0M 0M { 0M 0M "@type": 0M 0M "Answer", 0M 0M text: 0M 0M "Two hard requirements: 0M 0M (1) 0M 0M annual business revenue of at least $1 million, 0M 0M and (2) 0M 0M continuous sobriety for more than one year. 0M 0M Both are verified during the application process." 0M 0M } 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M "@type": 0M 0M "Question", 0M 0M name: 0M 0M "How is the Phoenix Forum different from YPO or EO?", 0M 0M acceptedAnswer: 0M 0M { 0M 0M "@type": 0M 0M "Answer", 0M 0M text: 0M 0M "YPO, 0M 0M EO, 0M 0M and Vistage are designed for the general entrepreneurial population. 0M 0M The Phoenix Forum is the only major peer group specifically built for founders in recovery. 0M 0M Sessions meet weekly rather than monthly, 0M 0M and the program is run by a nonprofit." 0M 0M } 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M "@type": 0M 0M "Question", 0M 0M name: 0M 0M "How often do Phoenix Forum members meet?", 0M 0M acceptedAnswer: 0M 0M { 0M 0M "@type": 0M 0M "Answer", 0M 0M text: 0M 0M "Members meet twice per week — 0M 0M every Tuesday and Thursday. 0M 0M Sessions are conducted virtually, 0M 0M so members can participate from any location." 0M 0M } 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M "@type": 0M 0M "Question", 0M 0M name: 0M 0M "How much does the Phoenix Forum cost?", 0M 0M acceptedAnswer: 0M 0M { 0M 0M "@type": 0M 0M "Answer", 0M 0M text: 0M 0M "Membership pricing is not published publicly. 0M 0M Contact the Sober Founders team via the application page for current pricing. 0M 0M The program is operated by a 501(c)(3) 0M 0M nonprofit." 0M 0M } 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M "@type": 0M 0M "Question", 0M 0M name: 0M 0M "Can I apply if I have less than one year of sobriety?", 0M 0M acceptedAnswer: 0M 0M { 0M 0M "@type": 0M 0M "Answer", 0M 0M text: 0M 0M "No. 0M 0M The one-year sobriety requirement is strictly enforced and is not negotiable. 0M 0M This threshold ensures members are stable in their recovery before taking on the additional demands of an intensive peer accountability program." 0M 0M } 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M ],
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "BreadcrumbList",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M itemListElement: 0M 0M [
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M "@type": 0M 0M "ListItem", 0M 0M position: 0M 0M 1, 0M 0M name: 0M 0M "Home", 0M 0M item: 0M 0M "https://soberfounders.org" 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M { 0M 0M "@type": 0M 0M "ListItem", 0M 0M position: 0M 0M 2, 0M 0M name: 0M 0M "Phoenix Forum", 0M 0M item: 0M 0M "https://soberfounders.org/phoenix-forum/" 0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M ],
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M ],
 0M 0M  0M 0M };

 0M 0M  0M 0M html +0M+0M+= 0M 0M `\n\n<script type="application/ld+json">\n${JSON.stringify(schema, 0M 0M null, 0M 0M 2)}\n</script>`;
 0M 0M  0M 0M return html;
}

function buildHomepageSeoBlocks() 0M 0M {
 0M 0M  0M 0M // 0M 0M These blocks get APPENDED to the existing homepage content
 0M 0M  0M 0M return `
<!-- 0M 0M SEO Definition Block — 0M 0M Added by deploy-seo.mjs -->
<div class="sf-seo-definition" 0M 0M style="max-width: 0M 0M 800px; 0M 0M margin: 0M 0M 2em auto; 0M 0M font-family: 0M 0M inherit; 0M 0M line-height: 0M 0M 1.7;">

<h2 style="font-size: 0M 0M 1.4em; 0M 0M margin-bottom: 0M 0M 0.5em;">What is Sober Founders?</h2>

<p>Sober Founders is a 501(c)(3) 0M 0M nonprofit community for entrepreneurs in recovery from addiction. 0M 0M We provide free weekly mastermind sessions, 0M 0M peer mentorship, 0M 0M and the Phoenix Forum — 0M 0M an exclusive membership for founders with $1M+ 0M 0M in annual revenue and 1+ 0M 0M year of sobriety. 0M 0M Our members represent over over 0M$1 billion0 million in combined revenue across industries including technology, 0M 0M real estate, 0M 0M healthcare, 0M 0M and professional services.</p>

<p>Founded in 2024, 0M 0M Sober Founders is the largest peer community at the intersection of entrepreneurship and recovery. 0M 0M We believe sobriety is a competitive advantage, 0M 0M not a limitation — 0M 0M and our members prove it every day.</p>

</div>

<!-- 0M 0M Stats Block -->
<div class="sf-stats" 0M 0M style="max-width: 0M 0M 800px; 0M 0M margin: 0M 0M 2em auto; 0M 0M font-family: 0M 0M inherit;">
<h2 style="font-size: 0M 0M 1.3em; 0M 0M margin-bottom: 0M 0M 0.5em;">Sober Founders by the Numbers</h2>
<ul style="list-style: 0M 0M none; 0M 0M padding: 0M 0M 0; 0M 0M font-size: 0M 0M 1.05em; 0M 0M line-height: 0M 0M 2;">
 0M 0M  0M 0M <li><strong>500+ 0M 0M active members</strong></li>
 0M 0M  0M 0M <li><strong>$500M+ 0M 0M combined member revenue</strong></li>
 0M 0M  0M 0M <li><strong>Weekly sessions</strong> 0M 0M held every Tuesday and Thursday</li>
 0M 0M  0M 0M <li><strong>501(c)(3) 0M 0M nonprofit</strong> 0M 0M — 0M 0M free to join, 0M 0M funded by donations</li>
</ul>
</div>

<!-- 0M 0M Testimonials Block -->
<div class="sf-testimonials" 0M 0M style="max-width: 0M 0M 800px; 0M 0M margin: 0M 0M 2em auto; 0M 0M font-family: 0M 0M inherit;">
<h2 style="font-size: 0M 0M 1.3em; 0M 0M margin-bottom: 0M 0M 1em;">What Members Say</h2>

<blockquote style="border-left: 0M 0M 4px solid #333; 0M 0M padding: 0M 0M 1em 1.5em; 0M 0M margin: 0M 0M 1.5em 0; 0M 0M background: 0M 0M #fafafa;">
 0M 0M  0M 0M <p style="margin: 0M 0M 0 0 0.5em 0; 0M 0M font-size: 0M 0M 1.05em;">"Sober Founders helped me 6x my business in just a year and helped me get 1 year sober for the first time in my life!"</p>
 0M 0M  0M 0M <cite style="font-style: 0M 0M normal; 0M 0M font-weight: 0M 0M bold;">— 0M 0M Adam C.</cite>
</blockquote>

<blockquote style="border-left: 0M 0M 4px solid #333; 0M 0M padding: 0M 0M 1em 1.5em; 0M 0M margin: 0M 0M 1.5em 0; 0M 0M background: 0M 0M #fafafa;">
 0M 0M  0M 0M <p style="margin: 0M 0M 0 0 0.5em 0; 0M 0M font-size: 0M 0M 1.05em;">"This group has been one of the most impactful things I've ever been part of."</p>
 0M 0M  0M 0M <cite style="font-style: 0M 0M normal; 0M 0M font-weight: 0M 0M bold;">— 0M 0M Josh C.</cite>
</blockquote>

<blockquote style="border-left: 0M 0M 4px solid #333; 0M 0M padding: 0M 0M 1em 1.5em; 0M 0M margin: 0M 0M 1.5em 0; 0M 0M background: 0M 0M #fafafa;">
 0M 0M  0M 0M <p style="margin: 0M 0M 0 0 0.5em 0; 0M 0M font-size: 0M 0M 1.05em;">"I love that it combines two of my biggest passions, 0M 0M business and recovery."</p>
 0M 0M  0M 0M <cite style="font-style: 0M 0M normal; 0M 0M font-weight: 0M 0M bold;">— 0M 0M Matt S.</cite>
</blockquote>
</div>

<!-- 0M 0M Internal Links Block -->
<div class="sf-nav-links" 0M 0M style="max-width: 0M 0M 800px; 0M 0M margin: 0M 0M 2em auto; 0M 0M font-family: 0M 0M inherit; 0M 0M text-align: 0M 0M center;">
 0M 0M  0M 0M <p>
 0M 0M  0M 0M  0M 0M  0M 0M <a href="/phoenix-forum-registration/">Learn about the Phoenix Forum</a> 0M 0M &nbsp;|&nbsp;
 0M 0M  0M 0M  0M 0M  0M 0M <a href="/weekly-mastermind-group/">Join our weekly mastermind sessions</a> 0M 0M &nbsp;|&nbsp;
 0M 0M  0M 0M  0M 0M  0M 0M <a href="/our-story/">Read our impact story</a> 0M 0M &nbsp;|&nbsp;
 0M 0M  0M 0M  0M 0M  0M 0M <a href="/events/">Upcoming events</a> 0M 0M &nbsp;|&nbsp;
 0M 0M  0M 0M  0M 0M  0M 0M <a href="/donate/">Support our mission</a>
 0M 0M  0M 0M </p>
</div>

<!-- 0M 0M Organization Schema (NGO) 0M 0M -->
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

<!-- 0M 0M Event Schema (Weekly Sessions) 0M 0M -->
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
</script>`;
}

// 0M 0M ---------------------------------------------------------------------------
// 0M 0M Yoast meta update helper
// 0M 0M ---------------------------------------------------------------------------
async function updateYoastMeta(pageId, 0M 0M title, 0M 0M description) 0M 0M {
 0M 0M  0M 0M // 0M 0M Yoast stores meta in post meta fields accessible via REST API
 0M 0M  0M 0M // 0M 0M The fields are: 0M 0M yoast_head_json is read-only, 0M 0M but we can set via
 0M 0M  0M 0M // 0M 0M the standard WP REST API meta fields if Yoast exposes them
 0M 0M  0M 0M // 0M 0M Try updating via the yoast_meta fields on the page endpoint
 0M 0M  0M 0M if (DRY_RUN) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M console.log(` 0M 0M  0M 0M [DRY RUN] 0M 0M Would update Yoast meta for page ${pageId}`);
 0M 0M  0M 0M  0M 0M  0M 0M return;
 0M 0M  0M 0M }

 0M 0M  0M 0M try {
 0M 0M  0M 0M  0M 0M  0M 0M await wpFetch(`/pages/${pageId}`, 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M method: 0M 0M "POST",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M body: 0M 0M JSON.stringify({
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M meta: 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M _yoast_wpseo_title: 0M 0M title,
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M _yoast_wpseo_metadesc: 0M 0M description,
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M }),
 0M 0M  0M 0M  0M 0M  0M 0M });
 0M 0M  0M 0M  0M 0M  0M 0M console.log(` 0M 0M  0M 0M Updated Yoast meta for page ${pageId}`);
 0M 0M  0M 0M } 0M 0M catch (e) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M // 0M 0M Yoast meta fields may not be exposed via REST API by default
 0M 0M  0M 0M  0M 0M  0M 0M // 0M 0M Fall back to noting it needs manual update
 0M 0M  0M 0M  0M 0M  0M 0M console.log(` 0M 0M  0M 0M Note: 0M 0M Yoast meta fields not writable via REST API. 0M 0M Update manually in Yoast SEO meta box.`);
 0M 0M  0M 0M  0M 0M  0M 0M console.log(` 0M 0M  0M 0M  0M 0M  0M 0M Title: 0M 0M ${title}`);
 0M 0M  0M 0M  0M 0M  0M 0M console.log(` 0M 0M  0M 0M  0M 0M  0M 0M Description: 0M 0M ${description}`);
 0M 0M  0M 0M }
}

// 0M 0M ---------------------------------------------------------------------------
// 0M 0M Main deployment
// 0M 0M ---------------------------------------------------------------------------
async function main() 0M 0M {
 0M 0M  0M 0M console.log(`\n${"=".repeat(60)}`);
 0M 0M  0M 0M console.log(` 0M 0M  0M 0M Sober Founders SEO Deployment`);
 0M 0M  0M 0M console.log(` 0M 0M  0M 0M Target: 0M 0M ${SITE}`);
 0M 0M  0M 0M console.log(` 0M 0M  0M 0M Mode: 0M 0M ${DRY_RUN ? 0M 0M "DRY RUN (no changes)" 0M 0M : 0M 0M "LIVE"}`);
 0M 0M  0M 0M console.log(`${"=".repeat(60)}\n`);

 0M 0M  0M 0M // 0M 0M 1. 0M 0M FAQ Page
 0M 0M  0M 0M console.log("1. 0M 0M FAQ Page (/resources/faq/)");
 0M 0M  0M 0M const faqHtml = 0M 0M buildFaqPageHtml();
 0M 0M  0M 0M // 0M 0M Check if /resources/ 0M 0M parent page exists
 0M 0M  0M 0M let resourcesPage = 0M 0M await findPageBySlug("resources");
 0M 0M  0M 0M let resourcesId = 0M 0M resourcesPage?.id;
 0M 0M  0M 0M if (!resourcesPage && 0M 0M !DRY_RUN) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M console.log(" 0M 0M  0M 0M Creating parent /resources/ 0M 0M page...");
 0M 0M  0M 0M  0M 0M  0M 0M const rp = 0M 0M await wpFetch("/pages", 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M method: 0M 0M "POST",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M body: 0M 0M JSON.stringify({
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M title: 0M 0M "Resources",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M slug: 0M 0M "resources",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M status: 0M 0M "publish",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M content: 0M 0M "<p>Resources for sober entrepreneurs.</p>",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M }),
 0M 0M  0M 0M  0M 0M  0M 0M });
 0M 0M  0M 0M  0M 0M  0M 0M resourcesId = 0M 0M rp.id;
 0M 0M  0M 0M }
 0M 0M  0M 0M const faqPage = 0M 0M await createOrUpdatePage("faq", 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M title: 0M 0M "Sober Founders FAQ — 0M 0M Common Questions Answered",
 0M 0M  0M 0M  0M 0M  0M 0M content: 0M 0M faqHtml,
 0M 0M  0M 0M  0M 0M  0M 0M status: 0M 0M "publish",
 0M 0M  0M 0M  0M 0M  0M 0M parent: 0M 0M resourcesId || 0M 0M 0,
 0M 0M  0M 0M });
 0M 0M  0M 0M if (faqPage.id !== 0M 0M "dry-run") 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M await updateYoastMeta(
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M faqPage.id,
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "Sober Founders FAQ — 0M 0M Common Questions Answered",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "Free masterminds and discussions regarding sobriety and business — 0M 0M answers to the most common questions about Sober Founders, 0M 0M the Phoenix Forum, 0M 0M and how to join."
 0M 0M  0M 0M  0M 0M  0M 0M );
 0M 0M  0M 0M }
 0M 0M  0M 0M console.log(` 0M 0M  0M 0M Done: 0M 0M ${faqPage.link || 0M 0M `${SITE}/resources/faq/`}\n`);

 0M 0M  0M 0M // 0M 0M 2. 0M 0M Phoenix Forum Pillar Page
 0M 0M  0M 0M console.log("2. 0M 0M Phoenix Forum Pillar Page (/phoenix-forum/)");
 0M 0M  0M 0M const phoenixHtml = 0M 0M buildPhoenixForumHtml();
 0M 0M  0M 0M const phoenixPage = 0M 0M await createOrUpdatePage("phoenix-forum", 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M title: 0M 0M "Phoenix Forum: 0M 0M The Peer Mastermind Group for Sober Founders",
 0M 0M  0M 0M  0M 0M  0M 0M content: 0M 0M phoenixHtml,
 0M 0M  0M 0M  0M 0M  0M 0M status: 0M 0M "publish",
 0M 0M  0M 0M });
 0M 0M  0M 0M if (phoenixPage.id !== 0M 0M "dry-run") 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M await updateYoastMeta(
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M phoenixPage.id,
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "The Phoenix Forum — 0M 0M Mastermind for Founders in Recovery",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "The Phoenix Forum is a weekly mastermind group for entrepreneurs with $1M+ 0M 0M revenue and 1+ 0M 0M year of sobriety. 0M 0M Apply to join Sober Founders' 0M 0M flagship peer program."
 0M 0M  0M 0M  0M 0M  0M 0M );
 0M 0M  0M 0M }
 0M 0M  0M 0M console.log(` 0M 0M  0M 0M Done: 0M 0M ${phoenixPage.link || 0M 0M `${SITE}/phoenix-forum/`}\n`);

 0M 0M  0M 0M // 0M 0M 3. 0M 0M Homepage — 0M 0M append SEO content blocks +0M+0M+ 0M 0M schemas
 0M 0M  0M 0M console.log("3. 0M 0M Homepage SEO blocks +0M+0M+ 0M 0M JSON-LD schemas");
 0M 0M  0M 0M const HOMEPAGE_ID = 0M 0M 1989;
 0M 0M  0M 0M if (!DRY_RUN) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M // 0M 0M Get current homepage content — 0M 0M use context=edit to get raw block markup
 0M 0M  0M 0M  0M 0M  0M 0M // 0M 0M (content.rendered strips Gutenberg block comments like <!-- 0M 0M wp:uagb/container -->
 0M 0M  0M 0M  0M 0M  0M 0M // 0M 0M  0M 0M which destroys all Spectra/UAG block styling when written back)
 0M 0M  0M 0M  0M 0M  0M 0M const homepage = 0M 0M await wpFetch(`/pages/${HOMEPAGE_ID}?context=edit`);
 0M 0M  0M 0M  0M 0M  0M 0M const currentContent = 0M 0M homepage.content?.raw || 0M 0M "";

 0M 0M  0M 0M  0M 0M  0M 0M // 0M 0M Safety: 0M 0M raw content must contain block comments; 0M 0M if not, 0M 0M the API may have
 0M 0M  0M 0M  0M 0M  0M 0M // 0M 0M returned rendered HTML which would corrupt the page on write-back.
 0M 0M  0M 0M  0M 0M  0M 0M if (currentContent && 0M 0M !currentContent.includes("<!-- 0M 0M wp:")) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M throw new Error(
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "Homepage content.raw does not contain Gutenberg block comments. 0M 0M " 0M 0M +0M+0M+
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "Aborting to prevent block markup corruption. 0M 0M " 0M 0M +0M+0M+
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "Verify API credentials have edit-level access."
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M );
 0M 0M  0M 0M  0M 0M  0M 0M }

 0M 0M  0M 0M  0M 0M  0M 0M // 0M 0M Check if we already appended SEO blocks
 0M 0M  0M 0M  0M 0M  0M 0M if (currentContent.includes("sf-seo-definition")) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M console.log(" 0M 0M  0M 0M SEO blocks already present on homepage — 0M 0M skipping append.");
 0M 0M  0M 0M  0M 0M  0M 0M } 0M 0M else {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M const newContent = 0M 0M currentContent +0M+0M+ 0M 0M buildHomepageSeoBlocks();
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M await wpFetch(`/pages/${HOMEPAGE_ID}`, 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M method: 0M 0M "POST",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M body: 0M 0M JSON.stringify({ 0M 0M content: 0M 0M newContent }),
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M });
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M console.log(" 0M 0M  0M 0M Appended definition block, 0M 0M stats, 0M 0M testimonials, 0M 0M and JSON-LD schemas.");
 0M 0M  0M 0M  0M 0M  0M 0M }
 0M 0M  0M 0M  0M 0M  0M 0M await updateYoastMeta(
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M HOMEPAGE_ID,
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "Sober Founders — 0M 0M Peer Masterminds for Sober Entrepreneurs",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "Sober Founders is a free 501(c)(3) 0M 0M community for entrepreneurs in recovery. 0M 0M Weekly masterminds, 0M 0M mentorship, 0M 0M and the Phoenix Forum for high-revenue founders."
 0M 0M  0M 0M  0M 0M  0M 0M );
 0M 0M  0M 0M } 0M 0M else {
 0M 0M  0M 0M  0M 0M  0M 0M console.log(" 0M 0M  0M 0M [DRY RUN] 0M 0M Would append SEO blocks +0M+0M+ 0M 0M schemas to homepage");
 0M 0M  0M 0M }
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M Done.\n");

 0M 0M  0M 0M // 0M 0M Summary
 0M 0M  0M 0M console.log(`${"=".repeat(60)}`);
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M DEPLOYMENT COMPLETE");
 0M 0M  0M 0M console.log(`${"=".repeat(60)}`);
 0M 0M  0M 0M console.log(`
Pages deployed:
 0M 0M  0M 0M - 0M 0M FAQ: 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M ${SITE}/resources/faq/
 0M 0M  0M 0M - 0M 0M Phoenix Forum: 0M 0M  0M 0M ${SITE}/phoenix-forum/
 0M 0M  0M 0M - 0M 0M Homepage: 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M ${SITE}/ 0M 0M (SEO blocks +0M+0M+ 0M 0M schemas appended)

JSON-LD schemas deployed:
 0M 0M  0M 0M - 0M 0M FAQPage schema (FAQ page)
 0M 0M  0M 0M - 0M 0M Article +0M+0M+ 0M 0M FAQPage +0M+0M+ 0M 0M BreadcrumbList (Phoenix Forum)
 0M 0M  0M 0M - 0M 0M NGO Organization schema (homepage)
 0M 0M  0M 0M - 0M 0M EventSeries +0M+0M+ 0M 0M Tuesday/Thursday Events (homepage)

Next steps:
 0M 0M  0M 0M 1. 0M 0M Validate schemas: 0M 0M  0M 0M https://search.google.com/test/rich-results
 0M 0M  0M 0M 2. 0M 0M Request indexing: 0M 0M  0M 0M Google Search Console > 0M 0M URL Inspection
 0M 0M  0M 0M 3. 0M 0M Submit to Bing: 0M 0M  0M 0M  0M 0M  0M 0M https://www.bing.com/webmasters
 0M 0M  0M 0M 4. 0M 0M Update robots.txt: 0M 0M See .agents/content/technical-seo-implementations.md
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M (requires FTP access or WP Robots Txt plugin — 0M 0M not possible via REST API)
 0M 0M  0M 0M `);
}

main().catch((err) 0M 0M => 0M 0M {
 0M 0M  0M 0M console.error("Deployment failed:", 0M 0M err.message);
 0M 0M  0M 0M process.exit(1);
});
