import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ------------------------------------------------------------------ */
/*  AI Strategy                                                       */
/* ------------------------------------------------------------------ */

function stripCodeFences(text: string) {
    return String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function safeJsonParse<T = any>(value: string): T | null {
    try { return JSON.parse(value) as T; } catch { return null; }
}

async function generateRecoveryMessages(noShows: any[]): Promise<any[]> {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!geminiKey && !openaiKey) {
        return noShows.map(ns => ({ ...ns, message: "No AI keys configured for recovery messaging." }));
    }

    const prompt = [
        "You are the 'Sober Founders' community manager. We noticed some people registered for our group meetings but didn't show up.",
        "Generate a short (2-3 sentences), warm, and non-judgmental recovery email for each person.",
        "Mention that we missed them and hope everything is okay.",
        "Suggest they watch the recording if it was a Thursday Mastermind, or just come to the next one.",
        "",
        "Candidates list:",
        JSON.stringify(noShows.slice(0, 10)),
        "",
        "Return JSON: { recoveries: [ { email: string, message: string, reason: string } ] }",
        "Keep the tone: 'supportive, authentic, sober community vibe'."
    ].join("\n");

    // Simplified AI call for brevity in this agent
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
        return parsed?.recoveries || [];
    }

    return noShows.map(ns => ({ ...ns, message: "Missed you! Hope to see you next time." }));
}

/* ------------------------------------------------------------------ */
/*  Slack Alert                                                       */
/* ------------------------------------------------------------------ */

async function alertSlack(stats: any): Promise<boolean> {
    const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
    if (!webhookUrl) return false;

    const blocks = [
        {
            type: "header",
            text: { type: "plain_text", text: "🕸️ No-Show Recovery Agent Run", emoji: true },
        },
        {
            type: "section",
            text: { type: "mrkdwn", text: `*Recovery Summary:*\n- Total No-Shows (14d): ${stats.totalNoShows}\n- New Recovery Targets: ${stats.newTargets}\n- Priority Messages Generated: ${stats.recoveryCount}` }
        },
    ];

    const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
    });
    return resp.ok;
}

/* ------------------------------------------------------------------ */
/*  Main Handler                                                      */
/* ------------------------------------------------------------------ */

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // 1. Identify candidates who haven't received a recovery email for their missed meeting
        const { data: candidates, error } = await supabase
            .from("vw_noshow_candidates")
            .select("*")
            .eq("attendance_status", "no_show")
            .is("last_recovery_sent", null);

        if (error) throw error;

        // 2. Filter out internal/noise if needed, then process
        const realCandidates = (candidates || []).filter(c => c.email && !c.email.includes("admin@"));

        // 3. Generate messages for top 5 (to avoid batch limits/costs in one run)
        const targets = realCandidates.slice(0, 5);
        let recoveries: any[] = [];
        if (targets.length > 0) {
            recoveries = await generateRecoveryMessages(targets);
        }

        // 4. Log the recovery events
        if (recoveries.length > 0) {
            const events = recoveries.map(r => ({
                attendee_email: r.email,
                event_type: 'no_show_followup',
                meeting_date: targets.find(t => t.email === r.email)?.meeting_date,
                metadata: {
                    ai_message: r.message,
                    vibe: 'warm_recovery'
                }
            }));
            await supabase.from("recovery_events").insert(events);
        }

        // 5. Alert Slack
        await alertSlack({
            totalNoShows: candidates.length,
            newTargets: realCandidates.length,
            recoveryCount: recoveries.length
        });

        return new Response(
            JSON.stringify({
                ok: true,
                processed: recoveries.length,
                candidates_remaining: realCandidates.length - recoveries.length
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
