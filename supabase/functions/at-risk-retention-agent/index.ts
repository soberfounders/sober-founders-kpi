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

// Cron runs Monday (for Tuesday) or Wednesday (for Thursday)
function nextMeetingDay(): "Tuesday" | "Thursday" {
    const dow = new Date().getUTCDay(); // 0=Sun
    return dow === 3 ? "Thursday" : "Tuesday"; // Wednesday run → Thursday; everything else → Tuesday
}

/* ------------------------------------------------------------------ */
/*  Nudge Message Generation (fixed template - no AI)                  */
/* ------------------------------------------------------------------ */

function generateNudgeMessages(candidates: any[]): any[] {
    return candidates.map(c => {
        const firstName = c.firstname || "there";
        // Use primary_group from the updated view, fallback to nextMeetingDay()
        const group = c.primary_group || (nextMeetingDay() === "Thursday" ? "Thursday" : "Tuesday");
        const groupSlug = group === "Thursday" ? "thursday" : "tuesday";
        const calLink = `https://soberfounders.org/${groupSlug}`;

        return {
            email: c.email,
            name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "there",
            subject: "Hope to see you tomorrow",
            message:
                `Hey ${firstName}, I noticed we haven't seen you in a bit and just wanted to invite you back to the Sober Founders mastermind.\n\n` +
                `If you need any links or an easy way to get it in your calendar ${calLink}.\n\n` +
                `Also, if you have any feedback on how we can make it better, that would be super appreciated as well.\n\n` +
                `Hope to see you\n\n` +
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
            text: { type: "plain_text", text: "At-Risk Retention Agent - Queued for Review", emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: [
                    `*Retention Nudge Summary:*`,
                    `- At-Risk Attendees Found: ${stats.totalAtRisk}`,
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
                text: `*Queued nudges awaiting approval:*\n${
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
            nudges = generateNudgeMessages(targets);
        }

        let errors = 0;
        let tasksQueued = 0;

        // Queue all nudges for human approval in the Agency dashboard
        if (nudges.length > 0) {
            for (const nudge of nudges) {
                const targetInfo = targets.find(
                    (t: any) => t.email?.toLowerCase() === nudge.email?.toLowerCase()
                );
                const result = await queueAgentTask({
                    agentRoleName: "Marketing Manager",
                    type: "email",
                    title: `At-risk nudge: ${nudge.name || nudge.email}`,
                    payload: {
                        email: nudge.email,
                        name: nudge.name,
                        subject: nudge.subject,
                        body: nudge.message,
                        campaign_type: "at_risk_nudge",
                        days_since_last: targetInfo?.days_since_last,
                        meetings_60d: targetInfo?.meetings_60d,
                    },
                    reasoning: `${nudge.name || nudge.email} attended ${targetInfo?.meetings_60d || "?"}x in 60 days but has been quiet for ${targetInfo?.days_since_last || "?"}d.`,
                    costEstimateCents: 2,
                });
                if (result.ok) tasksQueued++;
                else if (result.budgetExceeded) { errors++; break; }
                else errors++;
            }

            await alertSlack({
                totalAtRisk: realCandidates.length,
                processed: nudges.length,
                errors,
                previews: nudges,
            });

            return new Response(
                JSON.stringify({
                    ok: errors === 0,
                    mode: "queue",
                    tasks_queued: tasksQueued,
                    errors,
                    processed: nudges.length,
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
        console.error("At-Risk Retention Agent Error:", err);
        return new Response(
            JSON.stringify({ ok: false, mode: "queue", error: err.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
