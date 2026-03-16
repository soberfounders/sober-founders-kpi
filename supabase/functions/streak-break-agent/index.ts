import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendHubSpotEmail, lookupContactByEmail, createHubSpotTaskDraft } from "../_shared/hubspot_email.ts";
import { createNotionFollowUp } from "../_shared/notion_task.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function stripCodeFences(text: string) {
    return String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function safeJsonParse<T = any>(value: string): T | null {
    try { return JSON.parse(value) as T; } catch { return null; }
}

function calendarUrl(isThursday: boolean): string {
    return isThursday
        ? "https://soberfounders.org/thursday"
        : "https://soberfounders.org/tuesday";
}

/* ------------------------------------------------------------------ */
/*  AI Message Generation                                              */
/* ------------------------------------------------------------------ */

async function generateStreakBreakMessages(candidates: any[]): Promise<any[]> {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) {
        return candidates.map(c => {
            const firstName = c.firstname || "there";
            const calLink = calendarUrl(c.last_was_thursday === true);
            return {
                email: c.email,
                name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "there",
                subject: `Hey ${firstName}, haven't seen you in a bit`,
                message:
                    `Hey ${firstName}, you were coming pretty regularly and we haven't seen you in a little while — just wanted to check in and make sure everything's okay! ` +
                    `If life just got busy, no worries at all — here's the link to add us back to your calendar: ${calLink}. ` +
                    `If something about the meetings wasn't working for you, we'd really love to hear your feedback on how to make it better.`,
                reason: "fallback_template",
            };
        });
    }

    const prompt = [
        "You are the 'Sober Founders' community leader writing a personal check-in to people who used to come regularly but have gone quiet.",
        "",
        "These people attended 3 or more meetings in a row, but haven't been back in 2–8 weeks.",
        "",
        "Guidelines:",
        "- 2–3 sentences, warm and personal.",
        "- Acknowledge they were a regular (don't make it feel like a form letter).",
        "- Don't guilt-trip or make them feel bad for not coming.",
        "- Ask if everything is okay — genuine concern.",
        "- If life just got busy, give them the calendar link to add it back.",
        "- End with: 'If something about the meetings wasn't working for you, we'd really love to hear your feedback.'",
        "- Use their first name.",
        "",
        "Candidates:",
        JSON.stringify(candidates.map(c => ({
            email: c.email,
            name: `${c.firstname || ""} ${c.lastname || ""}`.trim(),
            total_meetings: c.total_meetings,
            days_since_last: c.days_since_last,
            calendar_url: calendarUrl(c.last_was_thursday === true),
        }))),
        "",
        "Return JSON: { messages: [ { email: string, name: string, subject: string, message: string } ] }",
    ].join("\n");

    const model = "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
        }),
    });

    if (resp.ok) {
        const json = await resp.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const parsed = safeJsonParse(stripCodeFences(text));
        if (parsed?.messages?.length) return parsed.messages;
    }

    // Fallback templates
    return candidates.map(c => {
        const firstName = c.firstname || "there";
        const calLink = calendarUrl(c.last_was_thursday === true);
        return {
            email: c.email,
            name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "there",
            subject: `Hey ${firstName}, haven't seen you in a bit`,
            message:
                `Hey ${firstName}, you were coming pretty regularly and we haven't seen you in a little while — just wanted to check in and make sure everything's okay! ` +
                `If life just got busy, no worries at all — here's the link to add us back to your calendar: ${calLink}. ` +
                `If something about the meetings wasn't working for you, we'd really love to hear your feedback on how to make it better.`,
            reason: "fallback_template",
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
                    dryRun ? `- HubSpot Draft Tasks: ${stats.taskDraftsCreated ?? 0} created` : `- Notion Tasks: ${stats.notionTasks}`,
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
                text: `*HubSpot draft tasks created* — go to HubSpot → Tasks (filter by type: Email) to review and click Send.\n\n*To flip live:* POST \`/streak-break-agent\` with \`{"dry_run": false}\``,
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
            messages = await generateStreakBreakMessages(targets);
        }

        let emailsSent = 0;
        let notionTasks = 0;
        let taskDraftsCreated = 0;
        let errors = 0;
        const recipients: string[] = [];

        if (dryRun && hubspotToken && messages.length > 0) {
            // 3a. Dry run — create HubSpot task drafts for review
            for (const msg of messages) {
                const { data: contact } = await supabase
                    .from("raw_hubspot_contacts")
                    .select("hubspot_contact_id")
                    .ilike("email", msg.email)
                    .limit(1)
                    .single();

                let contactId = contact?.hubspot_contact_id;
                if (!contactId) contactId = await lookupContactByEmail(hubspotToken, msg.email);

                if (contactId) {
                    const taskResult = await createHubSpotTaskDraft(hubspotToken, {
                        contactId,
                        subject: msg.subject,
                        body: msg.message,
                        campaignType: "streak_break",
                    });
                    if (taskResult.ok) taskDraftsCreated++;
                    else console.warn(`Task draft failed for ${msg.email}:`, taskResult.error);
                }
            }
        }

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
                            htmlBody: `<p>${msg.message}</p>`,
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
            taskDraftsCreated,
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
