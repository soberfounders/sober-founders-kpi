import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { queueAgentTask } from "../_shared/agent_task_queue.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ------------------------------------------------------------------ */
/*  Winback Message Generation (fixed template - no AI)                */
/* ------------------------------------------------------------------ */

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

async function alertSlack(stats: any): Promise<boolean> {
    const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
    if (!webhookUrl) return false;

    const blocks: any[] = [
        {
            type: "header",
            text: { type: "plain_text", text: "Winback Campaign Agent - Queued for Review", emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: [
                    `*Winback Summary:*`,
                    `- Total One-and-Done Candidates: ${stats.totalWinback}`,
                    `- Queued for Approval: ${stats.processed}`,
                    `- Remaining in Pipeline: ${stats.remaining}`,
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
                text: `*Queued winback emails awaiting approval:*\n${
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
        let batchSize = 10;
        try {
            const body = await req.json();
            if (body?.batch_size) batchSize = Math.min(Number(body.batch_size) || 10, 20);
        } catch { /* no body needed */ }

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

        let errors = 0;
        let tasksQueued = 0;

        // Queue all winback messages for human approval in the Agency dashboard
        if (winbacks.length > 0) {
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
                errors,
                remaining: realCandidates.length - targets.length,
                previews: winbacks,
            });

            return new Response(
                JSON.stringify({
                    ok: errors === 0,
                    mode: "queue",
                    tasks_queued: tasksQueued,
                    errors,
                    processed: winbacks.length,
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
        console.error("Winback Campaign Agent Error:", err);
        return new Response(
            JSON.stringify({ ok: false, mode: "queue", error: err.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
