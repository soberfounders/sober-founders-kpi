import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendHubSpotEmail, lookupContactByEmail } from "../_shared/hubspot_email.ts";
import { createNotionFollowUp } from "../_shared/notion_task.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function calendarUrl(isThursday: boolean): string {
    return isThursday
        ? "https://soberfounders.org/thursday"
        : "https://soberfounders.org/tuesday";
}

/* ------------------------------------------------------------------ */
/*  Streak Break Message Generation (fixed template - no AI)           */
/* ------------------------------------------------------------------ */

function generateStreakBreakMessages(candidates: any[]): any[] {
    return candidates.map(c => {
        const firstName = c.firstname || "there";
        const calLink = calendarUrl(c.last_was_thursday === true);
        const groupLabel = c.last_was_thursday ? "thursday" : "tuesday";

        return {
            email: c.email,
            name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "there",
            subject: `Hey ${firstName}, checking in`,
            message:
                `Hey ${firstName},\n\n` +
                `Haven't seen you in a few weeks - just wanted to check in and make sure everything's good.\n\n` +
                `No pressure at all, if you want to pop back in we're still running and if you need any links you can go to https://soberfounders.org/${groupLabel}\n\n` +
                `If it's not for you, any feedback is really appreciated, good or bad.\n\n` +
                `Hope to see you!\n\n` +
                `- Andrew`,
        };
    });
}

/* ------------------------------------------------------------------ */
/*  Slack Alert                                                        */
/* ------------------------------------------------------------------ */

async function alertSlack(stats: any, dryRun: boolean): Promise<boolean> {
    const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
    if (!webhookUrl) return false;

    const modeLabel = dryRun ? "DRY RUN — no emails sent" : "LIVE";

    const blocks: any[] = [
        {
            type: "header",
            text: { type: "plain_text", text: `Streak Break Agent — ${modeLabel}`, emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: [
                    `*Streak Break Summary:*`,
                    `- Regulars Who Went Quiet: ${stats.totalCandidates}`,
                    `- Queued This Run: ${stats.processed}`,
                    dryRun ? `- Emails Sent: 0 (dry run)` : `- Emails Sent: ${stats.emailsSent}`,
                    dryRun ? `- Review in KPI Dashboard → Outreach Queue` : `- Notion Tasks: ${stats.notionTasks}`,
                    stats.errors > 0 ? `- Errors: ${stats.errors}` : "",
                ].filter(Boolean).join("\n"),
            },
        },
    ];

    if (dryRun && stats.previews?.length > 0) {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*Preview — emails that would be sent:*\n${
                    stats.previews.map((p: any) =>
                        `• *${p.name || p.email}* (${p.email})\n  _Subject:_ ${p.subject}\n  _Message:_ ${p.message}`
                    ).join("\n\n")
                }`,
            },
        });
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*Review these in the KPI Dashboard* → Attendance → Outreach Review Queue. Click Send on each one you approve.\n\n*To auto-send all:* POST \`/streak-break-agent\` with \`{"dry_run": false}\``,
            },
        });
    }

    if (!dryRun && stats.recipients?.length > 0) {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*Reached Out To:*\n${stats.recipients.map((r: string) => `• ${r}`).join("\n")}`,
            },
        });
    }

    const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
    });
    return resp.ok;
}

/* ------------------------------------------------------------------ */
/*  Main Handler                                                       */
/* ------------------------------------------------------------------ */

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const hubspotToken = Deno.env.get("HUBSPOT_PRIVATE_APP_TOKEN");
        const senderEmail = Deno.env.get("HUBSPOT_SENDER_EMAIL") || "";

        let dryRun = true;
        try {
            const body = await req.json();
            if (body?.dry_run === false) dryRun = false;
        } catch { /* default dry_run:true */ }

        // 1. Get streak-break candidates not reached in last 28 days
        //    (view already excludes people nudged via at_risk_nudge in last 14d)
        const { data: candidates, error } = await supabase
            .from("vw_streak_break_candidates")
            .select("*")
            .is("last_streak_break_sent", null)
            .is("last_at_risk_nudge_sent", null)
            .order("days_since_last", { ascending: true }); // most recently quiet first

        if (error) throw error;

        const realCandidates = (candidates || []).filter(
            (c: any) => c.email && !c.email.includes("admin@")
        );

        // 2. Generate messages (max 5 per run — these are more personal outreaches)
        const targets = realCandidates.slice(0, 5);
        let messages: any[] = [];
        if (targets.length > 0) {
            messages = generateStreakBreakMessages(targets);
        }

        let emailsSent = 0;
        let notionTasks = 0;
        let errors = 0;
        const recipients: string[] = [];

        // Dry run: no HubSpot tasks — review candidates in the KPI dashboard
        // OutreachReviewQueue and click Send from there.

        if (!dryRun) {
            for (const msg of messages) {
                const targetInfo = targets.find(
                    (t: any) => t.email?.toLowerCase() === msg.email?.toLowerCase()
                );

                if (hubspotToken && senderEmail) {
                    const { data: contact } = await supabase
                        .from("raw_hubspot_contacts")
                        .select("hubspot_contact_id")
                        .ilike("email", msg.email)
                        .limit(1)
                        .single();

                    let contactId = contact?.hubspot_contact_id;
                    if (!contactId) {
                        contactId = await lookupContactByEmail(hubspotToken, msg.email);
                    }

                    if (contactId) {
                        const emailResult = await sendHubSpotEmail(hubspotToken, {
                            contactId,
                            contactEmail: msg.email,
                            senderEmail,
                            subject: msg.subject,
                            htmlBody: msg.message.split("\n").map((l: string) => l ? `<p>${l}</p>` : "").join(""),
                            campaignType: "streak_break",
                        });

                        if (emailResult.ok) {
                            emailsSent++;
                            recipients.push(
                                `${msg.name || msg.email} (${targetInfo?.total_meetings || "?"}x, ${targetInfo?.days_since_last || "?"}d ago)`
                            );
                        } else {
                            console.error(`Email failed for ${msg.email}:`, emailResult.error);
                            msg._deliveryError = emailResult.error || "unknown";
                            errors++;
                        }
                    } else {
                        console.warn(`No HubSpot contact found for ${msg.email}`);
                        errors++;
                    }
                }

                const notionResult = await createNotionFollowUp({
                    title: `Streak break check: ${msg.name || msg.email} — did they return?`,
                    description: `Streak break outreach sent.\n\nTotal meetings: ${targetInfo?.total_meetings || "?"}\nDays since last: ${targetInfo?.days_since_last || "?"}\nLast session: ${targetInfo?.last_was_thursday ? "Thursday" : "Tuesday"}\n\nEmail: "${msg.subject}"\nCheck HubSpot timeline for delivery + reply.`,
                    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
                    priority: "Medium",
                    tags: ["outreach", "streak-break", "automated"],
                });

                if (notionResult.ok) notionTasks++;
            }

            // Log recovery events (successes AND failures for dashboard health monitoring)
            if (messages.length > 0) {
                const events = messages.map((m: any) => {
                    const targetInfo = targets.find((t: any) => t.email === m.email);
                    return {
                        attendee_email: m.email,
                        event_type: "streak_break",
                        meeting_date: targetInfo?.last_attended,
                        metadata: {
                            ai_message: m.message,
                            subject: m.subject,
                            campaign_type: "streak_break",
                            total_meetings: targetInfo?.total_meetings,
                            days_since_last: targetInfo?.days_since_last,
                            ...(m._deliveryError ? { delivery_failed: m._deliveryError } : {}),
                        },
                    };
                });
                await supabase.from("recovery_events").insert(events);
            }
        }

        await alertSlack({
            totalCandidates: realCandidates.length,
            processed: messages.length,
            emailsSent,
            notionTasks,
            errors,
            recipients,
            previews: dryRun ? messages : [],
        }, dryRun);

        return new Response(
            JSON.stringify({
                ok: true,
                dry_run: dryRun,
                processed: messages.length,
                emails_sent: emailsSent,
                notion_tasks: notionTasks,
                candidates_remaining: realCandidates.length - targets.length,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("Streak Break Agent Error:", err);
        return new Response(
            JSON.stringify({ ok: false, error: err.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
