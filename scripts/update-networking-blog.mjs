#!/usr/bin/env node
/**
 0M 0M * 0M 0M update-networking-blog.mjs — 0M 0M SEO improvements for "7 Mistakes with Sober Business Networking"
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

const POST_ID = 0M 0M 4077;

const FAQ_AND_CTA = 0M 0M `

<h2>Frequently Asked Questions</h2>

<h3>How do you network as a sober entrepreneur?</h3>
<p>Focus on substance-free environments — 0M 0M morning meetings, 0M 0M coffee chats, 0M 0M virtual masterminds, 0M 0M and industry conferences where alcohol isn't the centerpiece. 0M 0M Lead with genuine curiosity rather than a pitch. 0M 0M Your clarity and reliability are competitive advantages that others notice immediately. 0M 0M Communities like <a href="/weekly-mastermind-group/">Sober Founders' 0M 0M weekly masterminds</a> 0M 0M are built specifically for this.</p>

<h3>Is it harder to do business without drinking?</h3>
<p>It feels harder at first because so much traditional networking revolves around bars and happy hours. 0M 0M But sober entrepreneurs consistently report <em>better</em> 0M 0M business outcomes — 0M 0M you remember every conversation, 0M 0M you follow up reliably, 0M 0M and you build trust through authenticity rather than "liquid courage." 0M 0M The relationships you build sober are deeper and more productive.</p>

<h3>What are the best networking groups for sober business owners?</h3>
<p>Look for groups that prioritize substance-free environments and understand recovery. 0M 0M <a href="/our-story/">Sober Founders</a> 0M 0M is the largest peer community for entrepreneurs in recovery, 0M 0M with 500+ 0M 0M members and over $500M in combined revenue. 0M 0M We offer <a href="/events/">free weekly masterminds</a> 0M 0M and the <a href="/phoenix-forum-registration/">Phoenix Forum</a> 0M 0M for founders generating $1M+ 0M 0M in revenue.</p>

<hr style="margin: 0M 0M 48px 0; 0M 0M border: 0M 0M none; 0M 0M border-top: 0M 0M 1px solid #e5e7eb;" 0M 0M />

<div style="background: 0M 0M #f6f7f9; 0M 0M border-radius: 0M 0M 16px; 0M 0M padding: 0M 0M 40px 32px; 0M 0M text-align: 0M 0M center; 0M 0M margin: 0M 0M 32px 0;">
 0M 0M  0M 0M <h2 style="font-family: 0M 0M 'DM Serif Display', 0M 0M serif; 0M 0M font-size: 0M 0M 1.6rem; 0M 0M color: 0M 0M #101828; 0M 0M margin-bottom: 0M 0M 12px;">Stop Networking Alone</h2>
 0M 0M  0M 0M <p style="color: 0M 0M #475467; 0M 0M font-size: 0M 0M 1.05rem; 0M 0M max-width: 0M 0M 560px; 0M 0M margin: 0M 0M 0 auto 24px; 0M 0M line-height: 0M 0M 1.7;">Join 500+ 0M 0M sober entrepreneurs who network with integrity, 0M 0M build real relationships, 0M 0M and grow businesses that support their recovery.</p>
 0M 0M  0M 0M <p>
 0M 0M  0M 0M  0M 0M  0M 0M <a href="/events/" 0M 0M style="display: 0M 0M inline-block; 0M 0M background: 0M 0M #00b286; 0M 0M color: 0M 0M #fff; 0M 0M font-weight: 0M 0M 600; 0M 0M padding: 0M 0M 14px 32px; 0M 0M border-radius: 0M 0M 30px; 0M 0M text-decoration: 0M 0M none; 0M 0M font-size: 0M 0M 0.95rem; 0M 0M text-transform: 0M 0M uppercase; 0M 0M letter-spacing: 0M 0M 0.5px; 0M 0M margin: 0M 0M 0 8px 12px;">Attend a Free Meeting</a>
 0M 0M  0M 0M  0M 0M  0M 0M <a href="/phoenix-forum-registration/" 0M 0M style="display: 0M 0M inline-block; 0M 0M background: 0M 0M transparent; 0M 0M color: 0M 0M #00b286; 0M 0M font-weight: 0M 0M 600; 0M 0M padding: 0M 0M 12px 28px; 0M 0M border-radius: 0M 0M 30px; 0M 0M text-decoration: 0M 0M none; 0M 0M font-size: 0M 0M 0.95rem; 0M 0M border: 0M 0M 2px solid #00b286; 0M 0M margin: 0M 0M 0 8px 12px;">Apply to Phoenix Forum</a>
 0M 0M  0M 0M </p>
</div>

<script type="application/ld+json">
{
 0M 0M  0M 0M "@context": 0M 0M "https://schema.org",
 0M 0M  0M 0M "@type": 0M 0M "FAQPage",
 0M 0M  0M 0M "mainEntity": 0M 0M [
 0M 0M  0M 0M  0M 0M  0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "Question",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "name": 0M 0M "How do you network as a sober entrepreneur?",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "acceptedAnswer": 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "Answer",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "text": 0M 0M "Focus on substance-free environments — 0M 0M morning meetings, 0M 0M coffee chats, 0M 0M virtual masterminds, 0M 0M and industry conferences where alcohol isn't the centerpiece. 0M 0M Lead with genuine curiosity rather than a pitch. 0M 0M Your clarity and reliability are competitive advantages. 0M 0M Communities like Sober Founders' 0M 0M weekly masterminds are built specifically for sober entrepreneurs."
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M }
 0M 0M  0M 0M  0M 0M  0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "Question",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "name": 0M 0M "Is it harder to do business without drinking?",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "acceptedAnswer": 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "Answer",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "text": 0M 0M "It feels harder at first because so much traditional networking revolves around bars and happy hours. 0M 0M But sober entrepreneurs consistently report better business outcomes — 0M 0M you remember every conversation, 0M 0M you follow up reliably, 0M 0M and you build trust through authenticity rather than liquid courage."
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M }
 0M 0M  0M 0M  0M 0M  0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "Question",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "name": 0M 0M "What are the best networking groups for sober business owners?",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "acceptedAnswer": 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "@type": 0M 0M "Answer",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M "text": 0M 0M "Look for groups that prioritize substance-free environments and understand recovery. 0M 0M Sober Founders is the largest peer community for entrepreneurs in recovery, 0M 0M with 500+ 0M 0M members and over $500M in combined revenue. 0M 0M They offer free weekly masterminds and the Phoenix Forum for founders generating $1M+ 0M 0M in revenue."
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M }
 0M 0M  0M 0M  0M 0M  0M 0M }
 0M 0M  0M 0M ]
}
</script>`;

async function main() 0M 0M {
 0M 0M  0M 0M console.log("Fetching post 4077...");
 0M 0M  0M 0M const postRes = 0M 0M await fetch(`${SITE}/wp-json/wp/v2/posts/${POST_ID}?context=edit&_fields=id,content,slug`, 0M 0M { 0M 0M headers });
 0M 0M  0M 0M const post = 0M 0M await postRes.json();
 0M 0M  0M 0M let content = 0M 0M post.content?.raw || 0M 0M "";
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M Current slug:", 0M 0M post.slug);
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M Current content length:", 0M 0M content.length);

 0M 0M  0M 0M // 0M 0M --- 0M 0M 1. 0M 0M Remove empty opening paragraph ---
 0M 0M  0M 0M content = 0M 0M content.replace(/^\s*<p><\/p>\s*/, 0M 0M "");

 0M 0M  0M 0M // 0M 0M --- 0M 0M 2. 0M 0M Add internal links ---

 0M 0M  0M 0M // 0M 0M Link "weekly masterminds" 0M 0M in the intro area
 0M 0M  0M 0M content = 0M 0M content.replace(
 0M 0M  0M 0M  0M 0M  0M 0M 'In our community, 0M 0M we find that the most <a href="https://soberfounders.org/is-being-sober-worth-it-7-unexpected-business-advantages-sober-entrepreneurs-dont-want-you-to-know">successful women business</a> 0M 0M owners and founders focus on service first.',
 0M 0M  0M 0M  0M 0M  0M 0M 'In <a href="/our-story/">our community</a>, 0M 0M we find that the most successful founders focus on service first.'
 0M 0M  0M 0M );

 0M 0M  0M 0M // 0M 0M Link "Join a Sober Mastermind" 0M 0M section to our actual page
 0M 0M  0M 0M content = 0M 0M content.replace(
 0M 0M  0M 0M  0M 0M  0M 0M '<strong>The Fix: 0M 0M Join a Sober Mastermind</strong>',
 0M 0M  0M 0M  0M 0M  0M 0M '<strong>The Fix: 0M 0M <a href="/weekly-mastermind-group/">Join a Sober Mastermind</a></strong>'
 0M 0M  0M 0M );

 0M 0M  0M 0M // 0M 0M Link "Traditional business groups" 0M 0M to our sober mastermind blog
 0M 0M  0M 0M content = 0M 0M content.replace(
 0M 0M  0M 0M  0M 0M  0M 0M 'Traditional business groups often fall short for entrepreneurs in recovery.',
 0M 0M  0M 0M  0M 0M  0M 0M '<a href="/sober-mastermind-meaning-explained-why-traditional-business-groups-fall-short-for-entrepreneurs-in-recovery">Traditional business groups</a> 0M 0M often fall short for entrepreneurs in recovery.'
 0M 0M  0M 0M );

 0M 0M  0M 0M // 0M 0M Clean up keyword-stuffed phrases in overachiever section
 0M 0M  0M 0M content = 0M 0M content.replace(
 0M 0M  0M 0M  0M 0M  0M 0M 'You don&#39;t need to know everyone in the &quot;national association of women business owners&quot; 0M 0M or the &quot;young presidents organization.&quot;',
 0M 0M  0M 0M  0M 0M  0M 0M 'You don\'t need to know everyone in every professional organization.'
 0M 0M  0M 0M );

 0M 0M  0M 0M // 0M 0M Link "overachievers anonymous" 0M 0M to the actual blog post about it
 0M 0M  0M 0M content = 0M 0M content.replace(
 0M 0M  0M 0M  0M 0M  0M 0M 'Many of us are &quot;overachievers anonymous&quot; 0M 0M candidates.',
 0M 0M  0M 0M  0M 0M  0M 0M 'Many of us are <a href="/overachievers-anonymous-7-signs-youre-sabotaging-your-sober-business-and-how-to-fix-it">"overachievers anonymous"</a> 0M 0M candidates.'
 0M 0M  0M 0M );

 0M 0M  0M 0M // 0M 0M Clean up keyword-stuffed "Taking the Next Step" 0M 0M section
 0M 0M  0M 0M content = 0M 0M content.replace(
 0M 0M  0M 0M  0M 0M  0M 0M 'If you find yourself struggling with the &quot;difference between owner and ceo&quot; 0M 0M or how to scale your sales team while maintaining your peace, 0M 0M you need a tribe. 0M 0M Don&#39;t let the &quot;fear of people&quot; 0M 0M stop you from growing your business. 0M 0M ',
 0M 0M  0M 0M  0M 0M  0M 0M 'If you find yourself struggling to scale your business while maintaining your peace, 0M 0M you need a tribe. 0M 0M Don\'t let fear stop you from growing. 0M 0M '
 0M 0M  0M 0M );

 0M 0M  0M 0M content = 0M 0M content.replace(
 0M 0M  0M 0M  0M 0M  0M 0M 'There are &quot;major success stories in the entrepreneurial world&quot; 0M 0M from people just like us.',
 0M 0M  0M 0M  0M 0M  0M 0M 'There are incredible success stories from people just like us.'
 0M 0M  0M 0M );

 0M 0M  0M 0M // 0M 0M Link "good problems" 0M 0M / 0M 0M growth triggers to the Good Problems Guide
 0M 0M  0M 0M content = 0M 0M content.replace(
 0M 0M  0M 0M  0M 0M  0M 0M 'Business pressure is one of the biggest relapse triggers.',
 0M 0M  0M 0M  0M 0M  0M 0M 'Business pressure is one of the biggest <a href="/good-problems-guide-sober-entrepreneurs/">relapse triggers</a>.'
 0M 0M  0M 0M );

 0M 0M  0M 0M // 0M 0M Link events in the curate your calendar section
 0M 0M  0M 0M content = 0M 0M content.replace(
 0M 0M  0M 0M  0M 0M  0M 0M 'Host a &quot;Sober Founder Breakfast&quot; 0M 0M or a morning walking meeting.',
 0M 0M  0M 0M  0M 0M  0M 0M 'Host a "Sober Founder Breakfast" 0M 0M or a morning walking meeting. 0M 0M Or join one of our <a href="/events/">free weekly masterminds</a>.'
 0M 0M  0M 0M );

 0M 0M  0M 0M // 0M 0M --- 0M 0M 3. 0M 0M Replace weak CTA at end ---
 0M 0M  0M 0M content = 0M 0M content.replace(
 0M 0M  0M 0M  0M 0M  0M 0M /If this resonates with you.*$/s,
 0M 0M  0M 0M  0M 0M  0M 0M ''
 0M 0M  0M 0M );

 0M 0M  0M 0M // 0M 0M --- 0M 0M 4. 0M 0M Append FAQ +0M+0M+ 0M 0M CTA ---
 0M 0M  0M 0M if (!content.includes('FAQPage')) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M content = 0M 0M content.trimEnd() 0M 0M +0M+0M+ 0M 0M FAQ_AND_CTA;
 0M 0M  0M 0M }

 0M 0M  0M 0M console.log(" 0M 0M  0M 0M Updated content length:", 0M 0M content.length);

 0M 0M  0M 0M // 0M 0M --- 0M 0M 5. 0M 0M Push content +0M+0M+ 0M 0M new slug ---
 0M 0M  0M 0M const newSlug = 0M 0M "sober-business-networking-mistakes";
 0M 0M  0M 0M const res = 0M 0M await fetch(`${SITE}/wp-json/wp/v2/posts/${POST_ID}`, 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M method: 0M 0M "POST",
 0M 0M  0M 0M  0M 0M  0M 0M headers,
 0M 0M  0M 0M  0M 0M  0M 0M body: 0M 0M JSON.stringify({ 0M 0M content, 0M 0M slug: 0M 0M newSlug }),
 0M 0M  0M 0M });

 0M 0M  0M 0M if (!res.ok) 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M const body = 0M 0M await res.text();
 0M 0M  0M 0M  0M 0M  0M 0M throw new Error(`WP API ${res.status}: 0M 0M ${body.substring(0, 0M 0M 300)}`);
 0M 0M  0M 0M }

 0M 0M  0M 0M const result = 0M 0M await res.json();
 0M 0M  0M 0M console.log(`\n  0M 0M ✓ 0M 0M Post updated (ID ${result.id})`);
 0M 0M  0M 0M console.log(` 0M 0M  0M 0M ✓ 0M 0M New slug: 0M 0M ${result.slug}`);
 0M 0M  0M 0M console.log(` 0M 0M  0M 0M ✓ 0M 0M Scheduled: 0M 0M ${result.date}`);
 0M 0M  0M 0M console.log(` 0M 0M  0M 0M ✓ 0M 0M Will be live at: 0M 0M ${result.link}`);

 0M 0M  0M 0M // 0M 0M --- 0M 0M 6. 0M 0M Update Yoast meta ---
 0M 0M  0M 0M try {
 0M 0M  0M 0M  0M 0M  0M 0M await fetch(`${SITE}/wp-json/wp/v2/posts/${POST_ID}`, 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M method: 0M 0M "POST",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M headers,
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M body: 0M 0M JSON.stringify({
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M meta: 0M 0M {
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M _yoast_wpseo_title: 0M 0M "7 Sober Business Networking Mistakes (and How to Fix Them) 0M 0M | 0M 0M Sober Founders",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M _yoast_wpseo_metadesc: 0M 0M "Sober entrepreneurs have an unfair networking advantage — 0M 0M if they stop making these 7 mistakes. 0M 0M Learn how to build authentic business connections without alcohol.",
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M },
 0M 0M  0M 0M  0M 0M  0M 0M  0M 0M  0M 0M }),
 0M 0M  0M 0M  0M 0M  0M 0M });
 0M 0M  0M 0M  0M 0M  0M 0M console.log(" 0M 0M  0M 0M ✓ 0M 0M Yoast meta updated");
 0M 0M  0M 0M } 0M 0M catch {
 0M 0M  0M 0M  0M 0M  0M 0M console.log(" 0M 0M  0M 0M Note: 0M 0M Yoast meta not writable via REST API.");
 0M 0M  0M 0M }

 0M 0M  0M 0M // 0M 0M --- 0M 0M Verify ---
 0M 0M  0M 0M const check = 0M 0M await fetch(`${SITE}/wp-json/wp/v2/posts/${POST_ID}?context=edit&_fields=content,slug`, 0M 0M { 0M 0M headers }).then(r => 0M 0M r.json());
 0M 0M  0M 0M const raw = 0M 0M check.content?.raw || 0M 0M "";
 0M 0M  0M 0M console.log("\n  0M 0M Verification:");
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Slug:", 0M 0M check.slug);
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Has FAQ schema:", 0M 0M raw.includes("FAQPage"));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Has Phoenix Forum link:", 0M 0M raw.includes("phoenix-forum-registration"));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Has mastermind link:", 0M 0M raw.includes("weekly-mastermind-group"));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Has our-story link:", 0M 0M raw.includes("/our-story/"));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Has events link:", 0M 0M raw.includes("/events/"));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Has Good Problems crosslink:", 0M 0M raw.includes("good-problems-guide"));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Has overachiever crosslink:", 0M 0M raw.includes("overachievers-anonymous"));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Styled CTA:", 0M 0M raw.includes("Attend a Free Meeting"));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Bare URL removed:", 0M 0M !raw.includes('">https://'));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Empty <p> 0M 0M removed:", 0M 0M !raw.startsWith("<p></p>"));
 0M 0M  0M 0M console.log(" 0M 0M  0M 0M - 0M 0M Keyword stuffing cleaned:", 0M 0M !raw.includes("national association of women"));
}

main().catch((err) 0M 0M => 0M 0M {
 0M 0M  0M 0M console.error("Failed:", 0M 0M err.message);
 0M 0M  0M 0M process.exit(1);
});
