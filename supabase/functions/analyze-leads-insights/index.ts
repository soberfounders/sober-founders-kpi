import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * analyze-leads-insights
 *
 * Accepts a POST body with leads data and returns structured AI analysis.
 * All three AI calls are MOCKED for now — real API integrations are marked
 * with TODO comments below.
 *
 * Also handles a "mode=generate_ad" request to produce ad copy.
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
};

// ---------------------------------------------------------------------------
// Mock AI response builders
// These functions return structured mock responses.
// Replace the body of each with a real API call when ready.
// ---------------------------------------------------------------------------

function buildClaudeResponse(data: any) {
    // TODO: Replace this entire function body with a real Claude API call.
    // Endpoint: https://api.anthropic.com/v1/messages
    // Auth: x-api-key: Deno.env.get("CLAUDE_API_KEY")
    // Model: claude-3-5-sonnet-20241022
    //
    // System prompt to use (as guidance):
    // Analyse the leads funnel data provided. Look for:
    // - Day-of-week registration vs show-up correlation
    // - Lead quality trends over time by campaign
    // - Cost per show-up trajectory
    // - Which lead categories convert to show-ups at highest rates
    // - Anomalies in spend vs lead volume

    const { current, previous, dateLabel } = data;
    const freeLeads = current?.free?.combined?.metaLeads ?? 0;
    const phoenixLeads = current?.phoenix?.metaLeads ?? 0;
    const freeCPL = current?.free?.combined?.cpl ?? null;
    const freeShowUps = current?.free?.combined?.zoomShowUps ?? 0;

    return {
        model: "claude-3-5-sonnet-20241022 (MOCK)",
        summary: `[MOCK] For ${dateLabel}: Free funnel generated ${freeLeads} Meta leads (${freeShowUps} show-ups). Phoenix funnel produced ${phoenixLeads} leads. ${freeCPL !== null ? `Free CPL: $${Number(freeCPL).toFixed(2)}.` : ''} Thursday registrations tracking ahead of Tuesday show-up rates this period.`,
        insights: [
            "Thursday registrants who register ≥4 days before the event show 2.4× higher show-up rate than same-day registrants.",
            "Great Leads (≥$1M revenue) are converting to show-ups at 61% vs 34% for OK Leads — consider personalized follow-up for top-tier.",
            "Phoenix CPL is trending upward (+12% vs prior period) — recommend testing new audience segment.",
        ],
        confidence: 0.82,
        timestamp: new Date().toISOString(),
        is_mock: true,
    };
}

function buildOpenAIResponse(data: any) {
    // TODO: Replace this entire function body with a real OpenAI API call.
    // Endpoint: https://api.openai.com/v1/chat/completions
    // Auth: Authorization: Bearer Deno.env.get("OPENAI_API_KEY")
    // Model: gpt-4o
    //
    // System prompt should mirror the Claude prompt above.

    const { current, dateLabel } = data;
    const freeRegistrations = current?.free?.thursday?.lumaRegistrations ?? 0;
    const freeShowUps = current?.free?.thursday?.zoomShowUps ?? 0;
    const regToShowRate = freeRegistrations > 0 ? (freeShowUps / freeRegistrations * 100).toFixed(1) : 'N/A';

    return {
        model: "gpt-4o (MOCK)",
        summary: `[MOCK] For ${dateLabel}: Thursday Lu.ma reg-to-show rate is ${regToShowRate}%. Spend efficiency opportunity detected — reallocating 20% of bottom-ad budget to top performer could yield +3–5 additional Great Leads per period.`,
        insights: [
            "Leads generated on Wednesday and Thursday register for Thursday sessions at 1.8× the rate of Monday/Tuesday leads.",
            "Free funnel Tuesday show-ups show higher repeat visit rates, suggesting stronger community stickiness.",
            "Cost per registration rose 8% vs prior period — investigate whether event page copy needs refresh.",
        ],
        confidence: 0.79,
        timestamp: new Date().toISOString(),
        is_mock: true,
    };
}

function buildGeminiResponse(data: any) {
    // TODO: Replace this entire function body with a real Gemini API call.
    // Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent
    // Auth: ?key=Deno.env.get("GEMINI_API_KEY")
    //
    // System prompt should mirror the Claude prompt above.

    const { current, previous, dateLabel } = data;
    const freeSpend = current?.free?.combined?.spend ?? 0;
    const prevSpend = previous?.free?.combined?.spend ?? null;
    const spendChange = prevSpend !== null && prevSpend > 0
        ? ((freeSpend - prevSpend) / prevSpend * 100).toFixed(1)
        : null;

    return {
        model: "gemini-1.5-pro (MOCK)",
        summary: `[MOCK] For ${dateLabel}: Free funnel spend ${spendChange !== null ? `${Number(spendChange) >= 0 ? 'up' : 'down'} ${Math.abs(Number(spendChange))}% vs prior period` : `$${Number(freeSpend).toFixed(0)} total`}. Pattern detected: qualified leads converting 22% faster in weeks with ≥3 ad creatives active.`,
        insights: [
            "Spend vs lead volume anomaly: highest spend day this period produced 40% fewer leads than average — possible audience saturation.",
            "Qualified Lead ($250k–$1M) show-up rate has improved 3 consecutive periods — sustain current targeting.",
            "Tuesday sessions have 15% lower drop-off between registration and attendance vs Thursday — study and replicate.",
        ],
        confidence: 0.77,
        timestamp: new Date().toISOString(),
        is_mock: true,
    };
}

function buildConsensus(claude: any, openai: any, gemini: any) {
    // Identify insight themes that appear in all three models' responses.
    // In production: use semantic similarity / keyword extraction.
    return [
        "Thursday registrant engagement is improving — maintain current follow-up cadence.",
        "Qualified Leads (≥$250k revenue) show disproportionately high show-up conversion.",
        "Reallocating spend from bottom-performing ads to top performers is the fastest path to lower CPGL.",
    ];
}

function buildActionPlan(_data: any) {
    return {
        autonomous_actions: [
            "Build weekly at-risk lead list (no HubSpot activity ≥7 days post-lead)",
            "Flag leads categorized as 'Great' (≥$1M) for priority follow-up sequence",
            "Generate CPL / CPGL trend report and email to team every Monday 8AM",
            "Alert when weekly show-up count drops >25% vs prior week",
        ],
        human_actions: [
            "Review and approve updated ad creative for Phoenix funnel (due this week)",
            "Decide on Thursday vs Tuesday budget split for next 30-day period",
            "Set target Cost Per Registration threshold and activate auto-pause rule",
            "Approve revised Luma event page copy based on highest-converting variant",
        ],
    };
}

function buildMockAdCopy(data: any) {
    // TODO: Replace with real ad generation API call (e.g. OpenAI GPT-4 images + copy).
    // This mock just returns structured ad copy text.
    const freeLeads = data?.current?.free?.combined?.metaLeads ?? 0;

    return {
        headline: "Stop Guessing. Start Growing.",
        primary_text: "Business owners earning $250k–$1M/year — join our free weekly group and learn the exact system used by founders who crossed $1M without burning out. Limited spots available.",
        call_to_action: "Register Free →",
        notes: `[MOCK] Generated based on ${freeLeads} leads this period. Replace with real GPT-4/Claude ad generation call.`,
        is_mock: true,
    };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        if (req.method !== "POST") {
            return new Response(JSON.stringify({ ok: false, error: "POST only" }), {
                status: 405,
                headers: { ...corsHeaders, "content-type": "application/json" },
            });
        }

        const body = await req.json().catch(() => ({}));
        const {
            mode,           // optional: 'generate_ad' | 'analyze' (default)
            dateRange,      // { start, end }
            dateLabel,      // human-readable label string
            currentData,    // { free: { tuesday, thursday, combined }, phoenix }
            previousData,   // same shape | null
        } = body;

        const analysisInput = {
            dateLabel: dateLabel || `${dateRange?.start} → ${dateRange?.end}`,
            current: currentData || {},
            previous: previousData || null,
        };

        if (mode === "generate_ad") {
            return new Response(
                JSON.stringify({ ok: true, ad_copy: buildMockAdCopy(analysisInput), is_mock: true }),
                { headers: { ...corsHeaders, "content-type": "application/json" } },
            );
        }

        // Default: full analysis
        const claude = buildClaudeResponse(analysisInput);
        const openai = buildOpenAIResponse(analysisInput);
        const gemini = buildGeminiResponse(analysisInput);
        const actions = buildActionPlan(analysisInput);

        return new Response(
            JSON.stringify({
                ok: true,
                is_mock: true,
                claude,
                openai,
                gemini,
                consensus: buildConsensus(claude, openai, gemini),
                autonomous_actions: actions.autonomous_actions,
                human_actions: actions.human_actions,
            }),
            { headers: { ...corsHeaders, "content-type": "application/json" } },
        );

    } catch (e: any) {
        console.error("analyze-leads-insights error:", e);
        return new Response(
            JSON.stringify({ ok: false, error: String(e?.message || e) }),
            { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
        );
    }
});
