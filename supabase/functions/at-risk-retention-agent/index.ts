import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendHubSpotEmail, lookupContactByEmail } from "../_shared/hubspot_email.ts";
import { createNotionFollowUp } from "../_shared/notion_task.ts";

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

function nextMeetingDay(): string {
    const now = new Date();
    const dow = now.getUTCDay(); // 0=Sun
    // Monday run → Tuesday meeting; Wednesday run → Thursday meeting
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return dow === 1 ? "Tuesday" : dow === 3 ? "Thursday" : "upcoming";
}

/* ------------------------------------------------------------------ */
/*  AI Nudge Generation                                                */
/* ------------------------------------------------------------------ */

async function generateNudgeMessages(candidates: any[]): Promise<any[]> {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) {
        return candidates.map(c => ({
            email: c.email,
            name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "there",
            subject: `Hope to see you tomorrow`,
            message: `Hey ${c.firstname || "there"}, we noticed you haven't been around in a bit. Tomorrow's meeting would be a great time to reconnect — we'd love to see you there!`,
            reason: "fallback_template",
        }));
    }

    const meetingDay = nextMeetingDay();
    const prompt = [
        "You are the 'Sober Founders' community manager writing a personal check-in email.",
        `Tomorrow is ${meetingDay} — our regular group meeting.`,
        "These people have been regulars (attended 2+ times recently) but missed the last meeting.",
        "Write a short (2-3 sentences), warm, personal email for each person.",
        "Make it feel like a friend reaching out, not a system notification.",
        "Don't mention 'attendance tracking' or 'data' — just a genuine 'hope to see you tomorrow'.",
        "Use their first name.",
        "",
        "Candidates:",
        JSON.stringify(candidates.map(c => ({
            email: c.email,
            name: `${c.firstname || ""} ${c.lastname || ""}`.trim(),
            meetings_last_60d: c.meetings_60d,
            days_since_last: c.days_since_last,
        }))),
        "",
        "Return JSON: { nudges: [ { email: string, name: string, subject: string, message: string } ] }",
    ].join("\n");

    const model = "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
        }),
    });

    if (resp.ok) {
        const json = await resp.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const parsed = safeJsonParse(stripCodeFences(text));
        return parsed?.nudges || [];
    }

    return candidates.map(c => ({
        email: c.email,
        name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "there",
        subject: `Hope to see you tomorrow`,
        message: `Hey ${c.firstname || "there"}, just wanted to reach out — we'd love to see you at tomorrow's meeting. It's always better when you're there!`,
        reason: "fallback_template",
    }));
}

/* ------------------------------------------------------------------ */
/*  Slack Alert                                                        */
/* ------------------------------------------------------------------ */

async function alertSlack(stats: any): Promise<boolean> {
    const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
    if (!webhookUrl) return false;

    const blocks = [
        {
            type: "header",
            text: { type: "plain_text", text: "At-Risk Retention Agent Run", emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: [
                    `*Retention Nudge Summary:*`,
                    `- At-Risk Attendees Found: ${stats.totalAtRisk}`,
                    `- Nudge Emails Sent: ${stats.emailsSent}`,
                    `- Notion Follow-ups Created: ${stats.notionTasks}`,
                    stats.errors > 0 ? `- Errors: ${stats.errors}` : "",
                ].filter(Boolean).join("\n"),
            },
        },
    ];

    if (stats.recipients && stats.recipients.length > 0) {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*Nudged:*\n${stats.recipients.map((r: string) => `• ${r}`).join("\n")}`,
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

        // 1. Get at-risk candidates who haven't been nudged recently
        const { data: candidates, error } = await supabase
            .from("vw_at_risk_attendees")
            .select("*")
            .is("last_nudge_sent", null)
            .order("days_since_last", { ascending: false });

        if (error) throw error;

        const realCandidates = (candidates || []).filter((c: any) => c.email && !c.email.includes("admin@"));

        // 2. Generate personalized nudge messages (max 10 per run)
        const targets = realCandidates.slice(0, 10);
        let nudges: any[] = [];
        if (targets.length > 0) {
            nudges = await generateNudgeMessages(targets);
        }

        // 3. Send via HubSpot + create Notion follow-ups
        let emailsSent = 0;
        let notionTasks = 0;
        let errors = 0;
        const recipients: string[] = [];

        for (const nudge of nudges) {
            const targetInfo = targets.find((t: any) => t.email?.toLowerCase() === nudge.email?.toLowerCase());

            // Send HubSpot email
            if (hubspotToken && senderEmail) {
                const { data: contact } = await supabase
                    .from("raw_hubspot_contacts")
                    .select("hubspot_contact_id")
                    .ilike("email", nudge.email)
                    .limit(1)
                    .single();

                let contactId = contact?.hubspot_contact_id;
                if (!contactId) {
                    contactId = await lookupContactByEmail(hubspotToken, nudge.email);
                }

                if (contactId) {
                    const emailResult = await sendHubSpotEmail(hubspotToken, {
                        contactId,
                        contactEmail: nudge.email,
                        senderEmail,
                        subject: nudge.subject || "Hope to see you tomorrow",
                        htmlBody: `<p>${nudge.message}</p>`,
                        campaignType: "at_risk_nudge",
                    });

                    if (emailResult.ok) {
                        emailsSent++;
                        recipients.push(`${nudge.name || nudge.email} (${targetInfo?.days_since_last || "?"}d since last)`);
                    } else {
                        errors++;
                    }
                } else {
                    errors++;
                }
            }

            // Create Notion follow-up
            const meetingDay = nextMeetingDay();
            const notionResult = await createNotionFollowUp({
                title: `Check: did ${nudge.name || nudge.email} attend ${meetingDay}?`,
                description: `At-risk retention nudge sent.\n\nAttendance history: ${targetInfo?.meetings_60d || "?"}x in 60d, last attended ${targetInfo?.days_since_last || "?"}d ago.\n\nEmail: "${nudge.subject}"\nCheck HubSpot timeline for delivery + reply.`,
                dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), // day after meeting
                priority: "High",
                tags: ["outreach", "at-risk-retention", "automated"],
            });

            if (notionResult.ok) notionTasks++;
        }

        // 4. Log recovery events
        if (nudges.length > 0) {
            const events = nudges.map((n: any) => ({
                attendee_email: n.email,
                event_type: "at_risk_nudge",
                meeting_date: targets.find((t: any) => t.email === n.email)?.last_attended,
                metadata: {
                    ai_message: n.message,
                    subject: n.subject,
                    campaign_type: "at_risk_nudge",
                    days_since_last: targets.find((t: any) => t.email === n.email)?.days_since_last,
                    meetings_60d: targets.find((t: any) => t.email === n.email)?.meetings_60d,
                },
            }));
            await supabase.from("recovery_events").insert(events);
        }

        // 5. Slack summary
        await alertSlack({
            totalAtRisk: realCandidates.length,
            emailsSent,
            notionTasks,
            errors,
            recipients,
        });

        return new Response(
            JSON.stringify({
                ok: true,
                processed: nudges.length,
                emails_sent: emailsSent,
                notion_tasks: notionTasks,
                candidates_remaining: realCandidates.length - targets.length,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("At-Risk Retention Agent Error:", err);
        return new Response(
            JSON.stringify({ ok: false, error: err.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
