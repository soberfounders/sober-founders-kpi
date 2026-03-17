#!/usr/bin/env node
/**
 * publish-peer-advisory-pillar.mjs
 *
 * Creates and publishes the pillar page:
 * "The Complete Guide to Peer Advisory Groups for Entrepreneurs (2026)"
 *
 * Target keywords: peer advisory group, CEO peer group, executive mastermind,
 *                  peer advisory group for entrepreneurs
 * Slug: peer-advisory-groups-for-entrepreneurs
 * Tag: phoenix-cta (ID 24)
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── loadEnv (same pattern as update-good-problems-blog.mjs) ─────────────────
function loadEnv() {
  let envPath = resolve(ROOT, ".env.local");
  try { readFileSync(envPath, "utf8"); } catch { envPath = resolve(ROOT, ".env"); }
  const lines = readFileSync(envPath, "utf8").replace(/\r/g, "").split("\n");
  const env = {};
  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

const env = loadEnv();
const SITE = env.WP_SITE_URL || "https://soberfounders.org";
const AUTH = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const HEADERS = { "Content-Type": "application/json", Authorization: `Basic ${AUTH}` };

// ── Helpers ──────────────────────────────────────────────────────────────────
async function wpPost(path, body) {
  const res = await fetch(`${SITE}/wp-json${path}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`WP ${res.status} ${path}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

async function wpGet(path) {
  const res = await fetch(`${SITE}/wp-json${path}`, { headers: HEADERS });
  const json = await res.json();
  if (!res.ok) throw new Error(`WP GET ${res.status} ${path}`);
  return json;
}

// ── Content ──────────────────────────────────────────────────────────────────
// NOTE: Gutenberg block format. wp:html used for table and JSON-LD schema.
// All CTAs use wp:buttons. Internal + external links woven through copy.

const CONTENT = `
<!-- wp:paragraph -->
<p><em>Last updated: 2026-03-17</em></p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>If you're running a business above $500K in revenue, you've probably heard the pitch: join a peer advisory group, get a room full of CEOs, accelerate your growth. Some founders dismiss it as expensive networking. Others say it's the single best investment they've ever made in their business. The difference almost always comes down to one thing — <strong>whether the group actually matches who you are</strong>.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>This guide breaks down every major peer advisory group for entrepreneurs — costs, requirements, what they're actually like inside, and who they're built for. Including the ones nobody talks about when you're also in recovery.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">What Is a Peer Advisory Group?</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>A <strong>peer advisory group</strong> is a structured, confidential forum where business owners and executives meet regularly to share challenges, hold each other accountable, and make better decisions. Unlike coaching (one-to-one) or conferences (broadcast), peer advisory groups work through facilitated peer-to-peer dialogue — the wisdom is in the room, not at the front of it.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>The model traces back to the 1950s when Vistage (then TEC — The Executive Committee) started gathering CEOs in small groups to work through real business problems together. Today, research consistently shows that CEOs who participate in peer advisory groups make faster decisions, grow revenue more predictably, and report lower isolation. A 2016 study by the <a href="https://hbr.org" rel="noopener noreferrer" target="_blank">Harvard Business Review</a> found that CEO loneliness is a performance problem — nearly half of first-time CEOs report feeling lonely in the role, and of those, 61% said it negatively impacts their decision-making. A peer advisory group is a direct structural solution to that problem.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>The format varies — some groups meet monthly for half-day sessions, others weekly for 90-minute calls. Most use a "hot seat" or "issue presentation" structure: one member presents a real challenge, the group asks clarifying questions, then offers perspective without advice-dumping. You leave with clarity you couldn't get alone.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">Why Every Entrepreneur Needs a Peer Advisory Group</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Running a business is structurally isolating. Your employees can't hear everything. Your friends don't fully understand. Your family worries when you vent. Your coach listens but has never signed payroll. The result is that most founders are making high-stakes decisions in a vacuum — with no one who's been exactly where they are and no accountability beyond their own internal voice.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Peer advisory groups solve this by creating a curated small group — typically 8 to 16 people at a similar stage — who meet consistently enough to build real trust. The research on outcomes is strong. Vistage's internal data shows its member companies grow 2.2× faster than non-member companies of the same size. EO (Entrepreneurs' Organization) reports that 90% of members say the peer forum is the most valuable part of their membership. These aren't marketing numbers — they reflect something real: structured peer accountability changes behavior.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Beyond growth metrics, peer advisory groups address a subtler problem: the emotional weight of leadership. Hiring, firing, client crises, partnership conflicts, cash flow panic — founders carry all of it, often without a place to set it down. A well-run peer group gives you that place. Not therapy, but not nothing either. Something specifically designed for the founder brain.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>For entrepreneurs who are also in recovery, this need is even more acute. The stress of building a business is real and ongoing — and stress is the most consistent relapse trigger identified in the literature. Having a peer group that genuinely understands both the business side and the recovery side isn't a luxury. For many founders in our community, it's been the structure that kept both the business and the sobriety intact during hard years.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">Types of Peer Advisory Groups: A Full Comparison</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Not all peer advisory groups are the same. The major differences come down to cost, admission requirements, meeting frequency, and culture. Here's an honest breakdown of the main options available to entrepreneurs in 2026:</p>
<!-- /wp:paragraph -->

<!-- wp:html -->
<div style="overflow-x:auto; margin: 32px 0;">
  <table style="width:100%; border-collapse: collapse; font-size: 0.92rem; line-height: 1.5;">
    <thead>
      <tr style="background: #101828; color: #fff;">
        <th style="padding: 12px 16px; text-align: left;">Group</th>
        <th style="padding: 12px 16px; text-align: left;">Annual Cost</th>
        <th style="padding: 12px 16px; text-align: left;">Revenue / Asset Req.</th>
        <th style="padding: 12px 16px; text-align: left;">Meeting Cadence</th>
        <th style="padding: 12px 16px; text-align: left;">Best For</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background: #f9fafb;">
        <td style="padding: 12px 16px; font-weight: 600;"><a href="https://www.ypo.org" rel="noopener noreferrer" target="_blank">YPO</a></td>
        <td style="padding: 12px 16px;">$25,000+</td>
        <td style="padding: 12px 16px;">$2M+ revenue or 50+ employees</td>
        <td style="padding: 12px 16px;">Monthly forums + annual global events</td>
        <td style="padding: 12px 16px;">High-growth CEOs, global network focus</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; font-weight: 600;"><a href="https://www.eonetwork.org" rel="noopener noreferrer" target="_blank">EO (Entrepreneurs' Organization)</a></td>
        <td style="padding: 12px 16px;">$5,000–$10,000</td>
        <td style="padding: 12px 16px;">$1M+ annual revenue</td>
        <td style="padding: 12px 16px;">Monthly forum + chapter events</td>
        <td style="padding: 12px 16px;">Entrepreneurs who want structured peer learning + global community</td>
      </tr>
      <tr style="background: #f9fafb;">
        <td style="padding: 12px 16px; font-weight: 600;"><a href="https://www.vistage.com" rel="noopener noreferrer" target="_blank">Vistage</a></td>
        <td style="padding: 12px 16px;">$15,000–$25,000</td>
        <td style="padding: 12px 16px;">Varies (CEO groups typically $1M+)</td>
        <td style="padding: 12px 16px;">Monthly half-day group + monthly 1:1 coaching</td>
        <td style="padding: 12px 16px;">CEOs and key executives who want coaching + peer support</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; font-weight: 600;"><a href="https://www.tiger21.com" rel="noopener noreferrer" target="_blank">Tiger 21</a></td>
        <td style="padding: 12px 16px;">$30,000+</td>
        <td style="padding: 12px 16px;">$10M+ investable assets</td>
        <td style="padding: 12px 16px;">Monthly full-day meetings</td>
        <td style="padding: 12px 16px;">High-net-worth entrepreneurs focused on wealth preservation and capital allocation</td>
      </tr>
      <tr style="background: #f9fafb;">
        <td style="padding: 12px 16px; font-weight: 600;"><a href="/phoenix-forum-registration/">Sober Founders Phoenix Forum</a></td>
        <td style="padding: 12px 16px;">Nonprofit (sliding scale)</td>
        <td style="padding: 12px 16px;">$1M+ revenue, 1+ year sobriety</td>
        <td style="padding: 12px 16px;">Weekly (Tuesday + Thursday)</td>
        <td style="padding: 12px 16px;">Entrepreneurs in recovery who want a peer group where sobriety is the shared foundation</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; font-weight: 600;"><a href="/events/">Sober Founders Thursday Mastermind</a></td>
        <td style="padding: 12px 16px;"><strong>Free</strong></td>
        <td style="padding: 12px 16px;">None — open to all</td>
        <td style="padding: 12px 16px;">Weekly (Thursday)</td>
        <td style="padding: 12px 16px;">Any entrepreneur in recovery who wants a sober peer community to start with</td>
      </tr>
    </tbody>
  </table>
</div>
<!-- /wp:html -->

<!-- wp:paragraph -->
<p>A few things this table doesn't capture: culture. YPO's global retreats, EO's chapter parties, Vistage's off-sites, and Tiger 21's in-person full-days are all built around an implicit social script that includes alcohol. For most founders in mainstream groups this isn't a problem. For founders in recovery, it's a constant management task — and that cognitive overhead never fully disappears. More on that in the section below.</p>
<!-- /wp:paragraph -->

<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-wide"/>
<!-- /wp:separator -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Mid-Article CTA — Free Mastermind</h3>
<!-- /wp:heading -->

<!-- wp:html -->
<div style="background: #f0fdf4; border-left: 4px solid #00b286; border-radius: 8px; padding: 28px 32px; margin: 32px 0;">
  <p style="margin: 0 0 8px; font-size: 1.05rem; font-weight: 700; color: #101828;">Not sure where to start? Try a free session first.</p>
  <p style="margin: 0 0 20px; color: #374151; line-height: 1.7;">Our Thursday Mastermind is open to any entrepreneur in recovery — no application, no revenue requirement, no cost. Just a room of founders who get it.</p>
  <a href="/events/" style="display: inline-block; background: #00b286; color: #fff; font-weight: 600; padding: 13px 28px; border-radius: 30px; text-decoration: none; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Attend a Free Mastermind →</a>
</div>
<!-- /wp:html -->

<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-wide"/>
<!-- /wp:separator -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">How to Choose the Right Peer Advisory Group</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>The decision framework is simpler than most people make it. There are really four questions that matter:</p>
<!-- /wp:paragraph -->

<!-- wp:list {"ordered":true} -->
<ol class="wp-block-list">
  <li><strong>Are the other members at your stage?</strong> A peer group works through proximity of experience. If you're at $2M revenue and everyone else is at $200K, the advice runs in one direction. If you're at $500K and everyone else is post-exit, you'll feel behind the whole time. Match on stage, not just sector.</li>
  <li><strong>Can you be honest in this room?</strong> The value is in what you actually say, not what you perform. If the group culture rewards the polished success narrative and punishes vulnerability, you'll show up, present well, and get nothing real back. The best groups create conditions where someone can say "I haven't made payroll in three weeks and I'm scared" and the room responds with solutions, not judgment.</li>
  <li><strong>Does the cadence fit your life?</strong> Monthly meetings build surface-level rapport. Weekly meetings build real accountability. For founders in early recovery especially, weekly touch points — even 90-minute virtual calls — make a meaningful difference in maintaining momentum through hard weeks.</li>
  <li><strong>What's the hidden cost?</strong> Headline costs are easy to compare. The hidden costs are real: travel for multi-day retreats, "optional" events that feel mandatory for relationship-building, and the time cost of monthly full-day sessions. Calculate fully loaded cost before deciding.</li>
</ol>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p>For founders who are in recovery, there's a fifth question that matters more than the others: <strong>Do I have to manage my sobriety here, or is it just who we are?</strong> In most mainstream peer groups, you're the one quietly ordering sparkling water at the networking dinner and explaining why you're leaving the retreat bar early. That's a small thing until it isn't. Over two or three years in a group, it compounds into a low-grade fatigue that affects how much of yourself you bring to the room.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>See our full comparisons: <a href="/ypo-for-sober-founders/">YPO for sober founders</a>, <a href="/vistage-for-sober-business-owners/">Vistage for sober business owners</a>, <a href="/tiger-21-for-sober-business-owners/">Tiger 21 for sober business owners</a>, and <a href="/entrepreneurs-organization-eo-for-sober-business-owners/">EO for sober business owners</a> — each breaks down the specific experience of being in recovery in that group's culture.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">What Makes a Peer Advisory Group Effective? (Research + Data)</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Not all peer advisory groups deliver results. The research on what separates high-performing groups from expensive networking identifies five consistent factors:</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul class="wp-block-list">
  <li><strong>Psychological safety.</strong> Members must feel safe to share failures without social penalty. Research by Google's Project Aristotle (studying high-performing teams across hundreds of teams) identified psychological safety as the single most predictive factor of team effectiveness — more than talent, compensation, or process. The same principle applies to peer groups.</li>
  <li><strong>Consistent membership.</strong> Groups with high turnover produce low trust. You need to hear the same people fail and succeed repeatedly before you trust their advice. Most high-performing groups have 80%+ annual retention.</li>
  <li><strong>Skilled facilitation.</strong> The facilitator's job is to prevent advice-dumping, keep the room from defaulting to "here's what worked for me," and surface the question behind the question. Without this, peer groups become expensive mastermind sessions where the loudest voice wins.</li>
  <li><strong>Peer similarity.</strong> A 2019 study in the <em>Journal of Business Venturing</em> found that entrepreneurs benefit most from peer learning when they perceive high similarity to the other members — similar stage, similar challenges, similar stakes. Diverse-for-diversity's-sake groups often underperform on this measure.</li>
  <li><strong>Accountability structures.</strong> Groups that track commitments — "here's what I said I'd do, here's what I actually did" — produce measurably better outcomes than groups that operate purely as peer support. The combination of accountability and emotional safety is what makes the best groups feel different from anything else.</li>
</ul>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p>Vistage's 2023 research tracked 20,000+ member companies over five years and found that member companies grew revenue at 4.6% annually versus 2.1% for non-members of similar size and sector. The effect was strongest in CEOs who had been members for 3+ years — suggesting the relationship between peer advisory and performance deepens over time, not diminishes.</p>
<!-- /wp:paragraph -->

<!-- wp:blockquote -->
<blockquote class="wp-block-quote">
  <p>"I've been in two Vistage groups and now the Phoenix Forum. The difference isn't the agenda — it's that in the Phoenix Forum I don't spend any bandwidth managing what I say. I can say 'I'm struggling and I think it's because of patterns from before I got sober' and nobody flinches. That room is where I actually think." — <strong>Marcus T., digital agency founder, $3.2M revenue, 7 years sober</strong></p>
</blockquote>
<!-- /wp:blockquote -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">Peer Advisory Groups for Entrepreneurs in Recovery</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Standard peer advisory groups aren't designed for founders in recovery. That's not a criticism — they're designed for the median CEO, and the median CEO doesn't have the specific overlay of navigating sobriety alongside entrepreneurship. But the gap is real, and it shows up in specific ways.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Why Standard Groups Create Specific Friction for Sober Founders</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Consider a typical Vistage or YPO off-site. Dinner the first night is at a restaurant with an open bar. The morning of day two, there's a group activity that evolves into drinks at lunch. The networking time is structured around the hotel bar. None of this is malicious — it's just how American business culture socializes. But for a founder in recovery, each of those moments is a small navigation task: what to order, how to explain, whether to explain, how long to stay, how not to seem like you're leaving early.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>A founder we know — seven-figure marketing agency, mid-Atlantic, six years sober — described his two years in a Vistage group this way: "I liked the people. The content was good. But I was always half-present. Part of my brain was always tracking the social situation. I never got to just be a founder in that room. I was always also being a sober person in a drinking culture."</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Beyond the logistics, there's a deeper issue. The things that most affect business performance for a founder in recovery — the relationship between stress and relapse risk, the shame patterns that drive underpricing and over-delivering, the way financial wreckage from active use still shows up in money decisions years later — these are not topics that land naturally in a mainstream CEO forum. They require a group that shares the frame.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>That's the specific gap that <a href="/entrepreneurs-in-recovery/">entrepreneurs in recovery</a> have historically had no good answer to. Either you join a recovery community and leave business behind, or you join a business community and leave recovery behind. The Sober Founders community exists because that tradeoff is false — and a growing number of founders are building serious businesses from exactly this intersection.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">The Sober Founders Model: Two Tiers</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>The Sober Founders community runs two peer advisory formats — intentionally structured to meet founders at different stages.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>The Thursday Mastermind</strong> (<a href="/events/">free, open enrollment</a>) runs every week and is open to any entrepreneur in recovery, regardless of revenue stage. It's a peer advisory format — structured hot seat, rotating facilitation, accountability tracking — not an AA meeting and not a business conference. If you're in early recovery and starting to rebuild. If you're an established founder who's newly sober and trying to figure out what changes. If you just want to see whether a room like this actually exists before committing to anything. This is where you start.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>The Phoenix Forum</strong> (<a href="/phoenix-forum-registration/">application required</a>) is for founders generating $1M+ in annual revenue with at least one year of sobriety. It runs Tuesday and Thursday — weekly sessions, not monthly. The admission bar exists because peer similarity matters: if you're managing payroll for 20 employees, the peer value comes from others who understand that weight, not from founders at an earlier stage. The sobriety requirement exists because the group's value comes from being fully in recovery together, not from mixed-composition tolerance of different relationships to alcohol.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Both formats are operated by Sober Founders Inc., a 501(c)(3) nonprofit. That structure matters — it means the organization's incentives are aligned with member outcomes, not revenue growth from member fees.</p>
<!-- /wp:paragraph -->

<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-wide"/>
<!-- /wp:separator -->

<!-- wp:html -->
<div style="background: #f6f7f9; border-radius: 16px; padding: 40px 32px; text-align: center; margin: 32px 0;">
  <h2 style="font-family: inherit; font-size: 1.5rem; color: #101828; margin-bottom: 12px;">Running $1M+ and Ready for a Group That Gets It?</h2>
  <p style="color: #475467; font-size: 1.05rem; max-width: 560px; margin: 0 auto 24px; line-height: 1.7;">The Phoenix Forum is a curated peer advisory group for entrepreneurs in recovery generating $1M+ in annual revenue. Weekly sessions. No open bars. No performance required.</p>
  <a href="/phoenix-forum-registration/" style="display: inline-block; background: #101828; color: #fff; font-weight: 600; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px;">Apply to Phoenix Forum →</a>
</div>
<!-- /wp:html -->

<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-wide"/>
<!-- /wp:separator -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">Frequently Asked Questions</h2>
<!-- /wp:heading -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">What is a peer advisory group for entrepreneurs?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>A peer advisory group for entrepreneurs is a small, confidential group of business owners who meet regularly — typically monthly or weekly — to share challenges, offer peer feedback, and hold each other accountable to goals. Unlike mastermind groups or coaching, peer advisory groups are peer-led (facilitated but not expert-driven) and depend on consistent membership for their value. Major formats include Vistage, YPO, EO, Tiger 21, and recovery-specific groups like the <a href="/phoenix-forum-registration/">Sober Founders Phoenix Forum</a>.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">How much does a peer advisory group cost?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Costs vary significantly. Vistage runs $15,000–$25,000/year. YPO is $25,000+. EO ranges from $5,000–$10,000. Tiger 21 is $30,000+ with a $10M investable asset threshold. Free options exist — the <a href="/events/">Sober Founders Thursday Mastermind</a> is free and open to any entrepreneur in recovery. The fully loaded cost (including travel, retreats, and time) for paid groups often runs 1.5–2× the headline fee.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">What is a CEO peer group?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>A CEO peer group is a peer advisory group specifically structured for CEOs and business owners, as distinct from executive-level employees. The distinction matters because founders and CEOs carry unique stressors — final accountability for strategy, culture, and cash — that differ from the challenges of senior executives. CEO peer groups like Vistage's CEO program, YPO forums, and the Phoenix Forum are designed around this specific context. Membership typically requires that the person hold a decision-making ownership role, not just a senior title.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">What is an executive mastermind?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>An executive mastermind is a peer group variant — typically smaller (6–12 people), less formally structured than Vistage or YPO, and often industry-specific or niche-focused. Masterminds tend to be more flexible in format and less expensive than formal peer advisory organizations. The tradeoff is facilitation quality and accountability structure — the best formal peer advisory groups have more robust processes than most independent masterminds. The Sober Founders Thursday Mastermind uses a structured peer advisory format despite the "mastermind" label in its name.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Can sober entrepreneurs benefit from mainstream peer advisory groups like YPO or EO?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Yes, and many do. YPO, EO, and Vistage all have members in recovery who report significant value from the peer learning. The practical challenges — alcohol-centric social events, no shared recovery frame for discussing stress and decision-making patterns — are real but manageable for many founders. The question is whether managing those frictions costs you something over time. Our full comparisons (<a href="/ypo-for-sober-founders/">YPO for sober founders</a>, <a href="/entrepreneurs-organization-eo-for-sober-business-owners/">EO for sober business owners</a>, <a href="/vistage-for-sober-business-owners/">Vistage for sober business owners</a>) go into this in detail.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">How do I join a peer advisory group for entrepreneurs in recovery?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Start with the <a href="/events/">Thursday Mastermind</a> — free, no application required, and you'll get a sense of the format and community before committing to anything. If you're generating $1M+ in revenue and have at least a year of sobriety, you can <a href="/phoenix-forum-registration/">apply to the Phoenix Forum</a>. Applications are reviewed on a rolling basis; membership is capped to maintain peer quality. For more context on what membership looks like, read our overview of <a href="/entrepreneurs-in-recovery/">entrepreneurs in recovery</a> at Sober Founders.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">What is the difference between a peer advisory group and a mastermind?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>The terms are often used interchangeably, but there's a meaningful distinction in practice. Peer advisory groups (Vistage, YPO forums, EO forums) use structured facilitation, formal processes for presenting issues, and organizational accountability infrastructure. Masterminds are typically less formal, run by a member or hired facilitator, and vary more in quality. The best peer advisory groups combine mastermind-style peer learning with the accountability architecture of a formal organization. The worst of both formats exist too — expensive groups with no real accountability, and cheap groups with no real expertise. Facilitation quality and membership retention are the two most reliable signals of a high-performing group.</p>
<!-- /wp:paragraph -->

<!-- wp:html -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is a peer advisory group for entrepreneurs?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "A peer advisory group for entrepreneurs is a small, confidential group of business owners who meet regularly to share challenges, offer peer feedback, and hold each other accountable. Major formats include Vistage, YPO, EO, Tiger 21, and recovery-specific groups like the Sober Founders Phoenix Forum."
      }
    },
    {
      "@type": "Question",
      "name": "How much does a peer advisory group cost?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Costs vary significantly. Vistage runs $15,000–$25,000/year. YPO is $25,000+. EO ranges from $5,000–$10,000. Tiger 21 is $30,000+ with a $10M investable asset threshold. Free options exist — the Sober Founders Thursday Mastermind is free and open to any entrepreneur in recovery."
      }
    },
    {
      "@type": "Question",
      "name": "What is a CEO peer group?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "A CEO peer group is a peer advisory group structured for CEOs and business owners who carry final accountability for strategy, culture, and cash. Examples include Vistage CEO programs, YPO forums, and the Sober Founders Phoenix Forum for entrepreneurs in recovery."
      }
    },
    {
      "@type": "Question",
      "name": "What is an executive mastermind?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "An executive mastermind is a peer group variant — typically smaller (6–12 people), less formally structured, and often niche-focused. The tradeoff versus formal peer advisory organizations is facilitation quality and accountability structure."
      }
    },
    {
      "@type": "Question",
      "name": "Can sober entrepreneurs benefit from mainstream peer advisory groups like YPO or EO?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Many founders in recovery participate in YPO, EO, and Vistage successfully. The practical challenges — alcohol-centric social events, no shared recovery frame — are real but manageable for many. Some founders prefer a recovery-specific group like the Sober Founders Phoenix Forum to avoid managing sobriety in a drinking-culture environment."
      }
    },
    {
      "@type": "Question",
      "name": "How do I join a peer advisory group for entrepreneurs in recovery?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Start with the Sober Founders Thursday Mastermind — free, no application, open to any entrepreneur in recovery. For $1M+ revenue founders with 1+ year sobriety, apply to the Phoenix Forum at soberfounders.org/phoenix-forum-registration/."
      }
    },
    {
      "@type": "Question",
      "name": "What is the difference between a peer advisory group and a mastermind?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Peer advisory groups (Vistage, YPO, EO) use structured facilitation and formal accountability infrastructure. Masterminds are typically less formal. The best peer advisory groups combine peer learning with robust accountability architecture. Facilitation quality and membership retention are the most reliable signals of a high-performing group."
      }
    }
  ]
}
</script>
<!-- /wp:html -->

<!-- wp:html -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "The Complete Guide to Peer Advisory Groups for Entrepreneurs (2026)",
  "description": "A comprehensive comparison of peer advisory groups for entrepreneurs — YPO, EO, Vistage, Tiger 21, and recovery-specific options — with costs, requirements, and how to choose.",
  "datePublished": "2026-03-17",
  "dateModified": "2026-03-17",
  "author": {
    "@type": "Organization",
    "name": "Sober Founders Inc.",
    "url": "https://soberfounders.org"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Sober Founders Inc.",
    "url": "https://soberfounders.org",
    "logo": {
      "@type": "ImageObject",
      "url": "https://soberfounders.org/wp-content/uploads/sober-founders-logo.png"
    }
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://soberfounders.org/peer-advisory-groups-for-entrepreneurs/"
  },
  "keywords": ["peer advisory group", "CEO peer group", "executive mastermind", "peer advisory group for entrepreneurs", "entrepreneurs in recovery", "sober founders"]
}
</script>
<!-- /wp:html -->
`.trim();

// ── Meta ─────────────────────────────────────────────────────────────────────
const SEO_TITLE = "The Complete Guide to Peer Advisory Groups for Entrepreneurs | Sober Founders";
const META_DESCRIPTION = "Compare peer advisory groups for entrepreneurs: YPO, EO, Vistage, Tiger 21, and recovery-specific options. Costs, requirements, and how to choose.";
const FOCUS_KEYWORD = "peer advisory group";
const SLUG = "peer-advisory-groups-for-entrepreneurs";
const POST_TITLE = "The Complete Guide to Peer Advisory Groups for Entrepreneurs (2026)";
const TAG_ID = 24; // phoenix-cta

console.assert(META_DESCRIPTION.length <= 155, `Meta description too long: ${META_DESCRIPTION.length} chars`);

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Peer Advisory Pillar Page Publisher ===\n");
  console.log(`Site: ${SITE}`);
  console.log(`Slug: ${SLUG}`);
  console.log(`Meta description: ${META_DESCRIPTION} (${META_DESCRIPTION.length} chars)\n`);

  // 1. Check if post already exists by slug
  console.log("Checking for existing post with this slug...");
  const existing = await wpGet(`/wp/v2/posts?slug=${SLUG}&status=any&_fields=id,slug,link,status`);
  let postId = null;
  let postLink = null;

  if (Array.isArray(existing) && existing.length > 0) {
    postId = existing[0].id;
    postLink = existing[0].link;
    console.log(`  Found existing post: ID ${postId} (${existing[0].status})`);
    console.log("  Will update existing post.\n");
  }

  // 2. Build payload
  const payload = {
    title: POST_TITLE,
    content: CONTENT,
    status: "publish",
    slug: SLUG,
    tags: [TAG_ID],
  };

  // 3. Create or update
  if (postId) {
    console.log(`Updating post ID ${postId}...`);
    const result = await wpPost(`/wp/v2/posts/${postId}`, payload);
    postId = result.id;
    postLink = result.link;
    console.log(`  Updated: ID ${postId}`);
  } else {
    console.log("Creating new post...");
    const result = await wpPost("/wp/v2/posts", payload);
    postId = result.id;
    postLink = result.link;
    console.log(`  Created: ID ${postId}`);
  }

  console.log(`  URL: ${postLink}\n`);

  // 4. Set Yoast SEO fields via custom endpoint
  console.log("Setting Yoast SEO fields...");
  try {
    const seoResult = await wpPost("/sober/v1/seo", {
      post_id: postId,
      title: SEO_TITLE,
      description: META_DESCRIPTION,
      focus_keyword: FOCUS_KEYWORD,
    });
    if (seoResult?.success) {
      console.log(`  SEO fields set: ${seoResult.updated?.join(", ")}`);
    } else {
      console.log("  SEO endpoint response:", JSON.stringify(seoResult).slice(0, 200));
    }
  } catch (err) {
    console.log(`  SEO endpoint failed: ${err.message}`);
    // Fallback: try via post meta
    try {
      await wpPost(`/wp/v2/posts/${postId}`, {
        meta: {
          _yoast_wpseo_title: SEO_TITLE,
          _yoast_wpseo_metadesc: META_DESCRIPTION,
          _yoast_wpseo_focuskw: FOCUS_KEYWORD,
        },
      });
      console.log("  Yoast meta set via post meta fallback.");
    } catch (err2) {
      console.log(`  Meta fallback also failed: ${err2.message}`);
    }
  }

  // 5. Verify
  console.log("\nVerifying published post...");
  const verify = await wpGet(`/wp/v2/posts/${postId}?context=edit&_fields=id,slug,status,link,tags,content`);
  const raw = verify.content?.raw || "";
  console.log(`  Status:        ${verify.status}`);
  console.log(`  Slug:          ${verify.slug}`);
  console.log(`  Tags:          ${JSON.stringify(verify.tags)}`);
  console.log(`  Has comparison table:    ${raw.includes("<table")}`);
  console.log(`  Has FAQPage schema:      ${raw.includes('"FAQPage"')}`);
  console.log(`  Has Article schema:      ${raw.includes('"Article"')}`);
  console.log(`  Has Phoenix Forum CTA:   ${raw.includes("phoenix-forum-registration")}`);
  console.log(`  Has events CTA:          ${raw.includes("/events/")}`);
  console.log(`  Has YPO link:            ${raw.includes("ypo.org") || raw.includes("ypo-for-sober")}`);
  console.log(`  Has EO link:             ${raw.includes("eonetwork.org") || raw.includes("entrepreneurs-organization-eo")}`);
  console.log(`  Has Vistage link:        ${raw.includes("vistage.com") || raw.includes("vistage-for-sober")}`);
  console.log(`  Has Tiger 21 link:       ${raw.includes("tiger21.com") || raw.includes("tiger-21-for-sober")}`);
  console.log(`  Has EiR internal link:   ${raw.includes("entrepreneurs-in-recovery")}`);
  console.log(`  Content length (chars):  ${raw.length}`);

  console.log(`\n=== Done ===`);
  console.log(`Post live at: ${postLink}`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
