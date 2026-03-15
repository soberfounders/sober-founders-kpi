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

function sessionName(isThursday: boolean): string {
    return isThursday ? "Thursday Mastermind" : "Tuesday meeting";
}

/* ------------------------------------------------------------------ */
/*  Fallback message templates (no AI key)                            */
/*                                                                    */
/*  prior_meeting_count = 1 → first-timer who no-showed second visit  */
/*  prior_meeting_count = 2 → two-timer who no-showed third visit     */
/*  prior_meeting_count >= 3 → regular (streak-break handles these,   */
/*                              but fallback here just in case)        */
/* ------------------------------------------------------------------ */

function buildFallbackMessage(ns: any): { subject: string; message: string } {
    const firstName = ns.name?.split(" ")[0] || "there";
    const isThursday: boolean = ns.is_thursday === true;
    const calLink = calendarUrl(isThursday);
    const count: number = ns.prior_meeting_count ?? 0;

    let body: string;
    if (count === 1) {
        body =
            `Hey ${firstName}, noticed you came to the meeting last week but weren't at this one — hope everything's alright! ` +
            `If it was just a scheduling issue, you can easily add it to your calendar at ${calLink}. ` +
            `If you decided it wasn't for you, any feedback on how we can make it better would be greatly appreciated!`;
    } else if (count === 2) {
        body =
            `Hey ${firstName}, noticed you've been to a couple of our meetings but weren't at this one — hope everything's okay! ` +
            `If it was just a scheduling issue, you can easily add it to your calendar at ${calLink}. ` +
            `If you decided it wasn't for you, any feedback on how we can make it better would be greatly appreciated!`;
    } else {
        body =
            `Hey ${firstName}, we noticed you weren't at today's ${sessionName(isThursday)} — hope all is well! ` +
            `If it was just a scheduling issue, you can easily add it to your calendar at ${calLink}. ` +
            `If you decided it wasn't for you, any feedback on how we can make it better would be greatly appreciated!`;
    }

    return {
        subject: `Hey ${firstName}, missed you today`,
        message: body,
    };
}

/* ------------------------------------------------------------------ */
/*  AI Message Generation                                              */
/* ------------------------------------------------------------------ */

async function generateRecoveryMessages(noShows: any[]): Promise<any[]> {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) {
        return noShows.map(ns => ({
            email: ns.email,
            name: ns.name || "there",
            ...buildFallbackMessage(ns),
            reason: "fallback_template",
        }));
    }

    const prompt = [
        "You are the 'Sober Founders' community manager writing personal check-in emails to people who registered but didn't attend a meeting.",
        "",
        "Guidelines:",
        "- Keep it short: 2–3 sentences, warm and non-judgmental.",
        "- Use their first name.",
        "- Reference how many meetings they've attended before (prior_meeting_count) to personalize the tone:",
        "  • prior_meeting_count=1: 'noticed you came last week but weren't at this one'",
        "  • prior_meeting_count=2: 'noticed you've been to a couple of our meetings but weren't at this one'",
        "  • prior_meeting_count>=3: 'noticed you haven't been around in a little while'",
        "- If it was just a scheduling issue, mention they can add it to their calendar at the provided calendar_url.",
        "- End with: 'If you decided it wasn't for you, any feedback on how we can make it better would be greatly appreciated!'",
        "- Do NOT mention recordings — there are no recordings.",
        "- Keep the tone: personal friend checking in, not a marketing email.",
        "",
        "Candidates:",
        JSON.stringify(noShows.slice(0, 10).map(ns => ({
            email: ns.email,
            name: ns.name,
            prior_meeting_count: ns.prior_meeting_count ?? 0,
            is_thursday: ns.is_thursday,
            calendar_url: calendarUrl(ns.is_thursday === true),
        }))),
        "",
        "Return JSON: { recoveries: [ { email: string, name: string, subject: string, message: string } ] }",
        "Subject line should feel personal, e.g. 'Hey [Name], missed you today'.",
    ].join("\n");

    const model = "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
        }),
    });

    if (resp.ok) {
        const json = await resp.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const parsed = safeJsonParse(stripCodeFences(text));
        if (parsed?.recoveries?.length) return parsed.recoveries;
    }

    // AI failed — use fallback templates
    return noShows.map(ns => ({
        email: ns.email,
        name: ns.name || "there",
        ...buildFallbackMessage(ns),
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
            text: { type: "plain_text", text: `No-Show Recovery Agent — ${modeLabel}`, emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: [
                    `*Recovery Summary:*`,
                    `- No-Shows Found: ${stats.totalNoShows}`,
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
                text: `*HubSpot draft tasks created* — go to HubSpot → Tasks (filter by type: Email) to review and click Send.\n\n*To flip live:* POST \`/no-show-recovery-agent\` with \`{"dry_run": false}\`\n*Or update the cron body* from \`"dry_run": true\` → \`"dry_run": false\``,
            },
        });
    }

    if (!dryRun && stats.recipients?.length > 0) {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*Sent To:*\n${stats.recipients.map((r: string) => `• ${r}`).join("\n")}`,
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

        // Parse dry_run flag — defaults to true (safe mode)
        let dryRun = true;
        try {
            const body = await req.json();
            if (body?.dry_run === false) dryRun = false;
        } catch { /* no body — default dry_run:true */ }

        // 1. Get no-show candidates (effective date guard is in the view)
        const { data: candidates, error } = await supabase
            .from("vw_noshow_candidates")
            .select("*")
            .eq("attendance_status", "no_show")
            .is("last_recovery_sent", null);

        if (error) throw error;

        const realCandidates = (candidates || []).filter(
            (c: any) => c.email && !c.email.includes("admin@")
        );

        // 2. Generate messages for up to 5 per run
        const targets = realCandidates.slice(0, 5);
        let recoveries: any[] = [];
        if (targets.length > 0) {
            recoveries = await generateRecoveryMessages(targets);
        }

        let emailsSent = 0;
        let notionTasks = 0;
        let taskDraftsCreated = 0;
        let errors = 0;
        const recipients: string[] = [];

        if (dryRun && hubspotToken && recoveries.length > 0) {
            // 3a. Dry run — create HubSpot task drafts for review
            for (const recovery of recoveries) {
                const { data: contact } = await supabase
                    .from("raw_hubspot_contacts")
                    .select("hubspot_contact_id")
                    .ilike("email", recovery.email)
                    .limit(1)
                    .single();

                let contactId = contact?.hubspot_contact_id;
                if (!contactId) contactId = await lookupContactByEmail(hubspotToken, recovery.email);

                if (contactId) {
                    const taskResult = await createHubSpotTaskDraft(hubspotToken, {
                        contactId,
                        subject: recovery.subject,
                        body: recovery.message,
                        campaignType: "no_show_recovery",
                    });
                    if (taskResult.ok) taskDraftsCreated++;
                    else console.warn(`Task draft failed for ${recovery.email}:`, taskResult.error);
                }
            }
        }

        if (!dryRun) {
            // 3b. Send live — HubSpot emails + Notion follow-ups
            for (const recovery of recoveries) {
                const targetInfo = targets.find(
                    (t: any) => t.email?.toLowerCase() === recovery.email?.toLowerCase()
                );

                if (hubspotToken && senderEmail) {
                    const { data: contact } = await supabase
                        .from("raw_hubspot_contacts")
                        .select("hubspot_contact_id")
                        .ilike("email", recovery.email)
                        .limit(1)
                        .single();

                    let contactId = contact?.hubspot_contact_id;
                    if (!contactId) {
                        contactId = await lookupContactByEmail(hubspotToken, recovery.email);
                    }

                    if (contactId) {
                        const emailResult = await sendHubSpotEmail(hubspotToken, {
                            contactId,
                            contactEmail: recovery.email,
                            senderEmail,
                            subject: recovery.subject,
                            htmlBody: `<p>${recovery.message}</p>`,
                            campaignType: "no_show_recovery",
                        });

                        if (emailResult.ok) {
                            emailsSent++;
                            recipients.push(`${recovery.name || recovery.email} (${recovery.email})`);
                        } else {
                            console.error(`Email failed for ${recovery.email}:`, emailResult.error);
                            errors++;
                        }
                    } else {
                        console.warn(`No HubSpot contact found for ${recovery.email}`);
                        errors++;
                    }
                }

                const meetingDate = targetInfo?.meeting_date || "unknown date";
                const notionResult = await createNotionFollowUp({
                    title: `Follow up: ${recovery.name || recovery.email} no-show (${meetingDate})`,
                    description: `Auto recovery outreach sent.\n\nEmail: "${recovery.subject}"\nMessage: ${recovery.message}\n\nPrior meetings attended: ${targetInfo?.prior_meeting_count ?? 0}\nCheck HubSpot timeline for delivery status.`,
                    dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
                    priority: "Medium",
                    tags: ["outreach", "no-show-recovery", "automated"],
                });

                if (notionResult.ok) notionTasks++;
            }

            // 4. Log to recovery_events (only when actually sending)
            if (recoveries.length > 0) {
                const events = recoveries.map((r: any) => ({
                    attendee_email: r.email,
                    event_type: "no_show_followup",
                    meeting_date: targets.find((t: any) => t.email === r.email)?.meeting_date,
                    metadata: {
                        ai_message: r.message,
                        subject: r.subject,
                        campaign_type: "no_show_recovery",
                        prior_meeting_count: targets.find((t: any) => t.email === r.email)?.prior_meeting_count ?? 0,
                        is_thursday: targets.find((t: any) => t.email === r.email)?.is_thursday,
                    },
                }));
                await supabase.from("recovery_events").insert(events);
            }
        }

        // 5. Slack summary (always — dry run shows previews, live shows recipients)
        await alertSlack({
            totalNoShows: candidates?.length || 0,
            processed: recoveries.length,
            emailsSent,
            notionTasks,
            taskDraftsCreated,
            errors,
            recipients,
            previews: dryRun ? recoveries : [],
        }, dryRun);

        return new Response(
            JSON.stringify({
                ok: true,
                dry_run: dryRun,
                processed: recoveries.length,
                emails_sent: emailsSent,
                notion_tasks: notionTasks,
                candidates_remaining: realCandidates.length - targets.length,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("No-Show Agent Error:", err);
        return new Response(
            JSON.stringify({ ok: false, error: err.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
