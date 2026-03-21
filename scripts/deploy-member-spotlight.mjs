#!/usr/bin/env node
/**
 * deploy-member-spotlight.mjs - Publish monthly member spotlight blog posts.
 *
 * Usage:
 *   node scripts/deploy-member-spotlight.mjs [--dry-run] [--draft]
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  let envPath = resolve(ROOT, ".env.local");
  try {
    readFileSync(envPath, "utf8");
  } catch {
    envPath = resolve(ROOT, ".env");
  }
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
const AUTH = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString(
  "base64",
);
const DRY_RUN = process.argv.includes("--dry-run");
const AS_DRAFT = process.argv.includes("--draft");

const headers = {
  "Content-Type": "application/json",
  Authorization: `Basic ${AUTH}`,
};

// ── Spotlight Data ──────────────────────────────────────────────────────────

const spotlights = [
  {
    slug: "member-spotlight-nyla-cione",
    name: "Nyla Cione",
    role: "Voice Coach",
    website: "https://www.wilmingtonvoicecoach.com",
    headshot: "https://soberfounders.org/wp-content/uploads/2026/03/Nyla-Cione.png",
    sobrietyYears: "33",
    sobrietyDetail: "34 years in May 2026",
    location: "Wilmington",
    pullQuote:
      "It's like my business has a sponsor of sorts, from the feedback and conversations in the meeting.",
    stats: [
      { value: "33 yrs", label: "Sober" },
      { value: "+50%", label: "Revenue Growth" },
      { value: "$0", label: "Marketing Spend" },
    ],
    buildingNowTitle: "What She's Building Now",
    ctaHeadline: "Want a room where recovery and business speak the same language?",
    ctaBody: "Nyla found it in her first couple of weeks. The <a href=\"https://soberfounders.org/weekly-mastermind-group/\">free weekly mastermind</a> is the starting point for founders who want to stop carrying it all alone.",
    headline: "Member Spotlight: Nyla Cione - 33 Years Sober, Leading from Service",
    summary:
      "Nyla Cione has coached voices since 2004. But the real transformation happened when she stopped performing in her own recovery, sat all the way down, and let the principles of her program reshape how she leads her business.",
    seo: {
      title: "Nyla Cione: Voice Coach, 33 Years Sober | Sober Founders Spotlight",
      description:
        "How voice coach Nyla Cione grew revenue 50% by applying recovery principles to business. 33 years sober. Member spotlight from Sober Founders.",
      focusKeyword: "sober entrepreneur spotlight",
    },
    category: "Member Spotlights",
    sections: [
      {
        label: "The Turning Point",
        title: "Coming All the Way In",
        paragraphs: [
          "For years, Nyla moved through recovery rooms the way she had moved through everything else in life: alone. She came in alone, she left alone, and she kept everyone at arm's length. The mask stayed on. The performance continued.",
          "\"I was a poser,\" she says plainly. \"I was fearful of getting close to anyone or to the truth. I finally hit bottom after the bottom of trying to do it alone.\"",
          "The shift came when she found a sponsor who saw through the performance stance and guided her into the steps, the Big Book, and service. \"They say I finally decided to come all the way in and sit all the way down, and take off the mask.\" That decision changed everything that followed.",
        ],
      },
      {
        label: "The Business Shift",
        title: "50% Revenue Growth from One Decision",
        paragraphs: [
          "Recovery did not just stabilize Nyla's life. It rebuilt how she runs her business.",
          "After getting sober, she became more open-minded and creative. She started listening from a deeper, more present place. The burnout that had been eating away at her energy disappeared. And then came the number that surprised even her: a 50% increase in revenue from a single application in marketing.",
          "\"I literally get all of my leads organically and pay no overhead for marketing,\" she says. The secret was not a funnel or an ad spend. It was learning to ask for help. \"Learning to ask for more help for more solutions\" unlocked growth she could not have engineered on her own.",
          "That is the paradox recovery keeps revealing for founders: the moment you stop trying to figure everything out alone, better answers show up. It is the same principle that makes <a href=\"https://soberfounders.org/do-mastermind-groups-help-sober-entrepreneurs/\">mastermind groups for sober entrepreneurs</a> so effective.",
        ],
      },
      {
        label: "How She Leads Now",
        title: "Service First, Ego Out",
        paragraphs: [
          "Nyla's leadership philosophy today is built on one principle: lead with service, and the results take care of themselves.",
          "\"If I keep ego out of it and hitting a bottom line monetarily as the only focus, bringing it back to service and contribution with a WE in mind, I trust more, move ahead more, create more from a more solid place.\" That is what <a href=\"https://soberfounders.org/12-steps-and-your-business/\">applying the 12 steps to your business</a> looks like in practice.",
          "That does not mean she ignores revenue. It means she has learned that chasing money from a place of fear, control, and distrust produces worse outcomes than doing what is in front of her and leaving the results to her Higher Power.",
          "\"When I do what's in front of me and leave the results up to God, instead of feeling like I have to get in there and keep fixing things from a place of fear, control, and distrust, I can trust that the outcome will always land for the greater good for everyone.\"",
        ],
      },
      {
        label: "The Hardest Part",
        title: "Asking for Help Instead of Having All the Answers",
        paragraphs: [
          "Building a company in recovery forced Nyla to confront a pattern that runs deep in most entrepreneurs: the need to do it alone and have all the answers.",
          "\"I would and can still get stuck on trying to figure things out by myself and making decisions by myself,\" she admits. That instinct does not disappear with decades of sobriety. But the toolkit for handling it gets better.",
          "\"Asking for more help and intuition from my Higher Power has been key in landing with better decisions and action steps.\" The willingness to not know, and to let something bigger than her own thinking guide the next move, is what separates this <a href=\"https://soberfounders.org/entrepreneurs-in-recovery/\">entrepreneur in recovery</a> from the white-knuckle version she used to rely on.",
        ],
      },
    ],
    wisdom: {
      title: "What She Wants Every Sober Founder to Know",
      items: [
        {
          label: "Check Your Motives",
          text: "\"Stay where your feet are and check your motives. Just because we're in recovery doesn't mean all our motives are clean when it comes to business.\" The work can become the new substance if you are not paying attention.",
        },
        {
          label: "Know the Flags",
          text: "HALT: Hungry, Angry, Lonely, Tired. \"Those can come up on someone fast if the boundaries with self care and working the steps are not a priority when it comes to being a business owner in recovery.\"",
        },
        {
          label: "Get Out of the Isolation",
          text: "\"Make an inventory on what you're doing to seek the solution in getting out of the isolation.\" Sitting still long enough to let your Higher Power guide the next right action is not weakness. It is the move that works.",
        },
      ],
    },
    dailyPractice: {
      title: "Her Daily Practice",
      items: [
        "12-step fellowship meeting every morning at 8 AM (her homegroup)",
        "Weekly meetings with her sponsor",
        "Connected with a group of sober sisters",
        "Service work for her homegroup and two yearly 12-step events locally",
        "\"Upon Awakening\" prayers before her feet hit the floor",
        "Consistent 10th step before bed",
      ],
    },
    soberFoundersImpact: {
      title: "What Sober Founders Changed",
      paragraphs: [
        "Nyla found Sober Founders only a couple of weeks before this interview. But the impact was immediate.",
        "\"I can see already how connecting with like minds and being able to stretch out more into the principles of recovery within a Sober Founders meeting that apply to business, it's golden and affirming.\"",
        "She describes it in the most founder-in-recovery way possible: \"It's like my business has a sponsor of sorts, from the feedback and conversations in the meeting.\"",
        "Since joining, she has felt inspired to dig deeper into how she can contribute in her business and serve others. More letting go, more trust, more action with better clarity.",
      ],
    },
    buildingNow:
      "Community. For the first time, Nyla is stepping out further to create a space for her students and clients to interact and be part of something she leads. Before sobriety, she would have avoided that and stifled her growth. Now she is building the thing that scared her most.",
    recommendationQuote:
      "I'd recommend Sober Founders to anyone who wants to change what's not working, and expand into more than one could even imagine. Who wants to contribute from a more authentic true place, by keeping recovery at the helm and applying the principles of the program to your business, and stay sober doing it.",
  },
  {
    slug: "member-spotlight-robert-davidman",
    name: "Robert Davidman",
    role: "Entertainment Executive & CEO, World Series of Golf",
    website: "https://wsg.golf",
    headshot: "https://soberfounders.org/wp-content/uploads/2026/03/robert-davidman.png",
    sobrietyYears: "20",
    sobrietyDetail: "Sober since September 15, 2005",
    location: "",
    stats: [
      { value: "20 yrs", label: "Sober" },
      { value: "COO + CEO", label: "Dual Leadership" },
      { value: "Sep 2005", label: "Sobriety Date" },
    ],
    buildingNowTitle: "What He's Building Now",
    ctaHeadline: "Looking for a room where C-suite founders in recovery actually get each other?",
    ctaBody: "Robert found it here. The <a href=\"https://soberfounders.org/weekly-mastermind-group/\">free weekly mastermind</a> is where sober founders stop carrying the weight of leadership alone.",
    pullQuote:
      "I found a group where people understand what hides in the shadows for someone like myself.",
    headline: "Member Spotlight: Robert Davidman - 20 Years Sober, Building an Entertainment Empire",
    summary:
      "Robert Davidman nearly lost his family to addiction. Twenty years later, he runs an entertainment company that creates movies and TV shows, serves as COO of the main business and CEO of the World Series of Golf. Everything he has now exists because he got sober.",
    seo: {
      title: "Robert Davidman: Entertainment CEO, 20 Years Sober | Sober Founders",
      description:
        "How Robert Davidman rebuilt from rock bottom to entertainment executive and CEO of World Series of Golf. 20 years sober. Sober Founders member spotlight.",
      focusKeyword: "sober entrepreneur spotlight",
    },
    category: "Member Spotlights",
    sections: [
      {
        label: "The Turning Point",
        title: "Rock Bottom and the Family He Almost Lost",
        paragraphs: [
          "Robert does not dress up his story. He hit rock bottom. He nearly lost his family. That was the turning point.",
          "There was no slow realization or gradual winding down. Addiction brought this <a href=\"https://soberfounders.org/entrepreneurs-in-recovery/\">entrepreneur in recovery</a> to the edge of losing the people who mattered most, and that was the moment he got serious about sobriety. September 15, 2005. He has not looked back.",
          "\"When I hit rock bottom and nearly lost my family due to my addiction\" is how he puts it. No qualifiers. No softening. That is what happened, and that is what it took.",
        ],
      },
      {
        label: "The Business Shift",
        title: "From Darkness to Actually Enjoying the Work",
        paragraphs: [
          "Before sobriety, Robert was sinking into what he calls \"the darker pits of addiction.\" The business existed, but he was not really present for it. The work happened around him more than through him.",
          "Getting sober flipped that. He started focusing on the things that actually helped him grow. The noise fell away, and what was left was clarity, enjoyment, and forward motion.",
          "\"It allowed me to actually enjoy what I do and in turn grow the businesses,\" he says. That is a sentence that sounds simple until you realize what it replaced: years of running a company while barely being able to function inside your own life.",
          "Today he operates as COO of an entertainment company that creates movies and TV shows, and serves as CEO of the <a href=\"https://wsg.golf\" target=\"_blank\" rel=\"noopener\">World Series of Golf</a>. None of that happened by accident. It happened because the fog lifted.",
        ],
      },
      {
        label: "How He Leads Now",
        title: "12-Step Principles in the Boardroom",
        paragraphs: [
          "Robert does not keep recovery and business in separate boxes. He uses 12-step principles directly in how he leads.",
          "The biggest shift has been empathy. \"Sobriety enabled me to be more empathetic towards people,\" he says. When you have been to the bottom and know what it costs to climb back, you lead differently. You listen differently. You treat people differently.",
          "That is not soft leadership. That is leadership grounded in something real. Sober business owners who have walked through the fire of addiction and come out the other side tend to lead with a clarity and groundedness that cannot be faked. It is the kind of thing that makes <a href=\"https://soberfounders.org/12-steps-and-your-business/\">applying the 12 steps to business</a> more than a theory.",
        ],
      },
      {
        label: "The Hardest Part",
        title: "The Same Stress, a Completely Different Toolkit",
        paragraphs: [
          "Robert is honest about something that does not get said enough: getting sober does not make the stress of running a company disappear. The same pressures that were there during active addiction are still there in recovery.",
          "\"The stresses that were there while I was in active addiction are still there,\" he says. \"It was learning how to deal with them in a different and healthier way.\"",
          "That is the real work for any founder in recovery. Not avoiding stress, but building an entirely new relationship with it. The old toolkit was substances. The new toolkit is program, support, and the kind of self-awareness that only comes from doing the internal work. It is why <a href=\"https://soberfounders.org/do-mastermind-groups-help-sober-entrepreneurs/\">mastermind groups for sober entrepreneurs</a> exist.",
        ],
      },
    ],
    wisdom: {
      title: "What He Wants Every Sober Founder to Know",
      items: [
        {
          label: "You Are Not Alone",
          text: "\"You are not alone. There are many of us out there and we have all been there.\" That is it. No complicated framework. Just the truth that the isolation is a lie, and the proof is in the room.",
        },
        {
          label: "It Is Harder for Us",
          text: "\"Being an entrepreneur and an addict is even harder than just being a normal entrepreneur.\" Robert does not pretend the two are unrelated. The traits that make founders good at building companies are often the same traits that made them vulnerable to addiction. Acknowledging that is not weakness. It is precision.",
        },
      ],
    },
    dailyPractice: {
      title: "His Support System",
      items: [
        "Family who know his story and actively support his recovery",
        "Friends who understand and stand with him",
        "12-step principles integrated into daily work and leadership",
        "Sober Founders community for peer connection with other founders in recovery",
      ],
    },
    soberFoundersImpact: {
      title: "What Sober Founders Changed",
      paragraphs: [
        "For Robert, Sober Founders filled a gap that most recovery spaces cannot touch: the intersection of C-suite leadership and sobriety.",
        "\"I have learned a lot from the other folks in the group. It has been wonderful to get to know other sober founders like myself.\"",
        "But the deeper shift was more personal than tactical. \"It has been interesting. Not so much that I have changed but more that I feel like I found a group where people understand what hides in the shadows for someone like myself.\"",
        "That last line says everything. Recovery gives you the tools. But finding people who understand the specific weight of running a company while carrying the thing that almost destroyed you, that is what Sober Founders provides.",
      ],
    },
    buildingNow:
      "Almost everything Robert has now is because he is sober. The entertainment company, the movies, the TV shows, the World Series of Golf. None of it existed in the version of his life where addiction was running the show. He is not building one thing in sobriety. He is building all of it.",
    recommendationQuote:
      "I'd recommend Sober Founders for anyone who sits in the C-suite while in recovery and feels alone.",
  },
];

// ── HTML Builder ────────────────────────────────────────────────────────────

function buildSpotlightStyles() {
  return `
  <style>
    .sf-spot { font-family: inherit; color: #e5e7eb; background: #050505; }
    .sf-spot * { box-sizing: border-box; }
    .sf-spot a { color: #00b286; text-decoration: none !important; }
    .sf-spot a:hover { text-decoration: underline !important; }
    .sf-spot-wrap { max-width: 860px; margin: 0 auto; padding: 72px 24px 88px; }

    .sf-spot-headshot {
      width: 140px;
      height: 140px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid rgba(0,178,134,0.4);
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      margin-bottom: 22px;
    }

    .sf-spot-badge {
      display: inline-block;
      padding: 7px 14px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: #00b286;
      background: rgba(0,178,134,0.12);
      border: 1px solid rgba(0,178,134,0.22);
      margin-bottom: 20px;
    }

    .sf-spot-hero {
      border: 1px solid rgba(255,255,255,0.1);
      background: linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
      backdrop-filter: blur(18px);
      border-radius: 30px;
      padding: 40px 36px;
      margin-bottom: 28px;
      box-shadow: 0 24px 100px rgba(0,0,0,0.3);
    }
    .sf-spot-hero h1 {
      font-family: "DM Serif Display", serif;
      font-weight: 400;
      font-size: clamp(1.8rem, 4vw, 2.8rem);
      line-height: 1.06;
      color: #ffffff;
      margin: 0 0 18px;
    }
    .sf-spot-hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 20px;
      font-size: 0.88rem;
      color: rgba(255,255,255,0.6);
    }
    .sf-spot-hero-meta span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .sf-spot-hero-meta strong { color: rgba(255,255,255,0.85); font-weight: 600; }
    .sf-spot-hero p {
      color: rgba(255,255,255,0.72);
      line-height: 1.8;
      font-size: 1.05rem;
      margin: 0;
    }

    .sf-spot-pull {
      border: 1px solid rgba(241,151,44,0.18);
      background: linear-gradient(135deg, rgba(241,151,44,0.10), rgba(255,255,255,0.02));
      border-radius: 24px;
      padding: 28px 30px;
      margin-bottom: 28px;
    }
    .sf-spot-pull blockquote {
      font-family: "DM Serif Display", serif;
      font-size: 1.35rem;
      line-height: 1.55;
      color: #ffffff;
      margin: 0;
      padding: 0;
      border: none;
    }
    .sf-spot-pull cite {
      display: block;
      margin-top: 14px;
      font-size: 0.78rem;
      font-weight: 700;
      font-style: normal;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: #f7bb74;
    }

    .sf-spot-section {
      border: 1px solid rgba(255,255,255,0.1);
      background: linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015));
      backdrop-filter: blur(18px);
      border-radius: 26px;
      padding: 32px 30px;
      margin-bottom: 22px;
      box-shadow: 0 16px 60px rgba(0,0,0,0.2);
    }
    .sf-spot-section-label {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: #00b286;
      margin-bottom: 10px;
    }
    .sf-spot-section h2 {
      font-family: "DM Serif Display", serif;
      font-weight: 400;
      font-size: 1.55rem;
      line-height: 1.12;
      color: #ffffff;
      margin: 0 0 18px;
    }
    .sf-spot-section p {
      color: rgba(255,255,255,0.72);
      line-height: 1.85;
      margin: 0 0 16px;
    }
    .sf-spot-section p:last-child { margin-bottom: 0; }

    .sf-spot-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 28px;
    }
    .sf-spot-stat {
      border: 1px solid rgba(255,255,255,0.1);
      background: linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
      border-radius: 22px;
      padding: 22px;
      text-align: center;
    }
    .sf-spot-stat-value {
      font-family: "DM Serif Display", serif;
      font-size: 1.8rem;
      font-weight: 400;
      color: #ffffff;
      margin-bottom: 6px;
    }
    .sf-spot-stat-label {
      font-size: 0.76rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: rgba(255,255,255,0.5);
    }

    .sf-spot-wisdom {
      border: 1px solid rgba(255,255,255,0.1);
      background: linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015));
      border-radius: 26px;
      padding: 32px 30px;
      margin-bottom: 22px;
    }
    .sf-spot-wisdom h2 {
      font-family: "DM Serif Display", serif;
      font-weight: 400;
      font-size: 1.55rem;
      line-height: 1.12;
      color: #ffffff;
      margin: 0 0 22px;
    }
    .sf-spot-wisdom-item {
      padding: 18px 20px;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(0,0,0,0.24);
      margin-bottom: 12px;
    }
    .sf-spot-wisdom-item:last-child { margin-bottom: 0; }
    .sf-spot-wisdom-item strong {
      display: block;
      font-size: 0.88rem;
      color: #00b286;
      margin-bottom: 8px;
    }
    .sf-spot-wisdom-item p {
      color: rgba(255,255,255,0.72);
      line-height: 1.8;
      margin: 0;
    }

    .sf-spot-practice {
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(0,0,0,0.22);
      border-radius: 22px;
      padding: 26px 28px;
      margin-bottom: 22px;
    }
    .sf-spot-practice h2 {
      font-family: "DM Serif Display", serif;
      font-weight: 400;
      font-size: 1.35rem;
      color: #ffffff;
      margin: 0 0 16px;
    }
    .sf-spot-practice ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .sf-spot-practice li {
      position: relative;
      padding-left: 22px;
      color: rgba(255,255,255,0.72);
      line-height: 1.75;
      margin-bottom: 10px;
    }
    .sf-spot-practice li:before {
      content: "";
      position: absolute;
      left: 0;
      top: 10px;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #00b286;
    }

    .sf-spot-building {
      border: 1px solid rgba(0,178,134,0.18);
      background: linear-gradient(135deg, rgba(94,236,192,0.08), rgba(255,255,255,0.02));
      border-radius: 24px;
      padding: 28px 30px;
      margin-bottom: 22px;
    }
    .sf-spot-building h2 {
      font-family: "DM Serif Display", serif;
      font-weight: 400;
      font-size: 1.35rem;
      color: #ffffff;
      margin: 0 0 14px;
    }
    .sf-spot-building p {
      color: rgba(255,255,255,0.78);
      line-height: 1.8;
      margin: 0;
    }

    .sf-spot-cta {
      border: 1px solid rgba(0,178,134,0.22);
      background: linear-gradient(135deg, rgba(94,236,192,0.12), rgba(255,255,255,0.04));
      border-radius: 30px;
      padding: 36px;
      margin-top: 34px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.24);
      text-align: center;
    }
    .sf-spot-cta h2 {
      font-family: "DM Serif Display", serif;
      font-weight: 400;
      font-size: clamp(1.5rem, 3vw, 2.2rem);
      line-height: 1.1;
      color: #ffffff;
      margin: 0 0 14px;
    }
    .sf-spot-cta p {
      color: rgba(255,255,255,0.7);
      line-height: 1.75;
      max-width: 600px;
      margin: 0 auto 22px;
    }
    .sf-spot-cta-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      justify-content: center;
    }
    .sf-spot-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 13px 24px;
      border-radius: 999px;
      font-size: 0.88rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      background: #00b286;
      color: #ffffff !important;
      text-decoration: none !important;
    }
    .sf-spot-btn-alt {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 13px 24px;
      border-radius: 999px;
      font-size: 0.88rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border: 1px solid rgba(255,255,255,0.18);
      color: rgba(255,255,255,0.88) !important;
      text-decoration: none !important;
    }

    .sf-spot-rec {
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(0,0,0,0.2);
      border-radius: 22px;
      padding: 26px 28px;
      margin-bottom: 22px;
    }
    .sf-spot-rec blockquote {
      font-family: "DM Serif Display", serif;
      font-size: 1.15rem;
      line-height: 1.6;
      color: rgba(255,255,255,0.88);
      margin: 0;
      padding: 0;
      border: none;
    }
    .sf-spot-rec cite {
      display: block;
      margin-top: 12px;
      font-size: 0.78rem;
      font-weight: 700;
      font-style: normal;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: #00b286;
    }

    @media (max-width: 700px) {
      .sf-spot-wrap { padding: 56px 18px 72px; }
      .sf-spot-hero,
      .sf-spot-section,
      .sf-spot-wisdom,
      .sf-spot-cta { padding: 26px 22px; }
      .sf-spot-stats { grid-template-columns: 1fr; }
    }
  </style>`;
}

function buildSpotlightPost(s) {
  const sectionsMarkup = s.sections
    .map(
      (sec) => `
    <div class="sf-spot-section">
      <span class="sf-spot-section-label">${sec.label}</span>
      <h2>${sec.title}</h2>
      ${sec.paragraphs.map((p) => `<p>${p}</p>`).join("\n      ")}
    </div>`,
    )
    .join("\n");

  const wisdomMarkup = s.wisdom.items
    .map(
      (item) => `
        <div class="sf-spot-wisdom-item">
          <strong>${item.label}</strong>
          <p>${item.text}</p>
        </div>`,
    )
    .join("");

  const practiceMarkup = s.dailyPractice.items
    .map((item) => `<li>${item}</li>`)
    .join("\n        ");

  const today = new Date().toISOString().slice(0, 10);

  const schemaMarkup = `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "${s.headline.replace(/"/g, '\\"')}",
      "description": "${s.seo.description.replace(/"/g, '\\"')}",
      "datePublished": "${today}",
      "dateModified": "${today}",
      "author": {
        "@type": "Organization",
        "name": "Sober Founders",
        "url": "https://soberfounders.org"
      },
      "publisher": {
        "@type": "Organization",
        "name": "Sober Founders",
        "url": "https://soberfounders.org"
      },
      "mainEntityOfPage": "https://soberfounders.org/${s.slug}/"${s.headshot ? `,
      "image": "${s.headshot}"` : ""}
    },
    {
      "@type": "Person",
      "name": "${s.name.replace(/"/g, '\\"')}",
      "jobTitle": "${s.role.replace(/"/g, '\\"')}",
      "url": "${s.website}"${s.headshot ? `,
      "image": "${s.headshot}"` : ""},
      "memberOf": {
        "@type": "Organization",
        "name": "Sober Founders",
        "url": "https://soberfounders.org"
      }
    }
  ]
}
</script>`;

  return `<!-- wp:html -->
${schemaMarkup}
${buildSpotlightStyles()}
<div class="sf-spot">
  <div class="sf-spot-wrap">
    <p style="font-size:0.82rem;color:rgba(255,255,255,0.4);margin:0 0 16px;"><em>Last updated: ${today}</em></p>
    <span class="sf-spot-badge">Member Spotlight</span>

    <div class="sf-spot-hero">
      ${s.headshot ? `<img class="sf-spot-headshot" src="${s.headshot}" alt="${s.name}, ${s.role} - Sober Founders Member Spotlight" />` : ""}
      <h1>${s.headline}</h1>
      <div class="sf-spot-hero-meta">
        <span><strong>${s.name}</strong></span>
        <span>${s.role} &middot; <a href="${s.website}" target="_blank" rel="noopener">${s.website.replace("https://www.", "")}</a></span>
        <span>${s.sobrietyYears} years sober</span>
      </div>
      <p>${s.summary}</p>
    </div>

    <div class="sf-spot-stats">
      ${s.stats.map((stat) => `<div class="sf-spot-stat">
        <div class="sf-spot-stat-value">${stat.value}</div>
        <div class="sf-spot-stat-label">${stat.label}</div>
      </div>`).join("\n      ")}
    </div>

    <div class="sf-spot-pull">
      <blockquote>&ldquo;${s.pullQuote}&rdquo;</blockquote>
      <cite>${s.name}, ${s.role}</cite>
    </div>

${sectionsMarkup}

    <div class="sf-spot-wisdom">
      <h2>${s.wisdom.title}</h2>
      ${wisdomMarkup}
    </div>

    <div class="sf-spot-practice">
      <h2>${s.dailyPractice.title}</h2>
      <ul>
        ${practiceMarkup}
      </ul>
    </div>

    <div class="sf-spot-section">
      <span class="sf-spot-section-label">Sober Founders Impact</span>
      <h2>${s.soberFoundersImpact.title}</h2>
      ${s.soberFoundersImpact.paragraphs.map((p) => `<p>${p}</p>`).join("\n      ")}
    </div>

    <div class="sf-spot-building">
      <h2>${s.buildingNowTitle || "What They're Building Now"}</h2>
      <p>${s.buildingNow}</p>
    </div>

    <div class="sf-spot-rec">
      <blockquote>&ldquo;${s.recommendationQuote}&rdquo;</blockquote>
      <cite>${s.name}</cite>
    </div>

    <div class="sf-spot-cta">
      <h2>${s.ctaHeadline || "Want a room where recovery and business speak the same language?"}</h2>
      <p>${s.ctaBody}</p>
      <div class="sf-spot-cta-actions">
        <a class="sf-spot-btn" href="/events/">Attend Your First Meeting Free</a>
        <a class="sf-spot-btn-alt" href="/phoenix-forum-2nd-group/">Learn About Phoenix Forum</a>
      </div>
    </div>
  </div>
</div>
<!-- /wp:html -->`;
}

// ── WordPress API ───────────────────────────────────────────────────────────

async function wpFetch(path, options = {}) {
  const res = await fetch(`${SITE}${path}`, { headers, ...options });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WP API ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

async function findOrCreateCategory(name) {
  const existing = await wpFetch(
    `/wp-json/wp/v2/categories?search=${encodeURIComponent(name)}&per_page=5`,
  );
  if (Array.isArray(existing) && existing.length > 0) {
    const exact = existing.find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (exact) return exact.id;
  }
  // Create category
  const created = await wpFetch(`/wp-json/wp/v2/categories`, {
    method: "POST",
    body: JSON.stringify({ name, slug: name.toLowerCase().replace(/\s+/g, "-") }),
  });
  return created.id;
}

async function findPostBySlug(slug) {
  const posts = await wpFetch(
    `/wp-json/wp/v2/posts?slug=${slug}&status=publish,draft,private,future&per_page=5`,
  );
  if (Array.isArray(posts) && posts.length) return posts[0];
  // Also search by keyword in case WordPress altered the slug
  const bySearch = await wpFetch(
    `/wp-json/wp/v2/posts?search=${encodeURIComponent(slug)}&status=publish,draft,private,future&per_page=5`,
  );
  if (Array.isArray(bySearch) && bySearch.length) {
    const match = bySearch.find((p) => p.slug.startsWith(slug));
    if (match) return match;
  }
  return null;
}

async function setSeoFields(postId, seo) {
  try {
    const result = await wpFetch(`/wp-json/sober/v1/seo`, {
      method: "POST",
      body: JSON.stringify({
        post_id: postId,
        title: seo.title,
        description: seo.description,
        focus_keyword: seo.focusKeyword,
      }),
    });
    return result;
  } catch (err) {
    console.error(`  SEO write failed: ${err.message}`);
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Member Spotlight Deploy");
  console.log(`  Target: ${SITE}`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : AS_DRAFT ? "DRAFT" : "PUBLISH"}`);
  console.log(`${"=".repeat(60)}\n`);

  for (const spotlight of spotlights) {
    console.log(`Processing: ${spotlight.name} (${spotlight.role})`);

    const content = buildSpotlightPost(spotlight);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would publish: ${spotlight.slug}`);
      console.log(`  Content length: ${content.length} chars`);
      console.log(`  SEO title: ${spotlight.seo.title}`);
      console.log(`  SEO desc: ${spotlight.seo.description}`);
      continue;
    }

    // Find or create category
    const categoryId = await findOrCreateCategory(spotlight.category);
    console.log(`  Category: ${spotlight.category} (ID: ${categoryId})`);

    // Check for existing post
    const existing = await findPostBySlug(spotlight.slug);

    const postBody = {
      title: spotlight.headline,
      slug: spotlight.slug,
      content,
      status: AS_DRAFT ? "draft" : "publish",
      categories: [categoryId],
    };

    let post;
    if (existing) {
      post = await wpFetch(`/wp-json/wp/v2/posts/${existing.id}`, {
        method: "POST",
        body: JSON.stringify(postBody),
      });
      console.log(`  Updated existing post: ID ${post.id}`);
    } else {
      post = await wpFetch(`/wp-json/wp/v2/posts`, {
        method: "POST",
        body: JSON.stringify(postBody),
      });
      console.log(`  Created new post: ID ${post.id}`);
    }

    console.log(`  URL: ${post.link}`);

    // Set Yoast SEO
    const seoResult = await setSeoFields(post.id, spotlight.seo);
    if (seoResult?.success) {
      console.log(`  SEO fields set: ${seoResult.updated.join(", ")}`);
    }

    // Verify
    const verifyRes = await fetch(post.link);
    const verifyHtml = await verifyRes.text();
    const verified = verifyHtml.includes("sf-spot");
    console.log(`  Live verify: ${verified ? "PASS" : "FAIL"}`);
  }

  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error("Deploy failed:", err.message);
  process.exit(1);
});
