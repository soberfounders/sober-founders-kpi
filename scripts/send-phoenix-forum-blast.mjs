#!/usr/bin/env node
/**
 * Phoenix Forum -"Sold Out, Apply for Next Cohort" Email Blast
 *
 * Targets Mailchimp tags: "$1m $1yr" (405) and "Phoenix Lead" (14)
 * Uses Sober Founders brand colors (dark theme, teal/orange accents).
 *
 * Usage:
 *   node scripts/send-phoenix-forum-blast.mjs              # preview only (no send)
 *   node scripts/send-phoenix-forum-blast.mjs --send        # create + send to tagged members
 *   node scripts/send-phoenix-forum-blast.mjs --test-email  # send test to Andrew first
 */

const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
if (!MAILCHIMP_API_KEY) { console.error("Set MAILCHIMP_API_KEY env var"); process.exit(1); }
const SERVER_PREFIX = MAILCHIMP_API_KEY.split("-").pop();
const BASE_URL = `https://${SERVER_PREFIX}.api.mailchimp.com/3.0`;
const TEST_RECIPIENT = "andrewlassise@gmail.com";

const authHeader = "Basic " + Buffer.from(`anystring:${MAILCHIMP_API_KEY}`).toString("base64");

async function mc(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      authorization: authHeader,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { ok: resp.ok, status: resp.status, json, text };
}

// ---------------------------------------------------------------------------
// Target tags -members who qualify for Phoenix Forum
// ---------------------------------------------------------------------------
const TARGET_TAGS = ["$1m $1yr", "Phoenix Lead"];

// ---------------------------------------------------------------------------
// Email HTML -Sober Founders brand colors
// ---------------------------------------------------------------------------

const EMAIL_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Phoenix Forum - Sold Out</title>
</head>
<body style="margin:0; padding:0; background-color:#0a0a0a; font-family:'Outfit', 'Inter', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#111111; border:1px solid rgba(255,255,255,0.08); border-radius:8px; overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color:#0a0a0a; padding:36px 40px; text-align:center; border-bottom:1px solid rgba(255,255,255,0.08);">
              <p style="margin:0 0 8px; color:#f1972c; font-size:12px; font-weight:600; letter-spacing:3px; text-transform:uppercase;">
                Sober Founders
              </p>
              <h1 style="margin:0; color:#ffffff; font-size:30px; font-weight:400; letter-spacing:0.5px; font-family:Georgia, 'Times New Roman', serif;">
                Phoenix Forum
              </h1>
              <p style="margin:10px 0 0; color:rgba(255,255,255,0.5); font-size:13px; letter-spacing:1px;">
                $1M+ Revenue &middot; 1+ Year Sober &middot; 10 Seats Max
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">

              <p style="color:rgba(255,255,255,0.85); font-size:17px; line-height:1.7; margin:0 0 20px;">
                <strong style="color:#5eecc0;">Our most recent Phoenix Forum group is full.</strong>
              </p>

              <p style="color:rgba(255,255,255,0.85); font-size:17px; line-height:1.7; margin:0 0 20px;">
                All 10 seats are taken. The members are already deep in the work - monthly hot seats, real numbers on the table, the kind of honesty that only happens when everyone in the room signs payroll and works a program.
              </p>

              <p style="color:rgba(255,255,255,0.85); font-size:17px; line-height:1.7; margin:0 0 24px;">
                We're now <strong style="color:#ffffff;">accepting applications for the next group of 10.</strong>
              </p>

              <!-- Early CTA - above the fold -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:4px 0 28px;">
                    <a href="https://soberfounders.org/phoenix-forum-2nd-group/"
                       style="display:inline-block; background-color:#00b286; color:#ffffff; font-size:16px; font-weight:bold; text-decoration:none; padding:16px 44px; border-radius:6px; letter-spacing:0.5px;">
                      Apply Now - 10 Seats Only
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border:none; border-top:1px solid rgba(255,255,255,0.1); margin:20px 0 28px;">

              <h2 style="color:#ffffff; font-size:20px; margin:0 0 16px; font-family:Georgia, 'Times New Roman', serif;">How It Works</h2>

              <p style="color:rgba(255,255,255,0.7); font-size:16px; line-height:1.7; margin:0 0 24px;">
                Think YPO or Vistage, but built for people who understand what it means to rebuild a life and a business at the same time.
              </p>

              <!-- Feature items - separated for scannability -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
                <tr>
                  <td style="padding:16px 20px; background-color:rgba(241,151,44,0.08); border-left:3px solid #f1972c; border-radius:0 6px 6px 0;">
                    <p style="margin:0; color:rgba(255,255,255,0.75); font-size:15px; line-height:1.6;">
                      <strong style="color:#f1972c;">Monthly hot seat format</strong><br>
                      Each session, one member puts their business and life on the table. The group asks the hard questions, shares what's worked, and holds nothing back.
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
                <tr>
                  <td style="padding:16px 20px; background-color:rgba(241,151,44,0.08); border-left:3px solid #f1972c; border-radius:0 6px 6px 0;">
                    <p style="margin:0; color:rgba(255,255,255,0.75); font-size:15px; line-height:1.6;">
                      <strong style="color:#f1972c;">10 members max</strong><br>
                      Small by design. Everyone speaks. Everyone is known. No hiding in the back of a Zoom room.
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
                <tr>
                  <td style="padding:16px 20px; background-color:rgba(241,151,44,0.08); border-left:3px solid #f1972c; border-radius:0 6px 6px 0;">
                    <p style="margin:0; color:rgba(255,255,255,0.75); font-size:15px; line-height:1.6;">
                      <strong style="color:#f1972c;">100% confidential</strong><br>
                      What's said in the room stays in the room. Non-negotiable. This is a space where you can talk about what's really going on.
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="padding:16px 20px; background-color:rgba(241,151,44,0.08); border-left:3px solid #f1972c; border-radius:0 6px 6px 0;">
                    <p style="margin:0; color:rgba(255,255,255,0.75); font-size:15px; line-height:1.6;">
                      <strong style="color:#f1972c;">$499/month</strong><br>
                      The value comes from sitting across from people who understand both your P&L and your recovery.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Self-selection qualifier -->
              <h2 style="color:#ffffff; font-size:20px; margin:28px 0 16px; font-family:Georgia, 'Times New Roman', serif;">This Might Be for You If...</h2>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
                <tr>
                  <td style="padding:0 0 10px 0; color:rgba(255,255,255,0.75); font-size:15px; line-height:1.6;">
                    <span style="color:#5eecc0;">&#10003;</span>&nbsp;&nbsp;Your business does <strong style="color:#ffffff;">$1M+ in annual revenue</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 10px 0; color:rgba(255,255,255,0.75); font-size:15px; line-height:1.6;">
                    <span style="color:#5eecc0;">&#10003;</span>&nbsp;&nbsp;You have <strong style="color:#ffffff;">1+ year of sobriety</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 10px 0; color:rgba(255,255,255,0.75); font-size:15px; line-height:1.6;">
                    <span style="color:#5eecc0;">&#10003;</span>&nbsp;&nbsp;You're tired of being the only sober person at the table
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 10px 0; color:rgba(255,255,255,0.75); font-size:15px; line-height:1.6;">
                    <span style="color:#5eecc0;">&#10003;</span>&nbsp;&nbsp;You want honest feedback from people who actually get it
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 10px 0; color:rgba(255,255,255,0.75); font-size:15px; line-height:1.6;">
                    <span style="color:#5eecc0;">&#10003;</span>&nbsp;&nbsp;You're ready to do the real work - on the business and on yourself
                  </td>
                </tr>
              </table>

              <p style="color:rgba(255,255,255,0.6); font-size:15px; line-height:1.7; margin:20px 0 32px;">
                The application includes a brief interview - not to gatekeep, but to make sure the group is the right fit for you, and you for it.
              </p>

              <!-- Risk reversal + CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                <tr>
                  <td style="padding:16px 20px; background-color:rgba(94,236,192,0.08); border:1px solid rgba(94,236,192,0.15); border-radius:6px; text-align:center;">
                    <p style="margin:0; color:#5eecc0; font-size:14px; line-height:1.6;">
                      <strong>Money Back Guarantee</strong> - If you put in the work and at the end of your commitment still didn't get enough value to justify the investment, contact us for a full refund.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Final CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 12px;">
                    <a href="https://soberfounders.org/phoenix-forum-2nd-group/"
                       style="display:inline-block; background-color:#00b286; color:#ffffff; font-size:16px; font-weight:bold; text-decoration:none; padding:16px 44px; border-radius:6px; letter-spacing:0.5px;">
                      Apply Now - 10 Seats Only
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:rgba(255,255,255,0.4); font-size:13px; line-height:1.6; margin:12px 0 0; text-align:center;">
                Once all 10 seats are filled, the next opening won't be until we launch Group 3.
              </p>

              <!-- P.S. -->
              <hr style="border:none; border-top:1px solid rgba(255,255,255,0.08); margin:28px 0 20px;">

              <p style="color:rgba(255,255,255,0.6); font-size:14px; line-height:1.7; margin:0;">
                <strong style="color:rgba(255,255,255,0.8);">P.S.</strong> The last group filled quickly from members referring their friends after they saw the transformation in their own lives and businesses.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#070707; padding:24px 40px; text-align:center; border-top:1px solid rgba(255,255,255,0.08);">
              <p style="margin:0; color:rgba(255,255,255,0.4); font-size:13px;">
                Sober Founders Inc. &middot; 501(c)(3) Nonprofit &middot; EIN 93-3974961
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const shouldSend = args.includes("--send");
  const shouldTest = args.includes("--test-email");

  console.log("=== Phoenix Forum -Email Blast ===\n");

  // 1. Verify API
  console.log("1. Verifying Mailchimp API...");
  const ping = await mc("/ping");
  if (!ping.ok) {
    console.error(`   ❌ API key invalid: ${ping.text}`);
    process.exit(1);
  }
  console.log("   ✅ API connected");

  // 2. Get account info
  const account = await mc("/");
  const acct = account.json;
  console.log(`   Account: ${acct.account_name} (${acct.email})`);

  // 3. Get list
  console.log("\n2. Finding audience list...");
  const lists = await mc("/lists?count=10");
  if (!lists.ok || !lists.json?.lists?.length) {
    console.error(`   ❌ No lists found`);
    process.exit(1);
  }
  const targetList = lists.json.lists[0];
  console.log(`   → List: "${targetList.name}" (${targetList.id}) -${targetList.stats?.member_count || 0} total members`);

  // 4. Create campaign targeting specific tags
  console.log(`\n3. Creating campaign targeting tags: ${TARGET_TAGS.join(", ")}...`);
  const createResp = await mc("/campaigns", {
    method: "POST",
    body: JSON.stringify({
      type: "regular",
      recipients: {
        list_id: targetList.id,
        segment_opts: {
          match: "any",
          conditions: TARGET_TAGS.map(tag => ({
            condition_type: "StaticSegment",
            field: "static_segment",
            op: "static_is",
            value: tag,
          })),
        },
      },
      settings: {
        subject_line: "Phoenix Forum ($1m+ & 1Yr Sober) Sold Out... but...",
        preview_text: "Our first group is full. Applications are now open for the next cohort of 10.",
        title: "Phoenix Forum -Sold Out, Next Cohort Open",
        from_name: "Sober Founders",
        reply_to: acct.email,
      },
    }),
  });

  if (!createResp.ok) {
    // Tag-based segment_opts may need segment IDs instead of names -try with IDs
    console.log(`   ⚠️  Tag-name approach failed, resolving tag IDs...`);
    const segResp = await mc(`/lists/${targetList.id}/segments?count=50`);
    const segments = segResp.json?.segments || [];
    const tagIds = [];
    for (const tag of TARGET_TAGS) {
      const seg = segments.find(s => s.name === tag);
      if (seg) {
        tagIds.push(seg.id);
        console.log(`   → "${tag}" → segment ID ${seg.id} (${seg.member_count} members)`);
      } else {
        console.log(`   ⚠️  Tag "${tag}" not found as segment`);
      }
    }

    if (tagIds.length === 0) {
      console.error(`   ❌ No matching segments found`);
      process.exit(1);
    }

    const retryResp = await mc("/campaigns", {
      method: "POST",
      body: JSON.stringify({
        type: "regular",
        recipients: {
          list_id: targetList.id,
          segment_opts: {
            match: "any",
            conditions: tagIds.map(id => ({
              condition_type: "StaticSegment",
              field: "static_segment",
              op: "static_is",
              value: id,
            })),
          },
        },
        settings: {
          subject_line: "Phoenix Forum ($1m+ & 1Yr Sober) Sold Out... but...",
          preview_text: "Our first group is full. Applications are now open for the next cohort of 10.",
          title: "Phoenix Forum -Sold Out, Next Cohort Open",
          from_name: "Sober Founders",
          reply_to: acct.email,
        },
      }),
    });

    if (!retryResp.ok) {
      console.error(`   ❌ Campaign creation failed: ${retryResp.text}`);
      process.exit(1);
    }

    var campaignId = retryResp.json.id;
    var recipientCount = retryResp.json.recipients?.recipient_count || "unknown";
    console.log(`   ✅ Campaign created (ID: ${campaignId}) -targeting ~${recipientCount} members`);
  } else {
    var campaignId = createResp.json.id;
    var recipientCount = createResp.json.recipients?.recipient_count || "unknown";
    console.log(`   ✅ Campaign created (ID: ${campaignId}) -targeting ~${recipientCount} members`);
  }

  // 5. Set content
  console.log("\n4. Setting email content...");
  const contentResp = await mc(`/campaigns/${campaignId}/content`, {
    method: "PUT",
    body: JSON.stringify({ html: EMAIL_HTML }),
  });

  if (!contentResp.ok) {
    console.error(`   ❌ Content update failed: ${contentResp.text}`);
    await mc(`/campaigns/${campaignId}`, { method: "DELETE" });
    process.exit(1);
  }
  console.log("   ✅ Content set");

  // 6. Preview / Test / Send
  if (!shouldSend && !shouldTest) {
    console.log("\n=== PREVIEW MODE ===");
    console.log(`Campaign created but NOT sent.`);
    console.log(`Subject: Phoenix Forum ($1m+ & 1Yr Sober) Sold Out... but...`);
    console.log(`Targeting: ${TARGET_TAGS.join(" OR ")} (~${recipientCount} members)`);
    console.log(`\nTo send a test email:  node scripts/send-phoenix-forum-blast.mjs --test-email`);
    console.log(`To send to tagged members: node scripts/send-phoenix-forum-blast.mjs --send`);
    console.log(`\nCampaign ID: ${campaignId}`);
    return;
  }

  if (shouldTest) {
    console.log(`\n5. Sending test email to ${TEST_RECIPIENT}...`);
    const testResp = await mc(`/campaigns/${campaignId}/actions/test`, {
      method: "POST",
      body: JSON.stringify({
        test_emails: [TEST_RECIPIENT],
        send_type: "html",
      }),
    });
    if (testResp.ok) {
      console.log(`   ✅ Test email sent -check ${TEST_RECIPIENT}`);
    } else {
      console.error(`   ❌ Test send failed: ${testResp.text}`);
    }
    console.log(`\nCampaign is still in draft -targeting: ${TARGET_TAGS.join(" OR ")}`);
    console.log(`To send to tagged members: node scripts/send-phoenix-forum-blast.mjs --send`);
    return;
  }

  if (shouldSend) {
    console.log(`\n5. SENDING to tagged members (${TARGET_TAGS.join(" OR ")})...`);
    const sendResp = await mc(`/campaigns/${campaignId}/actions/send`, {
      method: "POST",
    });
    if (!sendResp.ok) {
      console.error(`   ❌ Send failed: ${sendResp.text}`);
      process.exit(1);
    }
    console.log(`   ✅ Campaign sent!`);
    console.log(`\nSubject: Phoenix Forum ($1m+ & 1Yr Sober) Sold Out... but...`);
    console.log(`Audience: ${TARGET_TAGS.join(" OR ")} (~${recipientCount} members)`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
