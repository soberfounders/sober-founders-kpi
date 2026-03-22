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
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function calendarUrl(isThursday: boolean): string {
    return isThursday
        ? "https://soberfounders.org/thursday"
        : "https://soberfounders.org/tuesday";
}

function sessionName(isThursday: boolean): string {
    return isThursday ? "Thursday Mastermind" : "Tuesday meeting";
}

/* ------------------------------------------------------------------ */
/*  Recovery Message Generation (fixed template - no AI)               */
/*                                                                    */
/*  prior_meeting_count = 1 -> first-timer who no-showed second visit  */
/*  prior_meeting_count = 2 -> two-timer who no-showed third visit     */
/*  prior_meeting_count >= 3 -> regular (streak-break handles these,   */
/*                              but fallback here just in case)        */
/* ------------------------------------------------------------------ */

function generateRecoveryMessages(noShows: any[]): any[] {
    return noShows.map(ns => {
        const firstName = ns.name?.split(" ")[0] || "there";
        const isThursday: boolean = ns.is_thursday === true;
        const groupSlug = isThursday ? "thursday" : "tuesday";
        const calLink = `https://soberfounders.org/${groupSlug}`;
        const count: number = ns.prior_meeting_count ?? 0;

        if (count === 1) {
            // First-timer who came once - invite them back for next week
            return {
                email: ns.email,
                name: ns.name || "there",
                subject: `See you at the mastermind tomorrow?`,
                message:
                    `Hey ${firstName}, hope you enjoyed the meeting last week and we'll see you again this week. If you need any links go to ${calLink}\n\n` +
                    `Also, if it's not for you, any feedback is really appreciated good or bad.\n\n` +
                    `Hope to see you again!\n\n` +
                    `- Andrew`,
            };
        }

        let opener: string;
        if (count === 2) {
            opener = `noticed you've been to a couple of our meetings but weren't at this one - hope everything's alright!`;
        } else {
            opener = `we haven't seen you at the ${sessionName(isThursday)} in a bit - just wanted to check in.`;
        }

        return {
            email: ns.email,
            name: ns.name || "there",
            subject: `Hey ${firstName}, missed you today`,
            message:
                `Hey ${firstName},\n\n` +
                `${opener}\n\n` +
                `If you need any links or an easy way to get it in your calendar ${calLink}.\n\n` +
                `Also, if it's not for you, any feedback on how we can make it better would be super appreciated.\n\n` +
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
                text: `*Review these in the KPI Dashboard* → Attendance → Outreach Review Queue. Click Send on each one you approve.\n\n*To auto-send all:* POST \`/no-show-recovery-agent\` with \`{"dry_run": false}\``,
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

        // Parse mode: "queue" (default, routes to Agency dashboard) or "direct" (legacy live send)
        let mode = "queue";
        let dryRun = true;
        try {
            const body = await req.json();
            if (body?.mode === "direct") { mode = "direct"; dryRun = false; }
            else if (body?.dry_run === false) { mode = "direct"; dryRun = false; }
            // Default: mode=queue — creates agent_tasks for approval
        } catch { /* no body — default queue mode */ }

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
            recoveries = generateRecoveryMessages(targets);
        }

        let emailsSent = 0;
        let notionTasks = 0;
        let errors = 0;
        const recipients: string[] = [];
        let tasksQueued = 0;

        // Queue mode: create agent_tasks for approval in the Agency dashboard
        if (mode === "queue" && recoveries.length > 0) {
            for (const recovery of recoveries) {
                const targetInfo = targets.find(
                    (t: any) => t.email?.toLowerCase() === recovery.email?.toLowerCase()
                );
                const result = await queueAgentTask({
                    agentRoleName: "Marketing Manager",
                    type: "email",
                    title: `No-show follow-up: ${recovery.name || recovery.email}`,
                    payload: {
                        email: recovery.email,
                        name: recovery.name,
                        subject: recovery.subject,
                        body: recovery.message,
                        campaign_type: "no_show_followup",
                        meeting_date: targetInfo?.meeting_date,
                        prior_meeting_count: targetInfo?.prior_meeting_count ?? 0,
                    },
                    reasoning: `${recovery.name || recovery.email} registered for ${targetInfo?.meeting_date || "a meeting"} but did not attend. Prior meetings: ${targetInfo?.prior_meeting_count ?? 0}.`,
                    costEstimateCents: 2, // ~$0.02 for Resend send
                });
                if (result.ok) tasksQueued++;
                else if (result.budgetExceeded) { errors++; break; }
                else errors++;
            }

            await alertSlack({
                totalNoShows: candidates?.length || 0,
                processed: recoveries.length,
                emailsSent: 0,
                notionTasks: 0,
                errors,
                recipients: [],
                previews: recoveries,
            }, true); // Show as dry-run style preview

            return new Response(
                JSON.stringify({
                    ok: true,
                    mode: "queue",
                    tasks_queued: tasksQueued,
                    processed: recoveries.length,
                    candidates_remaining: realCandidates.length - targets.length,
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Direct mode (legacy): send emails immediately

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
                            htmlBody: recovery.message.split("\n").map((l: string) => l ? `<p>${l}</p>` : "").join(""),
                            campaignType: "no_show_recovery",
                        });

                        if (emailResult.ok) {
                            emailsSent++;
                            recipients.push(`${recovery.name || recovery.email} (${recovery.email})`);
                        } else {
                            console.error(`Email failed for ${recovery.email}:`, emailResult.error);
                            recovery._deliveryError = emailResult.error || "unknown";
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

            // 4. Log to recovery_events (successes AND failures for dashboard health monitoring)
            if (recoveries.length > 0) {
                const events = recoveries.map((r: any) => {
                    const targetInfo = targets.find((t: any) => t.email === r.email);
                    const failed = !recipients.some((rec: string) => rec.includes(r.email));
                    return {
                        attendee_email: r.email,
                        event_type: "no_show_followup",
                        meeting_date: targetInfo?.meeting_date,
                        metadata: {
                            ai_message: r.message,
                            subject: r.subject,
                            campaign_type: "no_show_recovery",
                            prior_meeting_count: targetInfo?.prior_meeting_count ?? 0,
                            is_thursday: targetInfo?.is_thursday,
                            ...(failed ? { delivery_failed: r._deliveryError || "delivery failed" } : {}),
                        },
                    };
                });
                await supabase.from("recovery_events").insert(events);
            }
        }

        // 5. Slack summary (always — dry run shows previews, live shows recipients)
        await alertSlack({
            totalNoShows: candidates?.length || 0,
            processed: recoveries.length,
            emailsSent,
            notionTasks,
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
