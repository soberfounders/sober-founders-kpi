import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
    lookupContactByEmail,
    getContactEmailActivities,
    type InboundEmail,
} from "../_shared/hubspot_email.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function stripCodeFences(text: string) {
    return String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function safeJsonParse<T = any>(value: string): T | null {
    try { return JSON.parse(value) as T; } catch { return null; }
}

/* ------------------------------------------------------------------ */
/*  AI Sentiment Classification                                        */
/* ------------------------------------------------------------------ */

type Sentiment = "positive" | "negative" | "neutral" | "question";

interface ClassifiedReply {
    eventId: string;
    email: string;
    sentiment: Sentiment;
    summary: string;        // one-line summary of what they said
    shouldSuppress: boolean; // true if we should stop all outreach to them
}

async function classifyReplies(
    replies: Array<{ eventId: string; email: string; replyBody: string; replySubject: string }>
): Promise<ClassifiedReply[]> {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey || replies.length === 0) {
        // Fallback: treat all as neutral
        return replies.map(r => ({
            eventId: r.eventId,
            email: r.email,
            sentiment: "neutral" as Sentiment,
            summary: "Could not classify — no AI key",
            shouldSuppress: false,
        }));
    }

    const prompt = [
        "You are analyzing email replies from people who received outreach from 'Sober Founders', a sober entrepreneur community.",
        "We send warm, personal emails to people who missed our meetings or haven't come back.",
        "",
        "Classify each reply as one of:",
        "  positive  — they're interested, grateful, planning to return, asking about the meeting",
        "  negative  — they're not interested, want to unsubscribe, said it's not for them, or reacted badly",
        "  neutral   — brief acknowledgment, auto-reply, 'thanks', no clear intent",
        "  question  — they have a genuine question about the community or meetings",
        "",
        "For each reply, also provide a one-line summary of what they said.",
        "",
        "IMPORTANT: shouldSuppress should be true ONLY for 'negative' replies where the person clearly",
        "does not want further contact. Do not suppress for neutral, question, or positive.",
        "",
        "Replies to classify:",
        JSON.stringify(replies.map(r => ({
            event_id: r.eventId,
            email: r.email,
            subject: r.replySubject,
            body: r.replyBody.slice(0, 500), // truncate for token efficiency
        }))),
        "",
        "Return JSON: { results: [ { event_id: string, email: string, sentiment: string, summary: string, should_suppress: boolean } ] }",
    ].join("\n");

    const model = "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
    });

    if (resp.ok) {
        const json = await resp.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const parsed = safeJsonParse<{ results: any[] }>(stripCodeFences(text));
        if (parsed?.results?.length) {
            return parsed.results.map((r: any) => ({
                eventId: r.event_id,
                email: r.email,
                sentiment: r.sentiment as Sentiment,
                summary: r.summary,
                shouldSuppress: r.should_suppress === true,
            }));
        }
    }

    return replies.map(r => ({
        eventId: r.eventId,
        email: r.email,
        sentiment: "neutral" as Sentiment,
        summary: "AI classification failed — marked neutral",
        shouldSuppress: false,
    }));
}

/* ------------------------------------------------------------------ */
/*  Slack Notification                                                 */
/* ------------------------------------------------------------------ */

async function notifySlack(stats: {
    checked: number;
    repliesFound: number;
    positive: number;
    negative: number;
    neutral: number;
    question: number;
    suppressed: number;
    notionCreated: number;
    highlights: string[];
}): Promise<void> {
    const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
    if (!webhookUrl || stats.repliesFound === 0) return;

    const blocks: any[] = [
        {
            type: "header",
            text: { type: "plain_text", text: "Reply Analyzer — Daily Run", emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: [
                    `*Reply Analysis Summary:*`,
                    `- Outreach records checked: ${stats.checked}`,
                    `- Replies found: ${stats.repliesFound}`,
                    `  ↳ Positive: ${stats.positive} | Negative: ${stats.negative} | Neutral: ${stats.neutral} | Question: ${stats.question}`,
                    stats.suppressed > 0 ? `- Contacts suppressed from future outreach: ${stats.suppressed}` : "",
                    stats.notionCreated > 0 ? `- Notion tasks created (questions needing response): ${stats.notionCreated}` : "",
                ].filter(Boolean).join("\n"),
            },
        },
    ];

    if (stats.highlights.length > 0) {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*Highlights:*\n${stats.highlights.map(h => `• ${h}`).join("\n")}`,
            },
        });
    }

    await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
    });
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

        // 1. Get recent outreach events that don't have a reply classification yet
        //    Look back 14 days — gives contacts time to respond
        const { data: events, error } = await supabase
            .from("recovery_events")
            .select("id, attendee_email, event_type, delivered_at, metadata")
            .not("delivered_at", "is", null)
            .is("reply_sentiment", null)
            .gte("delivered_at", new Date(Date.now() - 14 * 86400000).toISOString())
            .order("delivered_at", { ascending: false });

        if (error) throw error;

        const realEvents = (events || []).filter(
            (e: any) => e.attendee_email && !e.attendee_email.includes("admin@")
        );

        if (realEvents.length === 0) {
            return new Response(
                JSON.stringify({ ok: true, checked: 0, replies_found: 0 }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 2. For each event, check HubSpot for inbound replies after delivery
        const repliesRaw: Array<{
            eventId: string;
            email: string;
            replyBody: string;
            replySubject: string;
            replyTimestamp: string;
        }> = [];

        if (hubspotToken) {
            // Deduplicate by email to avoid multiple HubSpot API calls per contact
            const uniqueEmails = [...new Set(realEvents.map((e: any) => e.attendee_email.toLowerCase()))];

            const contactIdCache: Record<string, string | null> = {};
            for (const email of uniqueEmails.slice(0, 50)) {
                // Look up contact ID (check DB first)
                const { data: contact } = await supabase
                    .from("raw_hubspot_contacts")
                    .select("hubspot_contact_id")
                    .ilike("email", email)
                    .limit(1)
                    .single();

                contactIdCache[email] = contact?.hubspot_contact_id
                    ? String(contact.hubspot_contact_id)
                    : await lookupContactByEmail(hubspotToken, email);
            }

            // Now check each event for replies
            for (const event of realEvents) {
                const emailKey = event.attendee_email.toLowerCase();
                const contactId = contactIdCache[emailKey];
                if (!contactId || !event.delivered_at) continue;

                const inbound: InboundEmail[] = await getContactEmailActivities(
                    hubspotToken,
                    contactId,
                    event.delivered_at
                );

                // Take the first (earliest) reply per event
                if (inbound.length > 0) {
                    const reply = inbound[0];
                    repliesRaw.push({
                        eventId: event.id,
                        email: event.attendee_email,
                        replyBody: reply.body,
                        replySubject: reply.subject,
                        replyTimestamp: reply.timestamp,
                    });
                }
            }
        }

        // 3. AI classify all found replies
        const classified: ClassifiedReply[] = repliesRaw.length > 0
            ? await classifyReplies(repliesRaw)
            : [];

        // 4. Persist results
        let suppressedCount = 0;
        let notionCreated = 0;
        const highlights: string[] = [];

        const sentimentCounts = { positive: 0, negative: 0, neutral: 0, question: 0 };

        for (const result of classified) {
            const raw = repliesRaw.find(r => r.eventId === result.eventId);

            // Update recovery_events with reply data
            await supabase
                .from("recovery_events")
                .update({
                    reply_received_at: raw?.replyTimestamp || new Date().toISOString(),
                    reply_sentiment: result.sentiment,
                    reply_summary: result.summary,
                })
                .eq("id", result.eventId);

            sentimentCounts[result.sentiment] = (sentimentCounts[result.sentiment] || 0) + 1;

            if (result.shouldSuppress) {
                // Add to suppression list — upsert so it's idempotent
                const { error: suppErr } = await supabase
                    .from("contact_outreach_suppression")
                    .upsert({
                        contact_email: result.email.toLowerCase(),
                        reason: "negative_reply",
                        sentiment_summary: result.summary,
                        source_event_id: result.eventId,
                        suppressed_at: new Date().toISOString(),
                    }, { onConflict: "contact_email" });

                if (!suppErr) {
                    suppressedCount++;
                    highlights.push(`Suppressed ${result.email} — "${result.summary}"`);
                }
            }

            if (result.sentiment === "positive") {
                highlights.push(`${result.email} responded positively — "${result.summary}"`);
            }

            if (result.sentiment === "question") {
                // Create a Notion task for manual response
                const { createNotionFollowUp } = await import("../_shared/notion_task.ts");
                const notionResult = await createNotionFollowUp({
                    title: `Reply from ${result.email} — needs a response`,
                    description: `Sentiment: ${result.sentiment}\nSummary: ${result.summary}\n\nOriginal body:\n${raw?.replyBody || "(not captured)"}`,
                    dueDate: new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10), // tomorrow
                    priority: "High",
                    tags: ["reply", "manual-response-needed", "automated"],
                });
                if (notionResult.ok) {
                    notionCreated++;
                    highlights.push(`Question from ${result.email} — Notion task created`);
                }
            }
        }

        // 5. For outreach events with no reply found, mark as 'none' if older than 3 days
        //    so we stop checking them on every run
        const staleEventIds = realEvents
            .filter((e: any) => {
                const daysSince = (Date.now() - new Date(e.delivered_at).getTime()) / 86400000;
                return daysSince > 3 && !repliesRaw.find(r => r.eventId === e.id);
            })
            .map((e: any) => e.id);

        if (staleEventIds.length > 0) {
            await supabase
                .from("recovery_events")
                .update({ reply_sentiment: "none" })
                .in("id", staleEventIds);
        }

        // 6. Slack summary
        await notifySlack({
            checked: realEvents.length,
            repliesFound: repliesRaw.length,
            positive: sentimentCounts.positive,
            negative: sentimentCounts.negative,
            neutral: sentimentCounts.neutral,
            question: sentimentCounts.question,
            suppressed: suppressedCount,
            notionCreated,
            highlights,
        });

        return new Response(
            JSON.stringify({
                ok: true,
                checked: realEvents.length,
                replies_found: repliesRaw.length,
                classified: classified.length,
                suppressed: suppressedCount,
                stale_marked_none: staleEventIds.length,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("Reply Analyzer Error:", err);
        return new Response(
            JSON.stringify({ ok: false, error: err.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
