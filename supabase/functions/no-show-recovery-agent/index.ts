import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

        // HITL enforcement: all outreach MUST go through the Agency approval queue.
        // No direct send mode. dry_run and mode params are ignored.
        // Emails are only sent after explicit human approval in the dashboard.
        try { await req.json(); } catch { /* no body needed */ }

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

        let errors = 0;
        let tasksQueued = 0;

        // Queue all messages for human approval in the Agency dashboard
        if (recoveries.length > 0) {
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

        // No candidates to queue
        return new Response(
            JSON.stringify({
                ok: true,
                mode: "queue",
                tasks_queued: tasksQueued,
                processed: 0,
                candidates_remaining: realCandidates.length,
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
