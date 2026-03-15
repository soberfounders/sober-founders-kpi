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

/* ------------------------------------------------------------------ */
/*  AI Winback Message Generation                                      */
/* ------------------------------------------------------------------ */

function calendarUrl(isThursday: boolean): string {
    return isThursday
        ? "https://soberfounders.org/thursday"
        : "https://soberfounders.org/tuesday";
}

async function generateWinbackMessages(candidates: any[]): Promise<any[]> {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) {
        return candidates.map(c => {
            const calLink = calendarUrl(c.is_thursday_attendee === true);
            return {
                email: c.email,
                name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "there",
                subject: `Thinking of you`,
                message:
                    `Hey ${c.firstname || "there"}, it's been a while since you joined us at Sober Founders — just wanted to reach out and let you know you're always welcome back. ` +
                    `A lot has happened since your last visit and the community keeps growing. ` +
                    `If you'd like to reconnect, you can easily add the meeting to your calendar at ${calLink} — hope to see you soon!`,
                reason: "fallback_template",
            };
        });
    }

    const prompt = [
        "You are the 'Sober Founders' community leader writing personal winback emails.",
        "These people attended ONE meeting and never came back.",
        "Write a short (3-4 sentences), warm, personal email for each person.",
        "Key guidelines:",
        "- Don't guilt-trip. Don't say 'we noticed you stopped coming'.",
        "- Instead, share something positive that's happened in the community recently.",
        "- Make them feel like they'd be welcomed back warmly.",
        "- Reference roughly how long it's been (e.g., 'a couple months', 'a few weeks').",
        "- End with a line: 'You can easily add the meeting to your calendar at [calendar_url]'",
        "- Use their first name. Feel like a personal note, not a system email.",
        "",
        "Candidates:",
        JSON.stringify(candidates.map(c => ({
            email: c.email,
            name: `${c.firstname || ""} ${c.lastname || ""}`.trim(),
            first_attended: c.first_attended,
            days_since: c.days_since_last,
            calendar_url: calendarUrl(c.is_thursday_attendee === true),
        }))),
        "",
        "Return JSON: { winbacks: [ { email: string, name: string, subject: string, message: string } ] }",
    ].join("\n");

    const model = "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.5, responseMimeType: "application/json" },
        }),
    });

    if (resp.ok) {
        const json = await resp.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const parsed = safeJsonParse(stripCodeFences(text));
        return parsed?.winbacks || [];
    }

    return candidates.map(c => ({
        email: c.email,
        name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "there",
        subject: `Thinking of you`,
        message: `Hey ${c.firstname || "there"}, it's been a little while since you joined us and I just wanted to say — you're always welcome back at Sober Founders. The community has been growing and the conversations keep getting better. Would love to see you at an upcoming meeting!`,
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
            text: { type: "plain_text", text: `Winback Campaign Agent — ${modeLabel}`, emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: [
                    `*Winback Summary:*`,
                    `- Total One-and-Done Candidates: ${stats.totalWinback}`,
                    `- Queued This Batch: ${stats.processed}`,
                    dryRun ? `- Emails Sent: 0 (dry run)` : `- Emails Sent: ${stats.emailsSent}`,
                    dryRun ? `- HubSpot Draft Tasks: ${stats.taskDraftsCreated ?? 0} created` : `- Notion Tasks: ${stats.notionTasks}`,
                    `- Remaining in Pipeline: ${stats.remaining}`,
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
                text: `*Preview — winback emails that would be sent:*\n${
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
                text: `*HubSpot draft tasks created* — go to HubSpot → Tasks (filter by type: Email) to review and click Send.\n\n*To flip live:* POST \`/winback-campaign-agent\` with \`{"dry_run": false}\``,
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

        // Parse request params
        let batchSize = 10;
        let dryRun = true;
        try {
            const body = await req.json();
            if (body?.batch_size) batchSize = Math.min(Number(body.batch_size) || 10, 20);
            if (body?.dry_run === false) dryRun = false;
        } catch { /* defaults */ }

        // 1. Get winback candidates who haven't been contacted
        const { data: candidates, error } = await supabase
            .from("vw_winback_candidates")
            .select("*")
            .is("last_winback_sent", null)
            .order("days_since_last", { ascending: true });

        if (error) throw error;

        const realCandidates = (candidates || []).filter(
            (c: any) => c.email && !c.email.includes("admin@")
        );

        // 2. Generate personalized winback messages
        const targets = realCandidates.slice(0, batchSize);
        let winbacks: any[] = [];
        if (targets.length > 0) {
            winbacks = await generateWinbackMessages(targets);
        }

        let emailsSent = 0;
        let notionTasks = 0;
        let taskDraftsCreated = 0;
        let errors = 0;
        const recipients: string[] = [];

        if (dryRun && hubspotToken && winbacks.length > 0) {
            // 3a. Dry run — create HubSpot task drafts for review
            for (const wb of winbacks) {
                const { data: contact } = await supabase
                    .from("raw_hubspot_contacts")
                    .select("hubspot_contact_id")
                    .ilike("email", wb.email)
                    .limit(1)
                    .single();

                let contactId = contact?.hubspot_contact_id;
                if (!contactId) contactId = await lookupContactByEmail(hubspotToken, wb.email);

                if (contactId) {
                    const taskResult = await createHubSpotTaskDraft(hubspotToken, {
                        contactId,
                        subject: wb.subject || "Thinking of you",
                        body: wb.message,
                        campaignType: "winback",
                    });
                    if (taskResult.ok) taskDraftsCreated++;
                    else console.warn(`Task draft failed for ${wb.email}:`, taskResult.error);
                }
            }
        }

        if (!dryRun) {
            // 3b. Send live — HubSpot + Notion
            for (const wb of winbacks) {
                const targetInfo = targets.find(
                    (t: any) => t.email?.toLowerCase() === wb.email?.toLowerCase()
                );

                if (hubspotToken && senderEmail) {
                    const { data: contact } = await supabase
                        .from("raw_hubspot_contacts")
                        .select("hubspot_contact_id")
                        .ilike("email", wb.email)
                        .limit(1)
                        .single();

                    let contactId = contact?.hubspot_contact_id;
                    if (!contactId) {
                        contactId = await lookupContactByEmail(hubspotToken, wb.email);
                    }

                    if (contactId) {
                        const emailResult = await sendHubSpotEmail(hubspotToken, {
                            contactId,
                            contactEmail: wb.email,
                            senderEmail,
                            subject: wb.subject || "Thinking of you",
                            htmlBody: `<p>${wb.message}</p>`,
                            campaignType: "winback",
                        });

                        if (emailResult.ok) {
                            emailsSent++;
                            recipients.push(`${wb.name || wb.email} (${targetInfo?.days_since_last || "?"}d ago)`);
                        } else {
                            errors++;
                        }
                    } else {
                        errors++;
                    }
                }

                const notionResult = await createNotionFollowUp({
                    title: `Winback check: ${wb.name || wb.email} — did they return?`,
                    description: `Winback email sent to one-time attendee.\n\nFirst attended: ${targetInfo?.first_attended || "unknown"}\nDays since: ${targetInfo?.days_since_last || "?"}\nSession: ${targetInfo?.is_thursday_attendee ? "Thursday" : "Tuesday"}\n\nCheck HubSpot timeline and attendance data to see if they returned.`,
                    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
                    priority: "Low",
                    tags: ["outreach", "winback", "automated"],
                });

                if (notionResult.ok) notionTasks++;
            }

            // 4. Log recovery events
            if (winbacks.length > 0) {
                const events = winbacks.map((w: any) => ({
                    attendee_email: w.email,
                    event_type: "winback",
                    meeting_date: targets.find((t: any) => t.email === w.email)?.first_attended,
                    metadata: {
                        ai_message: w.message,
                        subject: w.subject,
                        campaign_type: "winback",
                        days_since_last: targets.find((t: any) => t.email === w.email)?.days_since_last,
                        is_thursday_attendee: targets.find((t: any) => t.email === w.email)?.is_thursday_attendee,
                    },
                }));
                await supabase.from("recovery_events").insert(events);
            }
        }

        // 5. Slack summary
        await alertSlack({
            totalWinback: realCandidates.length,
            processed: winbacks.length,
            emailsSent,
            notionTasks,
            taskDraftsCreated,
            errors,
            remaining: realCandidates.length - targets.length,
            recipients,
            previews: dryRun ? winbacks : [],
        }, dryRun);

        return new Response(
            JSON.stringify({
                ok: true,
                dry_run: dryRun,
                processed: winbacks.length,
                emails_sent: emailsSent,
                notion_tasks: notionTasks,
                candidates_remaining: realCandidates.length - targets.length,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("Winback Campaign Agent Error:", err);
        return new Response(
            JSON.stringify({ ok: false, error: err.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
