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
/*  AI Message Generation                                              */
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
        "Use their first name if available. Keep the tone personal — like a friend checking in, not a marketing email.",
        "",
        "Candidates list:",
        JSON.stringify(noShows.slice(0, 10)),
        "",
        "Return JSON: { recoveries: [ { email: string, name: string, subject: string, message: string, reason: string } ] }",
        "The subject line should feel personal (e.g., 'Hey [Name], missed you today').",
        "Keep the tone: 'supportive, authentic, sober community vibe'."
    ].join("\n");

    if (geminiKey) {
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
    }

    return noShows.map(ns => ({
        email: ns.email,
        name: ns.name || "there",
        subject: `Hey ${ns.name?.split(" ")[0] || "there"}, missed you today`,
        message: `Hey ${ns.name?.split(" ")[0] || "there"}, we noticed you weren't at today's meeting and wanted to check in. Hope everything is okay — we'd love to see you next time!`,
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
            text: { type: "plain_text", text: "No-Show Recovery Agent Run", emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: [
                    `*Recovery Summary:*`,
                    `- Total No-Shows (14d): ${stats.totalNoShows}`,
                    `- New Recovery Targets: ${stats.newTargets}`,
                    `- Emails Sent via HubSpot: ${stats.emailsSent}`,
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
                text: `*Recipients:*\n${stats.recipients.map((r: string) => `• ${r}`).join("\n")}`,
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

        // 1. Identify candidates who haven't received a recovery email
        const { data: candidates, error } = await supabase
            .from("vw_noshow_candidates")
            .select("*")
            .eq("attendance_status", "no_show")
            .is("last_recovery_sent", null);

        if (error) throw error;

        const realCandidates = (candidates || []).filter((c: any) => c.email && !c.email.includes("admin@"));

        // 2. Generate AI messages for top 5
        const targets = realCandidates.slice(0, 5);
        let recoveries: any[] = [];
        if (targets.length > 0) {
            recoveries = await generateRecoveryMessages(targets);
        }

        // 3. Send via HubSpot + create Notion follow-ups
        let emailsSent = 0;
        let notionTasks = 0;
        let errors = 0;
        const recipients: string[] = [];

        for (const recovery of recoveries) {
            const targetInfo = targets.find((t: any) => t.email?.toLowerCase() === recovery.email?.toLowerCase());

            // Send HubSpot email engagement
            if (hubspotToken && senderEmail) {
                // Look up contact ID from local DB first
                const { data: contact } = await supabase
                    .from("raw_hubspot_contacts")
                    .select("hubspot_contact_id")
                    .ilike("email", recovery.email)
                    .limit(1)
                    .single();

                let contactId = contact?.hubspot_contact_id;

                // Fallback: search HubSpot API
                if (!contactId) {
                    contactId = await lookupContactByEmail(hubspotToken, recovery.email);
                }

                if (contactId) {
                    const emailResult = await sendHubSpotEmail(hubspotToken, {
                        contactId,
                        contactEmail: recovery.email,
                        senderEmail,
                        subject: recovery.subject || `Hey ${recovery.name?.split(" ")[0] || "there"}, missed you today`,
                        htmlBody: `<p>${recovery.message}</p>`,
                        campaignType: "no_show_recovery",
                    });

                    if (emailResult.ok) {
                        emailsSent++;
                        recipients.push(`${recovery.name || recovery.email} (${recovery.email})`);
                    } else {
                        console.error(`Email failed for ${recovery.email}:`, emailResult.error);
                        errors++;
                    }
                } else {
                    console.warn(`No HubSpot contact found for ${recovery.email}`);
                    errors++;
                }
            }

            // Create Notion follow-up task
            const meetingDate = targetInfo?.meeting_date || "unknown date";
            const notionResult = await createNotionFollowUp({
                title: `Follow up: ${recovery.name || recovery.email} no-show (${meetingDate})`,
                description: `Auto-generated recovery outreach.\n\nEmail sent: "${recovery.subject || "N/A"}"\nMessage: ${recovery.message}\n\nCheck HubSpot timeline for delivery status.`,
                dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), // 3 days from now
                priority: "Medium",
                tags: ["outreach", "no-show-recovery", "automated"],
            });

            if (notionResult.ok) {
                notionTasks++;
            } else {
                console.warn(`Notion task failed for ${recovery.email}:`, notionResult.error);
            }
        }

        // 4. Log recovery events
        if (recoveries.length > 0) {
            const events = recoveries.map((r: any) => ({
                attendee_email: r.email,
                event_type: "no_show_followup",
                meeting_date: targets.find((t: any) => t.email === r.email)?.meeting_date,
                metadata: {
                    ai_message: r.message,
                    subject: r.subject,
                    campaign_type: "no_show_recovery",
                    vibe: "warm_recovery",
                    hubspot_email_sent: emailsSent > 0,
                    notion_task_created: notionTasks > 0,
                },
            }));
            await supabase.from("recovery_events").insert(events);
        }

        // 5. Alert Slack
        await alertSlack({
            totalNoShows: candidates?.length || 0,
            newTargets: realCandidates.length,
            emailsSent,
            notionTasks,
            errors,
            recipients,
        });

        return new Response(
            JSON.stringify({
                ok: true,
                processed: recoveries.length,
                emails_sent: emailsSent,
                notion_tasks: notionTasks,
                candidates_remaining: realCandidates.length - recoveries.length,
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
