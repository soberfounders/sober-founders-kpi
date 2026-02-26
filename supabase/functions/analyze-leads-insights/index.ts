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
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PATCH, PUT, DELETE",
};

function stripCodeFences(text: string) {
    return String(text || "")
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
}

function safeJsonParse<T = any>(value: string): T | null {
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function extractGeminiText(respJson: any): string {
    const parts = respJson?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return "";
    return parts.map((p: any) => String(p?.text || "")).join("\n").trim();
}

function extractOpenAIText(respJson: any): string {
    return String(respJson?.choices?.[0]?.message?.content || "").trim();
}

function normalizeGeminiStructuredAnalysis(parsed: any, fallbackText: string) {
    const summary = String(parsed?.summary || fallbackText || "Gemini returned no summary.").trim();
    const insights = Array.isArray(parsed?.insights)
        ? parsed.insights.map((v: any) => String(v)).filter(Boolean).slice(0, 8)
        : [];
    const autonomous_actions = Array.isArray(parsed?.autonomous_actions)
        ? parsed.autonomous_actions.map((v: any) => String(v)).filter(Boolean).slice(0, 8)
        : [];
    const human_actions = Array.isArray(parsed?.human_actions)
        ? parsed.human_actions.map((v: any) => String(v)).filter(Boolean).slice(0, 8)
        : [];
    const confidence = typeof parsed?.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : null;
    return {
        summary,
        insights,
        autonomous_actions,
        human_actions,
        confidence,
    };
}

function normalizeMetaAdGuideResponse(parsed: any, fallbackText: string, sourceDocs: string[]) {
    const ads = Array.isArray(parsed?.ads_to_launch)
        ? parsed.ads_to_launch.slice(0, 5).map((ad: any, idx: number) => ({
            id: String(ad?.id || `ad_${idx + 1}`),
            name: String(ad?.name || `Ad ${idx + 1}`),
            objective: String(ad?.objective || "Generate high-quality leads for free events"),
            angle: String(ad?.angle || ""),
            format: String(ad?.format || "UGC Video (4:5)"),
            hook: String(ad?.hook || ""),
            overlay_text: String(ad?.overlay_text || ""),
            audience_strategy: String(ad?.audience_strategy || "Broad targeting + creative-led filtering"),
            headlines: Array.isArray(ad?.headlines) ? ad.headlines.map((v: any) => String(v)).filter(Boolean).slice(0, 6) : [],
            primary_texts: Array.isArray(ad?.primary_texts) ? ad.primary_texts.map((v: any) => String(v)).filter(Boolean).slice(0, 6) : [],
            cta: String(ad?.cta || "Learn More"),
            qualification_notes: String(ad?.qualification_notes || ""),
            landing_page_notes: String(ad?.landing_page_notes || ""),
            test_hypothesis: String(ad?.test_hypothesis || ""),
            success_metric_focus: Array.isArray(ad?.success_metric_focus)
                ? ad.success_metric_focus.map((v: any) => String(v)).filter(Boolean).slice(0, 6)
                : [],
        }))
        : [];

    const tests = Array.isArray(parsed?.tests_to_run)
        ? parsed.tests_to_run.slice(0, 10).map((t: any) => ({
            name: String(t?.name || "Test"),
            hypothesis: String(t?.hypothesis || ""),
            variable: String(t?.variable || ""),
            control: String(t?.control || ""),
            variant: String(t?.variant || ""),
            success_metric: String(t?.success_metric || "CPQL / CPGL"),
            kill_rule: String(t?.kill_rule || ""),
            scale_rule: String(t?.scale_rule || ""),
        }))
        : [];

    const weekPlan = Array.isArray(parsed?.next_7_day_execution_plan)
        ? parsed.next_7_day_execution_plan.map((v: any) => String(v)).filter(Boolean).slice(0, 12)
        : [];
    const guardrails = Array.isArray(parsed?.guardrails)
        ? parsed.guardrails.map((v: any) => String(v)).filter(Boolean).slice(0, 10)
        : [];
    const observations = Array.isArray(parsed?.performance_read)
        ? parsed.performance_read.map((v: any) => String(v)).filter(Boolean).slice(0, 8)
        : [];
    const confidence = typeof parsed?.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : null;

    return {
        summary: String(parsed?.summary || fallbackText || "Generated Meta ad guide."),
        status: String(parsed?.status || "info"),
        performance_read: observations,
        strategic_direction: Array.isArray(parsed?.strategic_direction)
            ? parsed.strategic_direction.map((v: any) => String(v)).filter(Boolean).slice(0, 8)
            : [],
        ads_to_launch: ads,
        tests_to_run: tests,
        budget_plan: Array.isArray(parsed?.budget_plan)
            ? parsed.budget_plan.map((v: any) => String(v)).filter(Boolean).slice(0, 8)
            : [],
        qualification_signal_hygiene: Array.isArray(parsed?.qualification_signal_hygiene)
            ? parsed.qualification_signal_hygiene.map((v: any) => String(v)).filter(Boolean).slice(0, 8)
            : [],
        next_7_day_execution_plan: weekPlan,
        guardrails,
        confidence: confidence ?? 0.7,
        source_docs: sourceDocs,
    };
}

function buildMetaAdGuideExportText(plan: any) {
    const lines: string[] = [];
    lines.push("META ADS EXPERT AI GUIDE (ON DEMAND)");
    if (plan?.summary) lines.push(`Summary: ${plan.summary}`);
    if (Array.isArray(plan?.strategic_direction) && plan.strategic_direction.length) {
        lines.push("");
        lines.push("Strategic Direction:");
        for (const item of plan.strategic_direction) lines.push(`- ${item}`);
    }
    if (Array.isArray(plan?.performance_read) && plan.performance_read.length) {
        lines.push("");
        lines.push("What The Data Says:");
        for (const item of plan.performance_read) lines.push(`- ${item}`);
    }
    if (Array.isArray(plan?.ads_to_launch) && plan.ads_to_launch.length) {
        lines.push("");
        lines.push("Next Ads To Launch:");
        for (const ad of plan.ads_to_launch) {
            lines.push(`- ${ad.name} (${ad.format})`);
            if (ad.angle) lines.push(`  Angle: ${ad.angle}`);
            if (ad.hook) lines.push(`  Hook: ${ad.hook}`);
            if (ad.overlay_text) lines.push(`  Overlay: ${ad.overlay_text}`);
            if (ad.audience_strategy) lines.push(`  Audience: ${ad.audience_strategy}`);
            if (Array.isArray(ad.headlines) && ad.headlines.length) {
                lines.push(`  Headlines: ${ad.headlines.join(" | ")}`);
            }
            if (Array.isArray(ad.primary_texts) && ad.primary_texts.length) {
                lines.push("  Primary Text Variants:");
                for (const text of ad.primary_texts) lines.push(`    * ${text}`);
            }
            if (ad.cta) lines.push(`  CTA: ${ad.cta}`);
            if (ad.qualification_notes) lines.push(`  Qualification Notes: ${ad.qualification_notes}`);
            if (ad.test_hypothesis) lines.push(`  Hypothesis: ${ad.test_hypothesis}`);
        }
    }
    if (Array.isArray(plan?.tests_to_run) && plan.tests_to_run.length) {
        lines.push("");
        lines.push("Tests To Run:");
        for (const test of plan.tests_to_run) {
            lines.push(`- ${test.name}: ${test.hypothesis}`);
            if (test.variable) lines.push(`  Variable: ${test.variable}`);
            if (test.control || test.variant) lines.push(`  Control vs Variant: ${test.control} -> ${test.variant}`);
            if (test.success_metric) lines.push(`  Success Metric: ${test.success_metric}`);
            if (test.kill_rule) lines.push(`  Kill Rule: ${test.kill_rule}`);
            if (test.scale_rule) lines.push(`  Scale Rule: ${test.scale_rule}`);
        }
    }
    if (Array.isArray(plan?.next_7_day_execution_plan) && plan.next_7_day_execution_plan.length) {
        lines.push("");
        lines.push("Next 7 Days:");
        plan.next_7_day_execution_plan.forEach((item: string, idx: number) => lines.push(`${idx + 1}. ${item}`));
    }
    if (Array.isArray(plan?.guardrails) && plan.guardrails.length) {
        lines.push("");
        lines.push("Guardrails:");
        for (const item of plan.guardrails) lines.push(`- ${item}`);
    }
    return lines.join("\n");
}

async function callGeminiLeadsAnalysis(data: any) {
    const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
    if (!apiKey) {
        return {
            ...buildGeminiResponse(data),
            summary: "[MOCK/FALLBACK] Gemini secret is not configured on the edge function. Set GEMINI_API_KEY and redeploy to run live Gemini analysis.",
            is_mock: true,
            provider_error: "Missing GEMINI_API_KEY",
        };
    }

    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
    const prompt = [
        "You are a senior Meta ads specialist and funnel analyst for a sober founders community.",
        "Analyze the provided leads funnel snapshot and return ONLY valid JSON (no markdown, no code fences).",
        "Focus on decision quality and actionability.",
        "JSON schema:",
        JSON.stringify({
            summary: "1 short paragraph (2-4 sentences) explaining what the trends mean and whether this is warning vs red-alert.",
            insights: ["3-6 bullet insights grounded in the data (CPL, CPQL, show-up, lead quality, campaign efficiency)"],
            autonomous_actions: ["2-5 actions AI/tools could automate soon (descriptive only)"],
            human_actions: ["3-6 concrete actions a Meta ads specialist should take this week"],
            confidence: 0.0,
        }),
        "Rules:",
        "- Be specific and reference the trend implications, not generic advice.",
        "- Mention when CPL is rising but downstream quality is stable vs deteriorating.",
        "- Prefer recommendations that can be tested in 7 days.",
        "- If sample size is limited for deep-funnel metrics, say so.",
        "",
        "Input:",
        JSON.stringify(data),
    ].join("\n");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const geminiResp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                responseMimeType: "application/json",
            },
        }),
    });

    const geminiJson = await geminiResp.json().catch(() => ({}));
    if (!geminiResp.ok) {
        const errText = geminiJson?.error?.message || JSON.stringify(geminiJson).slice(0, 500);
        throw new Error(`Gemini API ${geminiResp.status}: ${errText}`);
    }

    const rawText = extractGeminiText(geminiJson);
    const parsed = safeJsonParse<any>(stripCodeFences(rawText));
    const normalized = normalizeGeminiStructuredAnalysis(parsed, rawText);

    return {
        model: `${model} (LIVE)`,
        summary: normalized.summary,
        insights: normalized.insights,
        confidence: normalized.confidence ?? 0.7,
        timestamp: new Date().toISOString(),
        is_mock: false,
        autonomous_actions: normalized.autonomous_actions,
        human_actions: normalized.human_actions,
        raw_text_fallback_used: !parsed,
    };
}

async function callOpenAiLeadsAnalysis(data: any, trainingPack: any = null) {
    const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
    if (!apiKey) {
        return {
            ...buildOpenAIResponse(data),
            summary: "[MOCK/FALLBACK] OpenAI secret is not configured on the edge function. Set OPENAI_API_KEY and redeploy to run live OpenAI analysis.",
            is_mock: true,
            provider_error: "Missing OPENAI_API_KEY",
        };
    }

    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    const trainingDocs = Array.isArray(trainingPack?.sourceDocuments)
        ? trainingPack.sourceDocuments.map((v: any) => String(v)).filter(Boolean)
        : [];
    const trainingPayload = trainingPack
        ? {
            source_documents: trainingDocs,
            summary: trainingPack?.summary || null,
            instruction_pack: String(trainingPack?.instructionPack || "").slice(0, 24000),
        }
        : null;
    const prompt = [
        "You are a senior Meta ads specialist and funnel analyst for a sober founders community.",
        "Analyze the leads funnel data and explain where leads are coming from, what appears to make a great member, and how to get more of them efficiently.",
        trainingPayload ? "Use the supplied TRAINING INSTRUCTIONS as the operating framework for best practices and recommendations." : null,
        "Return ONLY valid JSON (no markdown, no code fences).",
        "JSON schema:",
        JSON.stringify({
            summary: "2-4 sentences, executive summary with warning vs red-alert framing.",
            insights: ["3-6 specific observations tied to CPL/CPQL/lead source/show-up/member outcomes"],
            autonomous_actions: ["2-5 actions AI systems could automate (descriptive only)"],
            human_actions: ["3-6 high-leverage human steps to get more great members"],
            confidence: 0.0,
        }),
        "Rules:",
        "- Ground recommendations in the supplied data only.",
        "- Mention source/channel/campaign implications when visible.",
        "- Explain what seems to correlate with great members (quality, source, attendance behavior, timing).",
        "- Prefer 7-day tests and budget allocation decisions over generic advice.",
        "- If deep-funnel sample size is limited, state that explicitly.",
        trainingPayload ? "- Align recommendations with the provided Meta training instructions (creative-led targeting, signal quality, testing cadence, qualification discipline)." : null,
        "",
        trainingPayload ? "TRAINING INSTRUCTIONS:" : null,
        trainingPayload ? JSON.stringify(trainingPayload) : null,
        trainingPayload ? "" : null,
        "Input:",
        JSON.stringify(data),
    ].filter(Boolean).join("\n");

    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "You are a rigorous marketing analytics strategist. Return strict JSON only." },
                { role: "user", content: prompt },
            ],
        }),
    });

    const openaiJson = await openaiResp.json().catch(() => ({}));
    if (!openaiResp.ok) {
        const errText = openaiJson?.error?.message || JSON.stringify(openaiJson).slice(0, 500);
        throw new Error(`OpenAI API ${openaiResp.status}: ${errText}`);
    }

    const rawText = extractOpenAIText(openaiJson);
    const parsed = safeJsonParse<any>(stripCodeFences(rawText));
    const normalized = normalizeGeminiStructuredAnalysis(parsed, rawText || "OpenAI returned no content.");

    return {
        model: `${model} (LIVE)`,
        summary: normalized.summary,
        insights: normalized.insights,
        confidence: normalized.confidence ?? 0.75,
        timestamp: new Date().toISOString(),
        is_mock: false,
        autonomous_actions: normalized.autonomous_actions,
        human_actions: normalized.human_actions,
        raw_text_fallback_used: !parsed,
    };
}

function buildMockMetaAdGuide(data: any, sourceDocs: string[]) {
    const campaignRows = data?.current?.meta_specialist_diagnostics?.campaign_diagnostics?.rows || [];
    const best = [...campaignRows]
        .filter((r: any) => Number.isFinite(Number(r?.cpql_exact_campaign_week)))
        .sort((a: any, b: any) => Number(a.cpql_exact_campaign_week) - Number(b.cpql_exact_campaign_week))[0] || null;
    const bestLabel = best?.campaign_label || "best quality campaign (exact-match subset)";
    return {
        summary: `[MOCK/FALLBACK] Use a creative refresh sprint anchored to ${bestLabel} while holding quality-focused control budgets. Prioritize CPQL/CPGL over CPL and test revenue-first founder hooks with explicit qualification.`,
        status: "warning",
        performance_read: [
            "Use the audited cohort/campaign snapshot to judge quality outcomes before changing spend.",
            "Rising CPL alone is not enough to pause a campaign if CPQL / CPGL remain efficient.",
            "Deep-funnel metrics (GM/IM) may be directional if sample sizes are low.",
        ],
        strategic_direction: [
            "Keep one quality winner as control and launch a 3:2:2 creative test set.",
            "Use broad targeting with creative-led filtering and explicit founder/ICP call-outs.",
            "Add friction/qualification messaging to protect signal quality.",
        ],
        ads_to_launch: [
            {
                id: "ad_1",
                name: "Founder Rant - Revenue First",
                objective: "Qualified leads for free events",
                angle: "Revenue + sobriety + founder identity",
                format: "UGC talking head (4:5)",
                hook: "Why high-performing sober founders outgrow generic entrepreneur groups",
                overlay_text: "For sober founders scaling past $250k+",
                audience_strategy: "Broad, creative-led targeting (30-55, country only)",
                headlines: ["Sober founders, this room is different", "Built a business but decisions still feel heavy?"],
                primary_texts: [
                    "If you are a sober founder building a serious business, you do not need another generic networking group. Join a room built for sober entrepreneurs making real decisions.",
                    "The wrong room can slow your business down. The right room helps you make better decisions faster. If you are a sober founder, check out our free founder group.",
                ],
                cta: "Learn More",
                qualification_notes: "Call out founder status, sobriety, and revenue context in ad + landing page to improve signal quality.",
                landing_page_notes: "Use short qualification survey with revenue + sobriety duration.",
                test_hypothesis: "Revenue-first founder identity hook improves CPQL/CPGL vs generic sobriety messaging.",
                success_metric_focus: ["CPQL", "CPGL", "Great lead rate", "First show-up rate"],
            },
        ],
        tests_to_run: [
            {
                name: "Hook test",
                hypothesis: "Revenue-first hooks outperform generic founder support hooks on CPQL",
                variable: "Hook / overlay",
                control: "Founder accountability hook",
                variant: "Revenue-first founder hook",
                success_metric: "CPQL and CPGL",
                kill_rule: "Pause variant if CPQL is >25% worse after meaningful spend and lead volume",
                scale_rule: "Scale winner <=20% every 48h if CPQL and CPGL hold",
            },
        ],
        budget_plan: [
            "Keep quality winner live as control while testing new creatives.",
            "Allocate test budget to 3:2:2 creative matrix before changing targeting.",
        ],
        qualification_signal_hygiene: [
            "Track and reduce malformed revenue submissions / bad qualification responses.",
            "Keep ad promise aligned with landing page and Luma registration flow.",
        ],
        next_7_day_execution_plan: [
            "Launch 3 creative concepts x 2 headlines x 2 primary texts.",
            "Review 24h, 72h, and 7d using CPL + CPQL + CPGL.",
            "Move winning post ID into scaling campaign if quality holds.",
        ],
        guardrails: [
            "Do not optimize on CPL alone.",
            "Do not change audience + creative + form friction at the same time.",
            "Treat GM/IM as directional when sample size is low.",
        ],
        confidence: 0.55,
        source_docs: sourceDocs,
    };
}

async function callOpenAiMetaAdGuide(data: any, trainingPack: any) {
    const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
    const sourceDocs = Array.isArray(trainingPack?.sourceDocuments)
        ? trainingPack.sourceDocuments.map((v: any) => String(v)).filter(Boolean)
        : [];
    if (!apiKey) {
        const mock = buildMockMetaAdGuide(data, sourceDocs);
        return {
            model: "gpt-4o-mini (MOCK/FALLBACK)",
            ...mock,
            export_text: buildMetaAdGuideExportText(mock),
            is_mock: true,
            provider_error: "Missing OPENAI_API_KEY",
            timestamp: new Date().toISOString(),
        };
    }

    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    const prompt = [
        "You are a senior Meta Ads specialist and creative strategist for Sober Founders.",
        "Use the provided TRAINING INSTRUCTIONS as HARD CONSTRAINTS and the PERFORMANCE SNAPSHOT as the source of truth for current direction.",
        "Attendance/show-up truth comes from HubSpot Calls (not legacy Zoom matching).",
        "Your goal is to generate the next ads and test variants most likely to attract ICP leads and great leads at efficient CPQL/CPGL, while improving downstream member quality over time.",
        "Return ONLY valid JSON (no markdown, no code fences).",
        "JSON schema:",
        JSON.stringify({
            summary: "2-4 sentences with clear interpretation of what current data says and the recommended direction",
            status: "ok|warning|action_required",
            performance_read: ["3-6 data-grounded observations (CPL, CPQL, CPGL, campaign efficiency, signal quality)"],
            strategic_direction: ["3-6 strategic instructions for the next 7-14 days"],
            ads_to_launch: [{
                id: "ad_1",
                name: "Descriptive name",
                objective: "Qualified leads / great leads for free events",
                angle: "Messaging angle",
                format: "UGC 4:5 / static / carousel / etc",
                hook: "First 3 second hook",
                overlay_text: "On-screen text",
                audience_strategy: "Broad / creative-led / exclusions / placements guidance",
                headlines: ["2-6 headlines"],
                primary_texts: ["2-6 primary text variants"],
                cta: "Learn More|Sign Up|Apply Now",
                qualification_notes: "How to protect signal quality",
                landing_page_notes: "Message-match and friction notes",
                test_hypothesis: "What this tests and why",
                success_metric_focus: ["CPQL", "CPGL", "Great lead rate", "First show-up rate"]
            }],
            tests_to_run: [{
                name: "Test name",
                hypothesis: "What you expect",
                variable: "Hook|Format|Headline|Primary text|Landing friction",
                control: "Current control",
                variant: "New variant",
                success_metric: "CPQL/CPGL/etc",
                kill_rule: "When to kill",
                scale_rule: "When/how to scale"
            }],
            budget_plan: ["3-6 bullets"],
            qualification_signal_hygiene: ["3-6 bullets"],
            next_7_day_execution_plan: ["5-10 step-by-step actions"],
            guardrails: ["3-8 things not to do / cautions"],
            confidence: 0.0
        }),
        "Rules:",
        "- Prioritize CPQL / CPGL and qualified/great lead rates over CPL alone.",
        "- If CPL is rising but quality metrics are stable, say it is a warning to monitor, not a red alert.",
        "- If quality metrics are deteriorating, recommend concrete tests and triage steps.",
        "- Use 3:2:2 testing language and creative-led targeting principles where appropriate.",
        "- Explicitly reflect ICP resonance (revenue + sobriety + founder identity) in ad copy.",
        "- Include at least one UGC/talking-head concept and one static or carousel concept.",
        "- Deep-funnel metrics (GM/IM) may be directional; mention sample-size caveats if visible in the snapshot.",
        "- Output copy that is specific enough to run, not just generic suggestions.",
        "",
        "TRAINING INSTRUCTIONS:",
        JSON.stringify({
            source_documents: sourceDocs,
            summary: trainingPack?.summary || null,
            instruction_pack: String(trainingPack?.instructionPack || "").slice(0, 32000),
        }),
        "",
        "PERFORMANCE SNAPSHOT:",
        JSON.stringify(data),
    ].join("\n");

    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature: 0.35,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "You are a rigorous Meta ads creative strategist. Return strict JSON only." },
                { role: "user", content: prompt },
            ],
        }),
    });

    const openaiJson = await openaiResp.json().catch(() => ({}));
    if (!openaiResp.ok) {
        const errText = openaiJson?.error?.message || JSON.stringify(openaiJson).slice(0, 500);
        throw new Error(`OpenAI API ${openaiResp.status}: ${errText}`);
    }

    const rawText = extractOpenAIText(openaiJson);
    const parsed = safeJsonParse<any>(stripCodeFences(rawText));
    const normalized = normalizeMetaAdGuideResponse(parsed, rawText || "OpenAI returned no content.", sourceDocs);

    return {
        model: `${model} (LIVE)`,
        ...normalized,
        export_text: buildMetaAdGuideExportText(normalized),
        timestamp: new Date().toISOString(),
        is_mock: false,
        raw_text_fallback_used: !parsed,
    };
}

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
            trainingPack,   // optional AI guidance/instructions (ad generation + provider analysis)
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

        if (mode === "generate_meta_ad_guide_openai") {
            let guide: any;
            try {
                guide = await callOpenAiMetaAdGuide(analysisInput, trainingPack || {});
            } catch (openaiErr: any) {
                console.error("OpenAI live call failed in generate_meta_ad_guide_openai mode:", openaiErr);
                const fallback = buildMockMetaAdGuide(analysisInput, Array.isArray(trainingPack?.sourceDocuments) ? trainingPack.sourceDocuments : []);
                guide = {
                    model: "gpt-4o-mini (MOCK/FALLBACK)",
                    ...fallback,
                    export_text: buildMetaAdGuideExportText(fallback),
                    provider_error: String(openaiErr?.message || openaiErr),
                    is_mock: true,
                    timestamp: new Date().toISOString(),
                };
            }
            return new Response(
                JSON.stringify({
                    ok: true,
                    provider: "openai",
                    is_mock: !!guide?.is_mock,
                    meta_ad_guide: guide,
                }),
                { headers: { ...corsHeaders, "content-type": "application/json" } },
            );
        }

        if (mode === "analyze_gemini") {
            let gemini: any;
            try {
                gemini = await callGeminiLeadsAnalysis(analysisInput);
            } catch (geminiErr: any) {
                console.error("Gemini live call failed in analyze_gemini mode:", geminiErr);
                gemini = {
                    ...buildGeminiResponse(analysisInput),
                    summary: `[MOCK/FALLBACK] Live Gemini call failed: ${String(geminiErr?.message || geminiErr)}`,
                    provider_error: String(geminiErr?.message || geminiErr),
                    is_mock: true,
                };
            }
            const fallbackActions = buildActionPlan(analysisInput);
            return new Response(
                JSON.stringify({
                    ok: true,
                    provider: "gemini",
                    is_mock: !!gemini?.is_mock,
                    gemini: {
                        model: gemini.model,
                        summary: gemini.summary,
                        insights: gemini.insights,
                        confidence: gemini.confidence,
                        timestamp: gemini.timestamp,
                        is_mock: gemini.is_mock,
                        provider_error: gemini.provider_error || null,
                    },
                    consensus: [],
                    autonomous_actions: (gemini.autonomous_actions?.length ? gemini.autonomous_actions : fallbackActions.autonomous_actions),
                    human_actions: (gemini.human_actions?.length ? gemini.human_actions : fallbackActions.human_actions),
                }),
                { headers: { ...corsHeaders, "content-type": "application/json" } },
            );
        }

        if (mode === "analyze_openai") {
            let openai: any;
            try {
                openai = await callOpenAiLeadsAnalysis(analysisInput, trainingPack || null);
            } catch (openaiErr: any) {
                console.error("OpenAI live call failed in analyze_openai mode:", openaiErr);
                openai = {
                    ...buildOpenAIResponse(analysisInput),
                    summary: `[MOCK/FALLBACK] Live OpenAI call failed: ${String(openaiErr?.message || openaiErr)}`,
                    provider_error: String(openaiErr?.message || openaiErr),
                    is_mock: true,
                };
            }
            const fallbackActions = buildActionPlan(analysisInput);
            return new Response(
                JSON.stringify({
                    ok: true,
                    provider: "openai",
                    is_mock: !!openai?.is_mock,
                    openai: {
                        model: openai.model,
                        summary: openai.summary,
                        insights: openai.insights,
                        confidence: openai.confidence,
                        timestamp: openai.timestamp,
                        is_mock: openai.is_mock,
                        provider_error: openai.provider_error || null,
                    },
                    consensus: [],
                    autonomous_actions: (openai.autonomous_actions?.length ? openai.autonomous_actions : fallbackActions.autonomous_actions),
                    human_actions: (openai.human_actions?.length ? openai.human_actions : fallbackActions.human_actions),
                }),
                { headers: { ...corsHeaders, "content-type": "application/json" } },
            );
        }

        // Default: full analysis
        const claude = buildClaudeResponse(analysisInput);
        let openai: any;
        try {
            openai = await callOpenAiLeadsAnalysis(analysisInput, trainingPack || null);
        } catch (openaiErr: any) {
            console.error("OpenAI live call failed in analyze mode; falling back to mock:", openaiErr);
            openai = {
                ...buildOpenAIResponse(analysisInput),
                summary: `[MOCK/FALLBACK] Live OpenAI call failed: ${String(openaiErr?.message || openaiErr)}`,
                provider_error: String(openaiErr?.message || openaiErr),
                is_mock: true,
            };
        }
        let gemini: any;
        try {
            gemini = await callGeminiLeadsAnalysis(analysisInput);
        } catch (geminiErr: any) {
            console.error("Gemini live call failed in analyze mode; falling back to mock:", geminiErr);
            gemini = {
                ...buildGeminiResponse(analysisInput),
                summary: `[MOCK/FALLBACK] Live Gemini call failed: ${String(geminiErr?.message || geminiErr)}`,
                provider_error: String(geminiErr?.message || geminiErr),
                is_mock: true,
            };
        }
        const actions = buildActionPlan(analysisInput);

        return new Response(
            JSON.stringify({
                ok: true,
                is_mock: true,
                claude,
                openai,
                gemini,
                consensus: buildConsensus(claude, openai, gemini),
                autonomous_actions: gemini?.autonomous_actions?.length ? gemini.autonomous_actions : actions.autonomous_actions,
                human_actions: gemini?.human_actions?.length ? gemini.human_actions : actions.human_actions,
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
