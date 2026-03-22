import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendHubSpotEmail, lookupContactByEmail } from "../_shared/hubspot_email.ts";
import { createNotionFollowUp } from "../_shared/notion_task.ts";
import { queueAgentTask } from "../_shared/agent_task_queue.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ------------------------------------------------------------------ */
/*  Winback Message Generation (fixed template - no AI)                */
/* ------------------------------------------------------------------ */

function calendarUrl(isThursday: boolean): string {
    return isThursday
        ? "https://soberfounders.org/thursday"
        : "https://soberfounders.org/tuesday";
}

function generateWinbackMessages(candidates: any[]): any[] {
    return candidates.map(c => {
        const firstName = c.firstname || "there";
        const groupSlug = c.is_thursday_attendee ? "thursday" : "tuesday";
        const calLink = `https://soberfounders.org/${groupSlug}`;

        return {
            email: c.email,
            name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "there",
            subject: `Hey ${firstName} - Sober Founders update`,
            message:
                `Hey ${firstName},\n\n` +
                `It was great meeting you at the Sober Founders group! Wanted to reach out because a lot has happened since then and just launched ${calLink} to make it easier to find everything and get it in your calendar with just a click.\n\n` +
                `Also, if it's not for you, any feedback is greatly appreciated!\n\n` +
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
                    dryRun ? `- Review in KPI Dashboard → Outreach Queue` : `- Notion Tasks: ${stats.notionTasks}`,
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
                text: `*Review these in the KPI Dashboard* → Attendance → Outreach Review Queue. Click Send on each one you approve.\n\n*To auto-send all:* POST \`/winback-campaign-agent\` with \`{"dry_run": false}\``,
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
        let mode = "queue";
        let dryRun = true;
        try {
            const body = await req.json();
            if (body?.batch_size) batchSize = Math.min(Number(body.batch_size) || 10, 20);
            if (body?.mode === "direct") { mode = "direct"; dryRun = false; }
            else if (body?.dry_run === false) { mode = "direct"; dryRun = false; }
        } catch { /* default queue mode */ }

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
            winbacks = generateWinbackMessages(targets);
        }

        let emailsSent = 0;
        let notionTasks = 0;
        let errors = 0;
        const recipients: string[] = [];
        let tasksQueued = 0;

        // Queue mode: create agent_tasks for approval in the Agency dashboard
        if (mode === "queue" && winbacks.length > 0) {
            for (const wb of winbacks) {
                const targetInfo = targets.find(
                    (t: any) => t.email?.toLowerCase() === wb.email?.toLowerCase()
                );
                const result = await queueAgentTask({
                    agentRoleName: "Marketing Manager",
                    type: "email",
                    title: `Winback: ${wb.name || wb.email}`,
                    payload: {
                        email: wb.email,
                        name: wb.name,
                        subject: wb.subject,
                        body: wb.message,
                        campaign_type: "winback",
                        days_since_last: targetInfo?.days_since_last,
                        is_thursday_attendee: targetInfo?.is_thursday_attendee,
                    },
                    reasoning: `One-time attendee from ${targetInfo?.first_attended || "unknown date"}, ${targetInfo?.days_since_last || "?"}d ago. Never contacted for winback.`,
                    costEstimateCents: 2,
                });
                if (result.ok) tasksQueued++;
                else if (result.budgetExceeded) { errors++; break; }
                else errors++;
            }

            await alertSlack({
                totalWinback: realCandidates.length,
                processed: winbacks.length,
                emailsSent: 0,
                notionTasks: 0,
                errors,
                remaining: realCandidates.length - targets.length,
                recipients: [],
                previews: winbacks,
            }, true);

            return new Response(
                JSON.stringify({
                    ok: true,
                    mode: "queue",
                    tasks_queued: tasksQueued,
                    processed: winbacks.length,
                    candidates_remaining: realCandidates.length - targets.length,
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Direct mode (legacy): send emails immediately

        if (!dryRun) {
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
                            subject: wb.subject,
                            htmlBody: wb.message.split("\n").map((l: string) => l ? `<p>${l}</p>` : "").join(""),
                            campaignType: "winback",
                        });

                        if (emailResult.ok) {
                            emailsSent++;
                            recipients.push(`${wb.name || wb.email} (${targetInfo?.days_since_last || "?"}d ago)`);
                        } else {
                            wb._deliveryError = emailResult.error || "unknown";
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

            // 4. Log recovery events (successes AND failures for dashboard health monitoring)
            if (winbacks.length > 0) {
                const events = winbacks.map((w: any) => {
                    const targetInfo = targets.find((t: any) => t.email === w.email);
                    return {
                        attendee_email: w.email,
                        event_type: "winback",
                        meeting_date: targetInfo?.first_attended,
                        metadata: {
                            ai_message: w.message,
                            subject: w.subject,
                            campaign_type: "winback",
                            days_since_last: targetInfo?.days_since_last,
                            is_thursday_attendee: targetInfo?.is_thursday_attendee,
                            ...(w._deliveryError ? { delivery_failed: w._deliveryError } : {}),
                        },
                    };
                });
                await supabase.from("recovery_events").insert(events);
            }
        }

        // 5. Slack summary
        await alertSlack({
            totalWinback: realCandidates.length,
            processed: winbacks.length,
            emailsSent,
            notionTasks,
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
