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

async function alertSlack(stats: any): Promise<boolean> {
    const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
    if (!webhookUrl) return false;

    const blocks: any[] = [
        {
            type: "header",
            text: { type: "plain_text", text: "Streak Break Agent - Queued for Review", emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: [
                    `*Streak Break Summary:*`,
                    `- Regulars Who Went Quiet: ${stats.totalCandidates}`,
                    `- Queued for Approval: ${stats.processed}`,
                    `- Review in KPI Dashboard -> Agency -> Action Queue`,
                    stats.errors > 0 ? `- Errors: ${stats.errors}` : "",
                ].filter(Boolean).join("\n"),
            },
        },
    ];

    if (stats.previews?.length > 0) {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*Queued emails awaiting approval:*\n${
                    stats.previews.map((p: any) =>
                        `- *${p.name || p.email}* (${p.email})\n  _Subject:_ ${p.subject}`
                    ).join("\n")
                }`,
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
        // No direct send mode. Emails are only sent after explicit human approval.
        try { await req.json(); } catch { /* no body needed */ }

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

        let errors = 0;
        let tasksQueued = 0;

        // Queue all messages for human approval in the Agency dashboard
        if (messages.length > 0) {
            for (const msg of messages) {
                const targetInfo = targets.find(
                    (t: any) => t.email?.toLowerCase() === msg.email?.toLowerCase()
                );
                const result = await queueAgentTask({
                    agentRoleName: "Marketing Manager",
                    type: "email",
                    title: `Streak break: ${msg.name || msg.email}`,
                    payload: {
                        email: msg.email,
                        name: msg.name,
                        subject: msg.subject,
                        body: msg.message,
                        campaign_type: "streak_break",
                        total_meetings: targetInfo?.total_meetings,
                        days_since_last: targetInfo?.days_since_last,
                    },
                    reasoning: `Regular attendee (${targetInfo?.total_meetings || "?"}x total) has been quiet for ${targetInfo?.days_since_last || "?"}d.`,
                    costEstimateCents: 2,
                });
                if (result.ok) tasksQueued++;
                else if (result.budgetExceeded) { errors++; break; }
                else errors++;
            }

            await alertSlack({
                totalCandidates: realCandidates.length,
                processed: messages.length,
                errors,
                previews: messages,
            });

            return new Response(
                JSON.stringify({
                    ok: errors === 0,
                    mode: "queue",
                    tasks_queued: tasksQueued,
                    errors,
                    processed: messages.length,
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
                tasks_queued: 0,
                processed: 0,
                candidates_remaining: realCandidates.length,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("Streak Break Agent Error:", err);
        return new Response(
            JSON.stringify({ ok: false, mode: "queue", error: err.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
