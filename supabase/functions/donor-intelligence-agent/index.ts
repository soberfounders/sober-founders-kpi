import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ------------------------------------------------------------------ */
/*  AI Implementation (with fallback)                                 */
/* ------------------------------------------------------------------ */

function stripCodeFences(text: string) {
    return String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function safeJsonParse<T = any>(value: string): T | null {
    try { return JSON.parse(value) as T; } catch { return null; }
}

async function callAI(prompt: string): Promise<{ result: any; model: string }> {
    // Try Gemini first
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (geminiKey) {
        const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.25, responseMimeType: "application/json" },
            }),
        });
        if (resp.ok) {
            const json = await resp.json();
            const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("\n").trim() || "";
            const parsed = safeJsonParse(stripCodeFences(text));
            if (parsed) return { result: parsed, model: `${model} (LIVE)` };
        }
    }

    // Fallback to OpenAI
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (openaiKey) {
        const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
            body: JSON.stringify({
                model,
                temperature: 0.25,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: "You are a professional nonprofit donor strategist. Return strict JSON only." },
                    { role: "user", content: prompt },
                ],
            }),
        });
        if (resp.ok) {
            const json = await resp.json();
            const text = String(json?.choices?.[0]?.message?.content || "");
            const parsed = safeJsonParse(stripCodeFences(text));
            if (parsed) return { result: parsed, model: `${model} (LIVE)` };
        }
    }

    return {
        result: {
            summary: "Error: No AI keys configured. Please add GEMINI_API_KEY or OPENAI_API_KEY to secrets.",
            insights: [],
            outreach_templates: [],
        },
        model: "MOCK/ERROR",
    };
}

/* ------------------------------------------------------------------ */
/*  Slack Delivery                                                    */
/* ------------------------------------------------------------------ */

async function sendToSlack(content: any): Promise<boolean> {
    const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
    if (!webhookUrl) return false;

    const sections: any[] = [
        {
            type: "header",
            text: { type: "plain_text", text: "🩸 Donor Intelligence Agent Weekly Report", emoji: true },
        },
        {
            type: "section",
            text: { type: "mrkdwn", text: `*Executive Summary:*\n${content.summary}` },
        },
        { type: "divider" },
    ];

    // Priority Insights
    if (content.insights?.length) {
        sections.push({
            type: "section",
            text: { type: "mrkdwn", text: "*🚨 Donor Health Alerts:*\n" + content.insights.map((i: string) => `\u2022 ${i}`).join("\n") },
        });
    }

    // Top Outreach Priorities
    if (content.outreach_templates?.length) {
        sections.push({ type: "divider" });
        sections.push({
            type: "section",
            text: { type: "mrkdwn", text: "*💡 Strategic Outreach Priorities:*" },
        });

        for (const item of content.outreach_templates.slice(0, 3)) {
            sections.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Target:* ${item.name} (${item.type})\n*Context:* ${item.reason}\n*Suggested Message:*\n> ${item.message}`
                },
            });
        }
    }

    sections.push({
        type: "context",
        elements: [
            { type: "mrkdwn", text: `_Generated by Donor Agent \u2022 v0.1 \u2022 ${new Date().toISOString().slice(0, 16)}_` },
        ],
    });

    const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: sections }),
    });
    return resp.ok;
}

/* ------------------------------------------------------------------ */
/*  Main Handler                                                      */
/* ------------------------------------------------------------------ */

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceRoleKey);

        // 1. Gather Donor Health Intelligence
        const { data: donorHealth, error: dhError } = await supabase
            .from("vw_donor_health")
            .select("*");

        if (dhError) throw dhError;

        const healthStats = {
            total_donors: donorHealth.length,
            active_recurring: donorHealth.filter(r => r.donor_status === 'active_recurring').length,
            lapsed_recurring: donorHealth.filter(r => r.donor_status === 'lapsed_recurring').length,
            at_risk: donorHealth.filter(r => r.donor_status === 'at_risk').length,
            upgrade_candidates: donorHealth.filter(r => r.is_upgrade_candidate).length,
        };

        // 2. Select priority items for AI deep-dive
        const priorityDonors = donorHealth
            .filter(r => r.donor_status === 'lapsed_recurring' || r.donor_status === 'at_risk' || r.is_upgrade_candidate)
            .sort((a, b) => (b.total_lifetime_value || 0) - (a.total_lifetime_value || 0))
            .slice(0, 10);

        // 3. Build AI Prompt
        const prompt = [
            "Analyze these high-priority donor records from Sober Founders nonprofit.",
            "Health stats for the mission:",
            JSON.stringify(healthStats),
            "",
            "Top priority donors needing strategy:",
            JSON.stringify(priorityDonors),
            "",
            "Return a JSON object with:",
            "  - summary: string (2-3 sentences overview of donor pool health)",
            "  - insights: array[string] (top 3 critical donor health alerts)",
            "  - outreach_templates: array of {name, email, type, reason, message}",
            "    (Generate short, ultra-personal Reactivation/Lapsed/Upgrade/Thank you templates for the top 5 donors).",
            "    The tone should be 'sober, authentic, non-corporate'. Reference that they are part of the Sober Founders family.",
            "",
            "Constraints:",
            "- ONLY use info provided in the JSON.",
            "- 'Upgrade' templates are for donors with high HubSpot revenue (>$1M) giving low amounts ($0 or < $100).",
            "- 'Lapsed' or 'Reactivation' is for lapsed recurring or at-risk one-time donors.",
        ].join("\n");

        // 4. Call AI
        const { result: aiResult, model: aiModel } = await callAI(prompt);

        // 5. Send to Slack if not a mock
        let slackOk = false;
        if (aiModel !== "MOCK/ERROR") {
            slackOk = await sendToSlack(aiResult);
        }

        // 6. Log Events to track triggers and prevent spam
        if (aiResult.outreach_templates?.length) {
            const events = aiResult.outreach_templates.map((t: any) => ({
                donor_email: t.email || 'unknown@unknown.com',
                event_type: t.type?.toLowerCase()?.includes('upgrade') ? 'upgrade_opportunity' : 'lapse_alert',
                donor_status: t.type,
                metadata: {
                    template: t.message,
                    reason: t.reason,
                    ai_model: aiModel,
                    donor_name: t.name,
                },
            }));

            // Optional: Filter out already triggered emails in last 30 days
            // For now, insert all
            await supabase.from("donor_events").insert(events);
        }

        return new Response(
            JSON.stringify({
                ok: true,
                model: aiModel,
                health_stats: healthStats,
                slack_delivered: slackOk,
                summary: aiResult.summary,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );

    } catch (err: any) {
        console.error("Donor Intelligence Error:", err);
        return new Response(
            JSON.stringify({ ok: false, error: err.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
});
