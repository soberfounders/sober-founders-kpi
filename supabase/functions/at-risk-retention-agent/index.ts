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

// Cron runs Monday (for Tuesday) or Wednesday (for Thursday)
function nextMeetingDay(): "Tuesday" | "Thursday" {
    const dow = new Date().getUTCDay(); // 0=Sun
    return dow === 3 ? "Thursday" : "Tuesday"; // Wednesday run → Thursday; everything else → Tuesday
}

function calendarUrl(meetingDay: "Tuesday" | "Thursday"): string {
    return meetingDay === "Thursday"
        ? "https://soberfounders.org/thursday"
        : "https://soberfounders.org/tuesday";
}

/* ------------------------------------------------------------------ */
/*  AI Nudge Generation                                                */
/* ------------------------------------------------------------------ */

async function generateNudgeMessages(candidates: any[]): Promise<any[]> {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const meetingDay = nextMeetingDay();
    const calLink = calendarUrl(meetingDay);

    if (!geminiKey) {
        return candidates.map(c => ({
            email: c.email,
            name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "there",
            subject: `Hope to see you tomorrow`,
            message:
                `Hey ${c.firstname || "there"}, just wanted to reach out — we'd love to see you at tomorrow's ${meetingDay} meeting! ` +
                `You can easily add it to your calendar at ${calLink}. Hope to see you there!`,
            reason: "fallback_template",
        }));
    }

    const prompt = [
        "You are the 'Sober Founders' community manager writing a personal check-in email.",
        `Tomorrow is ${meetingDay} — our regular group meeting.`,
        "These people have been regulars (attended 2+ times recently) but missed the last meeting.",
        "Write a short (2–3 sentences), warm, personal email for each person.",
        "Make it feel like a friend reaching out, not a system notification.",
        "Don't mention 'attendance tracking' or 'data' — just a genuine 'hope to see you tomorrow'.",
        `End with a line letting them know they can add it to their calendar at ${calLink}.`,
        "Use their first name.",
        "",
        "Candidates:",
        JSON.stringify(candidates.map(c => ({
            email: c.email,
            name: `${c.firstname || ""} ${c.lastname || ""}`.trim(),
            meetings_last_60d: c.meetings_60d,
            days_since_last: c.days_since_last,
        }))),
        "",
        "Return JSON: { nudges: [ { email: string, name: string, subject: string, message: string } ] }",
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
        if (parsed?.nudges?.length) return parsed.nudges;
    }

    return candidates.map(c => ({
        email: c.email,
        name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "there",
        subject: `Hope to see you tomorrow`,
        message:
            `Hey ${c.firstname || "there"}, just wanted to reach out — we'd love to see you at tomorrow's ${meetingDay} meeting! ` +
            `You can easily add it to your calendar at ${calLink}. Hope to see you there!`,
        reason: "fallback_template",
    }));
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
            text: { type: "plain_text", text: `At-Risk Retention Agent — ${modeLabel}`, emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: [
                    `*Retention Nudge Summary:*`,
                    `- At-Risk Attendees Found: ${stats.totalAtRisk}`,
                    `- Queued This Run: ${stats.processed}`,
                    dryRun ? `- Emails Sent: 0 (dry run)` : `- Nudge Emails Sent: ${stats.emailsSent}`,
                    dryRun ? `- HubSpot Draft Tasks: ${stats.taskDraftsCreated ?? 0} created` : `- Notion Follow-ups Created: ${stats.notionTasks}`,
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
                text: `*Preview — nudges that would be sent:*\n${
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
                text: `*HubSpot draft tasks created* — go to HubSpot → Tasks (filter by type: Email) to review and click Send.\n\n*To flip live:* POST \`/at-risk-retention-agent\` with \`{"dry_run": false}\``,
            },
        });
    }

    if (!dryRun && stats.recipients?.length > 0) {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*Nudged:*\n${stats.recipients.map((r: string) => `• ${r}`).join("\n")}`,
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

        // 1a. At-risk regulars (attended 2+ times recently, gone quiet)
        const { data: atRiskData, error: atRiskError } = await supabase
            .from("vw_at_risk_attendees")
            .select("*")
            .is("last_nudge_sent", null)
            .order("days_since_last", { ascending: false });

        if (atRiskError) throw atRiskError;

        // 1b. No-show follow-ups (got no-show email ≤8 days ago, no negative reply)
        //     These are people who missed once and haven't responded — day-before nudge
        //     to bring them back to the next meeting.
        const { data: followUpData, error: followUpError } = await supabase
            .from("vw_noshow_followup_candidates")
            .select("*")
            .is("last_nudge_sent", null);

        if (followUpError) throw followUpError;

        // Merge both sets, dedup by email (at-risk takes priority if both)
        const atRiskEmails = new Set(
            (atRiskData || []).map((c: any) => c.email?.toLowerCase())
        );
        const followUpCandidates = (followUpData || []).filter(
            (c: any) => c.email && !atRiskEmails.has(c.email.toLowerCase())
        ).map((c: any) => ({
            // Normalize to at-risk shape so the nudge function works uniformly
            email: c.email,
            firstname: c.firstname,
            lastname: c.lastname,
            meetings_60d: null,
            days_since_last: c.days_since_missed,
            last_attended: c.last_missed_meeting,
            last_nudge_sent: null,
            _source: "noshow_followup",
        }));

        const allCandidates = [
            ...(atRiskData || []).map((c: any) => ({ ...c, _source: "at_risk" })),
            ...followUpCandidates,
        ];

        const realCandidates = allCandidates.filter(
            (c: any) => c.email && !c.email.includes("admin@")
        );

        // 2. Generate nudge messages (max 10 per run)
        const targets = realCandidates.slice(0, 10);
        let nudges: any[] = [];
        if (targets.length > 0) {
            nudges = await generateNudgeMessages(targets);
        }

        let emailsSent = 0;
        let notionTasks = 0;
        let taskDraftsCreated = 0;
        let errors = 0;
        const recipients: string[] = [];

        if (dryRun && hubspotToken && nudges.length > 0) {
            // 3a. Dry run — create HubSpot task drafts for review
            for (const nudge of nudges) {
                const { data: contact } = await supabase
                    .from("raw_hubspot_contacts")
                    .select("hubspot_contact_id")
                    .ilike("email", nudge.email)
                    .limit(1)
                    .single();

                let contactId = contact?.hubspot_contact_id;
                if (!contactId) contactId = await lookupContactByEmail(hubspotToken, nudge.email);

                if (contactId) {
                    const taskResult = await createHubSpotTaskDraft(hubspotToken, {
                        contactId,
                        subject: nudge.subject,
                        body: nudge.message,
                        campaignType: "at_risk_nudge",
                    });
                    if (taskResult.ok) taskDraftsCreated++;
                    else console.warn(`Task draft failed for ${nudge.email}:`, taskResult.error);
                }
            }
        }

        if (!dryRun) {
            const meetingDay = nextMeetingDay();

            for (const nudge of nudges) {
                const targetInfo = targets.find(
                    (t: any) => t.email?.toLowerCase() === nudge.email?.toLowerCase()
                );

                if (hubspotToken && senderEmail) {
                    const { data: contact } = await supabase
                        .from("raw_hubspot_contacts")
                        .select("hubspot_contact_id")
                        .ilike("email", nudge.email)
                        .limit(1)
                        .single();

                    let contactId = contact?.hubspot_contact_id;
                    if (!contactId) {
                        contactId = await lookupContactByEmail(hubspotToken, nudge.email);
                    }

                    if (contactId) {
                        const emailResult = await sendHubSpotEmail(hubspotToken, {
                            contactId,
                            contactEmail: nudge.email,
                            senderEmail,
                            subject: nudge.subject || "Hope to see you tomorrow",
                            htmlBody: `<p>${nudge.message}</p>`,
                            campaignType: "at_risk_nudge",
                        });

                        if (emailResult.ok) {
                            emailsSent++;
                            recipients.push(
                                `${nudge.name || nudge.email} (${targetInfo?.days_since_last || "?"}d since last)`
                            );
                        } else {
                            nudge._deliveryError = emailResult.error || "unknown";
                            errors++;
                        }
                    } else {
                        errors++;
                    }
                }

                const notionResult = await createNotionFollowUp({
                    title: `Check: did ${nudge.name || nudge.email} attend ${meetingDay}?`,
                    description: `At-risk nudge sent.\n\nAttendance: ${targetInfo?.meetings_60d || "?"}x in 60d, last ${targetInfo?.days_since_last || "?"}d ago.\n\nEmail: "${nudge.subject}"\nCheck HubSpot timeline for delivery + reply.`,
                    dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
                    priority: "High",
                    tags: ["outreach", "at-risk-retention", "automated"],
                });

                if (notionResult.ok) notionTasks++;
            }

            // Log recovery events (successes AND failures for dashboard health monitoring)
            if (nudges.length > 0) {
                const events = nudges.map((n: any) => {
                    const targetInfo = targets.find((t: any) => t.email === n.email);
                    return {
                        attendee_email: n.email,
                        event_type: "at_risk_nudge",
                        meeting_date: targetInfo?.last_attended,
                        metadata: {
                            ai_message: n.message,
                            subject: n.subject,
                            campaign_type: "at_risk_nudge",
                            days_since_last: targetInfo?.days_since_last,
                            meetings_60d: targetInfo?.meetings_60d,
                            ...(n._deliveryError ? { delivery_failed: n._deliveryError } : {}),
                        },
                    };
                });
                await supabase.from("recovery_events").insert(events);
            }
        }

        await alertSlack({
            totalAtRisk: realCandidates.length,
            processed: nudges.length,
            emailsSent,
            notionTasks,
            taskDraftsCreated,
            errors,
            recipients,
            previews: dryRun ? nudges : [],
        }, dryRun);

        return new Response(
            JSON.stringify({
                ok: true,
                dry_run: dryRun,
                processed: nudges.length,
                emails_sent: emailsSent,
                notion_tasks: notionTasks,
                candidates_remaining: realCandidates.length - targets.length,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("At-Risk Retention Agent Error:", err);
        return new Response(
            JSON.stringify({ ok: false, error: err.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
