import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function mustGetEnv(name: string) {
    const v = Deno.env.get(name);
    if (!v) throw new Error(`Missing required env var: ${name}`);
    return v;
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function mondayOf(d: Date) {
    const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = copy.getUTCDay();
    copy.setUTCDate(copy.getUTCDate() - (day === 0 ? 6 : day - 1));
    return copy;
}

function daysAgo(n: number) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return isoDate(d);
}

function safeDivide(a: number, b: number): number | null {
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
    return a / b;
}

function fmt$(v: number | null) { return v == null ? "n/a" : `$${v.toFixed(2)}`; }
function fmtPct(v: number | null) { return v == null ? "n/a" : `${v.toFixed(1)}%`; }
function fmtN(v: number | null) { return v == null ? "n/a" : String(Math.round(v)); }

function changePct(curr: number, prev: number): string {
    if (!prev || !Number.isFinite(prev)) return "n/a";
    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    const arrow = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
    return `${arrow} ${Math.abs(pct).toFixed(1)}%`;
}

/* ------------------------------------------------------------------ */
/*  Transaction Anomaly Detection                                     */
/* ------------------------------------------------------------------ */

interface TxnAnomaly {
    severity: "high" | "medium";
    label: string;
    detail: string;
}

async function gatherTransactionAnomalies(supabase: any): Promise<TxnAnomaly[]> {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const dayAfter = new Date(yesterday);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
    const yStart = isoDate(yesterday);
    const yEnd = isoDate(dayAfter);

    // Yesterday's transactions
    const { data: txns } = await supabase
        .from("donation_transactions_unified")
        .select("donor_name,donor_email,amount,donated_at,status,is_recurring,campaign_name")
        .gte("donated_at", yStart)
        .lt("donated_at", yEnd);

    const transactions = txns || [];
    const anomalies: TxnAnomaly[] = [];

    // 90-day baseline for amount threshold
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90);

    const { data: historical } = await supabase
        .from("donation_transactions_unified")
        .select("amount,donated_at")
        .gte("donated_at", isoDate(ninetyDaysAgo))
        .lt("donated_at", yStart);

    const hist = historical || [];
    const avgAmount = hist.length > 0
        ? hist.reduce((s: number, r: any) => s + Number(r.amount || 0), 0) / hist.length
        : 0;

    // 1. Large donations (>2x 90-day average)
    const threshold = avgAmount * 2;
    for (const t of transactions) {
        if (Number(t.amount) > threshold && threshold > 0) {
            anomalies.push({
                severity: "high",
                label: "Large donation",
                detail: `${t.donor_name || "Anonymous"} donated $${Number(t.amount).toFixed(2)} (90-day avg: $${avgAmount.toFixed(2)})`,
            });
        }
    }

    // 2. Failed/refunded transactions
    for (const t of transactions) {
        if (t.status && ["failed", "refunded", "cancelled", "declined"].includes(t.status.toLowerCase())) {
            anomalies.push({
                severity: "high",
                label: `Transaction ${t.status}`,
                detail: `${t.donor_name || "Anonymous"} — $${Number(t.amount).toFixed(2)}`,
            });
        }
    }

    // 3. Unusual daily volume (z-score vs 90-day)
    const dailyCounts: Record<string, number> = {};
    for (const r of hist) {
        const day = r.donated_at?.slice(0, 10);
        if (day) dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    }
    const countVals = Object.values(dailyCounts);
    const avgDaily = hist.length / 90;
    const stddev = countVals.length > 1
        ? Math.sqrt(countVals.reduce((s, v) => s + (v - avgDaily) ** 2, 0) / countVals.length)
        : 0;
    if (stddev > 0) {
        const z = (transactions.length - avgDaily) / stddev;
        if (Math.abs(z) >= 2) {
            anomalies.push({
                severity: "medium",
                label: z > 0 ? "Transaction volume spike" : "Transaction volume drop",
                detail: `${transactions.length} txns yesterday vs ${avgDaily.toFixed(1)} daily avg (${z > 0 ? "+" : ""}${z.toFixed(1)}σ)`,
            });
        }
    }

    // 4. Missing recurring donors (after 15th of month)
    if (now.getUTCDate() >= 15) {
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const twoMonthsAgo = new Date(monthStart);
        twoMonthsAgo.setUTCMonth(twoMonthsAgo.getUTCMonth() - 2);

        const { data: recentRecurring } = await supabase
            .from("donation_transactions_unified")
            .select("donor_email,donor_name,amount")
            .eq("is_recurring", true)
            .gte("donated_at", isoDate(twoMonthsAgo))
            .lt("donated_at", isoDate(monthStart));

        const { data: thisMonthRecurring } = await supabase
            .from("donation_transactions_unified")
            .select("donor_email")
            .eq("is_recurring", true)
            .gte("donated_at", isoDate(monthStart));

        const thisMonthEmails = new Set(
            (thisMonthRecurring || []).map((r: any) => r.donor_email?.toLowerCase()),
        );

        const seen = new Set<string>();
        for (const r of recentRecurring || []) {
            const email = r.donor_email?.toLowerCase();
            if (!email || seen.has(email) || thisMonthEmails.has(email)) continue;
            seen.add(email);
            anomalies.push({
                severity: "medium",
                label: "Missing recurring donation",
                detail: `${r.donor_name || email} usually gives $${Number(r.amount).toFixed(2)}/mo — hasn't this month`,
            });
        }
    }

    return anomalies;
}

/* ------------------------------------------------------------------ */
/*  Trend Intelligence — 8-week rolling stats + goal gap              */
/* ------------------------------------------------------------------ */

async function gatherTrendSnapshot(supabase: any) {
    const { data: rows, error } = await supabase
        .from("vw_kpi_trend")
        .select("kpi_key,kpi_name,funnel_key,week_start,value,z_score,wow_pct,consecutive_declines,goal_value,goal_status,pct_to_goal,rolling_avg_8w,trailing_8w_values")
        .order("week_start", { ascending: false })
        .limit(400);

    if (error || !rows?.length) return { anomalies: [], decliners: [], offTrack: [], goalSummary: null };

    // Deduplicate: keep the latest row per kpi_key + funnel_key
    const latestMap = new Map<string, any>();
    for (const r of rows) {
        const key = `${r.kpi_key}::${r.funnel_key}`;
        if (!latestMap.has(key)) latestMap.set(key, r);
    }
    const latest = Array.from(latestMap.values());

    const anomalies = latest
        .filter(r => r.z_score !== null && Math.abs(Number(r.z_score)) >= 1.5)
        .sort((a, b) => Math.abs(Number(b.z_score)) - Math.abs(Number(a.z_score)))
        .slice(0, 6)
        .map(r => ({
            kpi: r.kpi_name, funnel: r.funnel_key,
            value: Number(r.value), z_score: Number(r.z_score),
            direction: Number(r.z_score) > 0 ? "spike" : "drop",
            wow_pct: r.wow_pct,
        }));

    const decliners = latest
        .filter(r => Number(r.consecutive_declines) >= 2)
        .sort((a, b) => Number(b.consecutive_declines) - Number(a.consecutive_declines))
        .slice(0, 5)
        .map(r => ({
            kpi: r.kpi_name, funnel: r.funnel_key,
            value: Number(r.value), weeks: Number(r.consecutive_declines),
            wow_pct: r.wow_pct, goal_status: r.goal_status,
        }));

    const withGoals = latest.filter(r => r.goal_status !== "no_goal");
    const offTrack = withGoals
        .filter(r => r.goal_status === "off_track")
        .sort((a, b) => Number(a.pct_to_goal ?? 0) - Number(b.pct_to_goal ?? 0))
        .slice(0, 6)
        .map(r => ({
            kpi: r.kpi_name, funnel: r.funnel_key,
            value: Number(r.value), goal: Number(r.goal_value),
            pct_to_goal: Number(r.pct_to_goal),
        }));

    const onTrack = withGoals.filter(r => r.goal_status === "on_track").length;
    const nearGoal = withGoals.filter(r => r.goal_status === "near_goal").length;

    return {
        anomalies,
        decliners,
        offTrack,
        goalSummary: {
            total_with_goals: withGoals.length,
            on_track: onTrack,
            near_goal: nearGoal,
            off_track: offTrack.length,
            health_pct: withGoals.length > 0 ? Math.round((onTrack / withGoals.length) * 100) : null,
        },
    };
}

/* ------------------------------------------------------------------ */
/*  Data Gathering — queries all KPI tables                           */
/* ------------------------------------------------------------------ */

async function gatherSnapshot(supabase: any) {
    const now = new Date();
    const thisMonday = mondayOf(now);
    const lastMonday = new Date(thisMonday);
    lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);

    const thisWeekStart = isoDate(thisMonday);
    const lastWeekStart = isoDate(lastMonday);
    const thirtyDaysAgo = daysAgo(30);
    const sevenDaysAgo = daysAgo(7);
    const fourteenDaysAgo = daysAgo(14);

    // Parallel queries for performance
    const [
        { data: fbAdsThisWeek },
        { data: fbAdsLastWeek },
        { data: fbAds30d },
        { data: contacts7d },
        { data: contacts14d },
        { data: lumaThisWeek },
        { data: lumaLastWeek },
        { data: activitiesThisWeek },
        { data: activitiesLastWeek },
        { data: notionTodos },
        { data: mailchimpCampaigns },
        { data: kpiMetrics },
    ] = await Promise.all([
        // FB Ads — this week
        supabase.from("raw_fb_ads_insights_daily").select("*")
            .gte("date_day", thisWeekStart),
        // FB Ads — last week
        supabase.from("raw_fb_ads_insights_daily").select("*")
            .gte("date_day", lastWeekStart).lt("date_day", thisWeekStart),
        // FB Ads — 30 day for ad-level ranking
        supabase.from("raw_fb_ads_insights_daily").select("*")
            .gte("date_day", thirtyDaysAgo),
        // HubSpot contacts — last 7 days
        supabase.from("raw_hubspot_contacts").select("hubspot_contact_id,createdate,annual_revenue_in_dollars,membership_s,original_traffic_source,campaign,hs_analytics_source,firstname,lastname")
            .gte("createdate", sevenDaysAgo),
        // HubSpot contacts — 7-14 days ago (prev period)
        supabase.from("raw_hubspot_contacts").select("hubspot_contact_id,createdate,annual_revenue_in_dollars,membership_s,original_traffic_source,campaign,hs_analytics_source")
            .gte("createdate", fourteenDaysAgo).lt("createdate", sevenDaysAgo),
        // Luma — this week
        supabase.from("raw_luma_registrations").select("*")
            .gte("event_date", thisWeekStart),
        // Luma — last week
        supabase.from("raw_luma_registrations").select("*")
            .gte("event_date", lastWeekStart).lt("event_date", thisWeekStart),
        // HubSpot activities (attendance) — this week
        supabase.from("raw_hubspot_meeting_activities").select("hubspot_activity_id,activity_type,title,hs_timestamp")
            .gte("hs_timestamp", thisWeekStart),
        // HubSpot activities — last week
        supabase.from("raw_hubspot_meeting_activities").select("hubspot_activity_id,activity_type,title,hs_timestamp")
            .gte("hs_timestamp", lastWeekStart).lt("hs_timestamp", thisWeekStart),
        // Notion todos
        supabase.from("notion_todos").select("task_title,status,due_date,priority,metadata"),
        // Mailchimp recent campaigns
        supabase.from("mailchimp_campaigns").select("*").order("send_time", { ascending: false }).limit(10),
        // KPI metrics (latest)
        supabase.from("kpi_metrics").select("metric_name,metric_value,metric_date,metadata")
            .gte("metric_date", thirtyDaysAgo).order("metric_date", { ascending: false }),
    ]);

    // --- Aggregate FB Ads ---
    const aggregateAds = (rows: any[]) => {
        if (!rows?.length) return { spend: 0, impressions: 0, clicks: 0, leads: 0, cpl: null, ctr: null };
        const spend = rows.reduce((s, r) => s + Number(r.spend || 0), 0);
        const impressions = rows.reduce((s, r) => s + Number(r.impressions || 0), 0);
        const clicks = rows.reduce((s, r) => s + Number(r.clicks || 0), 0);
        const leads = rows.reduce((s, r) => s + Number(r.leads || 0), 0);
        return {
            spend: Math.round(spend * 100) / 100,
            impressions,
            clicks,
            leads,
            cpl: safeDivide(spend, leads),
            ctr: safeDivide(clicks * 100, impressions),
        };
    };

    const adsThisWeek = aggregateAds(fbAdsThisWeek || []);
    const adsLastWeek = aggregateAds(fbAdsLastWeek || []);

    // --- Ad-level ranking (30d) ---
    const adMap: Record<string, { name: string; spend: number; leads: number; clicks: number; impressions: number }> = {};
    for (const row of (fbAds30d || [])) {
        const key = row.ad_id || row.adset_id || row.campaign_id || "unknown";
        const label = row.ad_name || row.adset_name || row.campaign_name || key;
        if (!adMap[key]) adMap[key] = { name: label, spend: 0, leads: 0, clicks: 0, impressions: 0 };
        adMap[key].spend += Number(row.spend || 0);
        adMap[key].leads += Number(row.leads || 0);
        adMap[key].clicks += Number(row.clicks || 0);
        adMap[key].impressions += Number(row.impressions || 0);
    }
    const adList = Object.values(adMap).filter(a => a.spend > 10);
    const rankedAds = adList
        .map(a => ({ ...a, cpl: safeDivide(a.spend, a.leads), ctr: safeDivide(a.clicks * 100, a.impressions) }))
        .sort((a, b) => (a.cpl ?? 9999) - (b.cpl ?? 9999));
    const topAds = rankedAds.slice(0, 5);
    const bottomAds = [...rankedAds].reverse().slice(0, 5);

    // --- Lead quality distribution ---
    const tierize = (revenue: number | null) => {
        if (revenue == null || revenue <= 0) return "unknown";
        if (revenue >= 1_000_000) return "great";
        if (revenue >= 250_000) return "qualified";
        if (revenue >= 50_000) return "ok";
        return "bad";
    };

    const tierCount = (contacts: any[]) => {
        const tiers: Record<string, number> = { great: 0, qualified: 0, ok: 0, bad: 0, unknown: 0 };
        for (const c of (contacts || [])) tiers[tierize(c.annual_revenue_in_dollars)]++;
        return tiers;
    };

    const tiersThisWeek = tierCount(contacts7d || []);
    const tiersLastWeek = tierCount(contacts14d || []);

    // --- Luma registrations ---
    const lumaThisCount = (lumaThisWeek || []).length;
    const lumaLastCount = (lumaLastWeek || []).length;
    const thursdayRegsThis = (lumaThisWeek || []).filter((r: any) => r.is_thursday).length;
    const thursdayRegsLast = (lumaLastWeek || []).filter((r: any) => r.is_thursday).length;

    // --- Attendance ---
    const callCount = (activities: any[]) => (activities || []).filter((a: any) => a.activity_type === "CALL").length;
    const attendanceThis = callCount(activitiesThisWeek || []);
    const attendanceLast = callCount(activitiesLastWeek || []);

    // --- Notion todos ---
    const openTasks = (notionTodos || []).filter((t: any) => t.status !== "Done" && t.status !== "Completed");
    const overdueTasks = openTasks.filter((t: any) => t.due_date && new Date(t.due_date) < new Date());
    const highPriorityOpen = openTasks.filter((t: any) => t.priority === "High Priority");

    // --- Mailchimp ---
    const latestCampaign = (mailchimpCampaigns || [])[0];

    // --- New leads for meeting prep ---
    const newLeads = (contacts7d || []).map((c: any) => ({
        name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "Unknown",
        tier: tierize(c.annual_revenue_in_dollars),
        revenue: c.annual_revenue_in_dollars,
        source: c.original_traffic_source || c.hs_analytics_source || "unknown",
        created: c.createdate,
    }));

    // Gather trend intelligence in parallel with the main snapshot
    const trends = await gatherTrendSnapshot(supabase);

    return {
        dateRange: { start: thisWeekStart, end: isoDate(now) },
        prevRange: { start: lastWeekStart, end: thisWeekStart },
        ads: {
            thisWeek: adsThisWeek,
            lastWeek: adsLastWeek,
            spendChange: changePct(adsThisWeek.spend, adsLastWeek.spend),
            cplChange: changePct(adsThisWeek.cpl ?? 0, adsLastWeek.cpl ?? 0),
            topAds: topAds.map(a => ({ name: a.name, spend: fmt$(a.spend), cpl: fmt$(a.cpl), ctr: fmtPct(a.ctr), leads: a.leads })),
            bottomAds: bottomAds.map(a => ({ name: a.name, spend: fmt$(a.spend), cpl: fmt$(a.cpl), ctr: fmtPct(a.ctr), leads: a.leads })),
        },
        leads: {
            newThisWeek: (contacts7d || []).length,
            newLastWeek: (contacts14d || []).length,
            change: changePct((contacts7d || []).length, (contacts14d || []).length),
            tiersThisWeek,
            tiersLastWeek,
            greatLeadRate: fmtPct(safeDivide(tiersThisWeek.great * 100, (contacts7d || []).length)),
            qualifiedLeadRate: fmtPct(safeDivide((tiersThisWeek.great + tiersThisWeek.qualified) * 100, (contacts7d || []).length)),
            newLeads,
        },
        registrations: {
            thisWeek: lumaThisCount,
            lastWeek: lumaLastCount,
            change: changePct(lumaThisCount, lumaLastCount),
            thursdayThis: thursdayRegsThis,
            thursdayLast: thursdayRegsLast,
        },
        attendance: {
            sessionsThisWeek: attendanceThis,
            sessionsLastWeek: attendanceLast,
            change: changePct(attendanceThis, attendanceLast),
        },
        tasks: {
            totalOpen: openTasks.length,
            overdue: overdueTasks.length,
            highPriority: highPriorityOpen.length,
            overdueList: overdueTasks.slice(0, 5).map((t: any) => ({ title: t.task_title, due: t.due_date })),
        },
        email: latestCampaign ? {
            lastCampaign: latestCampaign.subject_line,
            openRate: fmtPct(latestCampaign.human_open_rate ? Number(latestCampaign.human_open_rate) * 100 : null),
            ctr: fmtPct(latestCampaign.ctr ? Number(latestCampaign.ctr) * 100 : null),
        } : null,
        trends,
    };
}

/* ------------------------------------------------------------------ */
/*  Prompt builders                                                   */
/* ------------------------------------------------------------------ */

function buildWeeklyStrategyPrompt(snapshot: any): string {
    return [
        "You are the AI Chief of Staff for Sober Founders, a nonprofit that helps sober entrepreneurs build better businesses.",
        "Generate a Monday morning executive briefing based on this week's data snapshot.",
        "",
        "Return ONLY valid JSON with this schema:",
        JSON.stringify({
            title: "Weekly Strategy Briefing — [date range]",
            summary: "2-4 sentence executive summary of the week's performance and what it means.",
            sections: [
                { heading: "Section title", bullets: ["Key points for this section"] },
            ],
            action_items: [
                { text: "Specific action to take", priority: "high|medium|low", assignee: "Andrew Lassise|Kandace|AI" },
            ],
            anomalies: ["Any metrics that deviated significantly from normal"],
            confidence: 0.0,
        }),
        "",
        "Required sections:",
        "1. 📊 Performance Overview — How did spend, leads, CPL, and attendance change vs last week?",
        "2. 🎯 Lead Quality — What's the Great/Qualified lead rate? How does it compare?",
        "3. 📣 Ad Performance — Which ads are winning/losing? Any fatigue signals?",
        "4. 🗓️ Attendance & Registrations — Show-up trends, Tuesday vs Thursday",
        "5. ✅ Open Items — Overdue tasks, high-priority items needing attention",
        "6. 📉 Trend Alerts — Statistical anomalies (z-score ≥ 1.5), consecutive weekly declines (≥ 2 weeks), and KPIs critically off-goal (>15% below target). Flag each with 🚨 (z-score anomaly), 📉 (consecutive decline), or 🔴 (off-track vs goal).",
        "7. 🔮 This Week's Focus — Top 3 priorities based on the trend alerts and performance data",
        "",
        "Rules:",
        "- Be specific. Reference actual numbers, ad names, and trends.",
        "- TREND ALERTS are your highest-priority section. If a metric has been declining 3+ weeks, this is a CRITICAL signal.",
        "- Z-score anomalies indicate statistically unusual deviations (≥1.5σ from 8-week mean).",
        "- Action items must be assignable with clear next steps.",
        "- If data is sparse, acknowledge the limitation.",
        "",
        "DATA SNAPSHOT:",
        JSON.stringify(snapshot),
    ].join("\n");
}

function buildMeetingPrepPrompt(snapshot: any, meetingDay: string): string {
    return [
        `You are the AI Chief of Staff for Sober Founders preparing a briefing for the ${meetingDay} Mastermind session.`,
        "Generate discussion prep material that helps the facilitator run an effective session.",
        "",
        "Return ONLY valid JSON with this schema:",
        JSON.stringify({
            title: `${meetingDay} Meeting Prep — [date]`,
            summary: "2-3 sentence overview of what to expect in today's session.",
            sections: [
                { heading: "Section title", bullets: ["Key talking points"] },
            ],
            action_items: [
                { text: "Follow-up action", priority: "high|medium|low", assignee: "Andrew Lassise|Kandace|AI" },
            ],
            predicted_attendance: 0,
            confidence: 0.0,
        }),
        "",
        "Required sections:",
        "1. 👋 New Leads This Week — List new leads with name, revenue tier, and source",
        "2. 📊 Quick Numbers — Key metrics since last session (leads, spend, registrations)",
        "3. 📉 Trend Watch — Any KPI with ≥2 consecutive declines or z-score anomaly that the group should know about",
        "4. 🗣️ Suggested Discussion Topics — Based on what's changing in the data",
        "5. ⚡ Open Action Items — Any overdue or urgent tasks from Notion",
        "6. 🔮 Predicted Attendance — Estimate based on registrations and historical show-up rates",
        "",
        "Rules:",
        "- Keep it scannable. The facilitator will reference this during the meeting.",
        "- Include specific lead names and tiers in the New Leads section.",
        "- Predicted attendance should factor in registration count and historical rates.",
        "- Discussion topics should be data-driven, not generic.",
        "- Trend Watch section: use trends.decliners and trends.anomalies from the snapshot.",
        "",
        "DATA SNAPSHOT:",
        JSON.stringify(snapshot),
    ].join("\n");
}

function buildBudgetAllocationPrompt(snapshot: any): string {
    return [
        "You are an AI Meta Ads Budget Optimizer for Sober Founders.",
        "Analyze the ad performance data and generate specific budget reallocation recommendations.",
        "",
        "Return ONLY valid JSON with this schema:",
        JSON.stringify({
            title: "Budget Allocation Recommendations — [date range]",
            summary: "2-4 sentence summary of the current spend efficiency and recommended changes.",
            sections: [
                { heading: "Section title", bullets: ["Analysis points"] },
            ],
            action_items: [
                { text: "Move $X from [source] to [target]", priority: "high|medium|low", assignee: "Andrew Lassise" },
            ],
            projected_impact: "Expected outcome if recommendations are followed",
            confidence: 0.0,
        }),
        "",
        "Required sections:",
        "1. 💰 Current Spend Analysis — Where is money going and what's the ROI?",
        "2. 🏆 Top Performers — Ads with best CPL/CPQL that deserve more budget",
        "3. 🚨 Underperformers — Ads that should be paused or reduced",
        "4. 🔄 Reallocation Plan — Specific dollar amounts to move from X to Y",
        "5. ⚠️ Fatigue Signals — Ads showing declining CTR or rising CPL trends",
        "6. 🎯 Goal Gap Analysis — Which cost KPIs are off-target vs our CPL/CPQL goals? (from trends.offTrack)",
        "7. 📈 Projected Impact — Model expected Great Lead lift from proposed changes",
        "",
        "Rules:",
        "- CPQL/CPGL matters more than CPL. Rising CPL with stable quality is a warning, not an emergency.",
        "- Give specific dollar amounts in reallocation recommendations.",
        "- Model the projected impact: 'Moving $X should yield ~N additional qualified leads based on the winner's CPL of $Y.'",
        "- Flag ads where CTR has dropped > 15% as potential creative fatigue.",
        "- If an ad with high CPL has good downstream quality signals, note this explicitly.",
        "- In Goal Gap Analysis, reference the specific target values from trends.offTrack (e.g., 'CPL goal is $50, current is $72').",
        "",
        "DATA SNAPSHOT:",
        JSON.stringify(snapshot),
    ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  AI Call (Gemini or OpenAI with fallback)                          */
/* ------------------------------------------------------------------ */

function stripCodeFences(text: string) {
    return String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function safeJsonParse<T = any>(value: string): T | null {
    try { return JSON.parse(value) as T; } catch { return null; }
}

async function callAI(prompt: string): Promise<{ result: any; model: string; is_mock: boolean }> {
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
            if (parsed) return { result: parsed, model: `${model} (LIVE)`, is_mock: false };
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
                    { role: "system", content: "You are a nonprofit AI strategist. Return strict JSON only." },
                    { role: "user", content: prompt },
                ],
            }),
        });
        if (resp.ok) {
            const json = await resp.json();
            const text = String(json?.choices?.[0]?.message?.content || "");
            const parsed = safeJsonParse(stripCodeFences(text));
            if (parsed) return { result: parsed, model: `${model} (LIVE)`, is_mock: false };
        }
    }

    // No AI key available — return mock
    return {
        result: {
            title: "AI Briefing (Mock)",
            summary: "No AI API keys configured. Set GEMINI_API_KEY or OPENAI_API_KEY in Supabase Edge Function Secrets to enable live AI analysis.",
            sections: [{ heading: "Configuration Required", bullets: ["Add GEMINI_API_KEY or OPENAI_API_KEY to your Supabase Edge Function Secrets"] }],
            action_items: [{ text: "Configure AI API keys in Supabase", priority: "high", assignee: "Andrew Lassise" }],
            confidence: 0,
        },
        model: "none (MOCK)",
        is_mock: true,
    };
}

/* ------------------------------------------------------------------ */
/*  Slack Delivery                                                    */
/* ------------------------------------------------------------------ */

async function sendToSlack(briefing: any, txnAnomalies: TxnAnomaly[] = []): Promise<boolean> {
    const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
    if (!webhookUrl) {
        console.log("SLACK_WEBHOOK_URL not set — skipping Slack delivery");
        return false;
    }

    const sections: any[] = [];

    // Header
    sections.push({
        type: "header",
        text: { type: "plain_text", text: briefing.title || "AI Briefing", emoji: true },
    });

    // Summary
    sections.push({
        type: "section",
        text: { type: "mrkdwn", text: briefing.summary || "No summary available." },
    });

    sections.push({ type: "divider" });

    // Content sections
    for (const section of (briefing.sections || []).slice(0, 8)) {
        const bullets = (section.bullets || []).map((b: string) => `• ${b}`).join("\n");
        sections.push({
            type: "section",
            text: { type: "mrkdwn", text: `*${section.heading}*\n${bullets}` },
        });
    }

    // Action items
    if (briefing.action_items?.length) {
        sections.push({ type: "divider" });
        const actionList = briefing.action_items
            .map((a: any) => {
                const priorityEmoji = a.priority === "high" ? "🔴" : a.priority === "medium" ? "🟡" : "🟢";
                return `${priorityEmoji} ${a.text}${a.assignee ? ` → _${a.assignee}_` : ""}`;
            })
            .join("\n");
        sections.push({
            type: "section",
            text: { type: "mrkdwn", text: `*Action Items*\n${actionList}` },
        });
    }

    // Transaction anomalies (only if flagged)
    if (txnAnomalies.length > 0) {
        sections.push({ type: "divider" });
        const alerts = txnAnomalies
            .map((a) => {
                const icon = a.severity === "high" ? "🔴" : "🟡";
                return `${icon} *${a.label}:* ${a.detail}`;
            })
            .join("\n");
        sections.push({
            type: "section",
            text: { type: "mrkdwn", text: `*💰 Transaction Alerts*\n${alerts}` },
        });
    }

    // Footer
    sections.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `_Generated by AI Manager • ${new Date().toISOString().slice(0, 16)}_` }],
    });

    try {
        const resp = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blocks: sections }),
        });
        return resp.ok;
    } catch (err) {
        console.error("Slack delivery failed:", err);
        return false;
    }
}

/* ------------------------------------------------------------------ */
/*  Main Handler                                                      */
/* ------------------------------------------------------------------ */

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = mustGetEnv("SUPABASE_URL");
        const serviceRoleKey = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
        const supabase = createClient(supabaseUrl, serviceRoleKey);

        if (req.method !== "POST") {
            return new Response(JSON.stringify({ ok: false, error: "POST only" }), {
                status: 405,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const body = await req.json().catch(() => ({}));
        const mode: string = body.mode || "weekly_strategy";
        const sendSlack: boolean = body.send_slack !== false; // default true

        console.log(`AI Briefing: mode=${mode}, send_slack=${sendSlack}`);

        // 1. Gather data (snapshot + transaction anomalies in parallel)
        const [snapshot, txnAnomalies] = await Promise.all([
            gatherSnapshot(supabase),
            gatherTransactionAnomalies(supabase),
        ]);

        // 2. Build prompt based on mode
        let prompt: string;
        let briefingType: string;

        switch (mode) {
            case "meeting_prep": {
                const dayOfWeek = new Date().getUTCDay();
                const meetingDay = dayOfWeek <= 2 ? "Tuesday" : "Thursday";
                prompt = buildMeetingPrepPrompt(snapshot, body.meeting_day || meetingDay);
                briefingType = "meeting_prep";
                break;
            }
            case "budget_allocation": {
                prompt = buildBudgetAllocationPrompt(snapshot);
                briefingType = "budget_allocation";
                break;
            }
            default: {
                prompt = buildWeeklyStrategyPrompt(snapshot);
                briefingType = "weekly_strategy";
                break;
            }
        }

        // 3. Call AI
        const { result: aiResult, model: aiModel, is_mock } = await callAI(prompt);

        // 4. Normalize response
        const briefing = {
            title: aiResult.title || `AI Briefing (${briefingType})`,
            summary: aiResult.summary || "",
            sections: Array.isArray(aiResult.sections) ? aiResult.sections : [],
            action_items: Array.isArray(aiResult.action_items) ? aiResult.action_items : [],
            confidence: typeof aiResult.confidence === "number" ? aiResult.confidence : null,
            anomalies: Array.isArray(aiResult.anomalies) ? aiResult.anomalies : [],
            predicted_attendance: aiResult.predicted_attendance || null,
            projected_impact: aiResult.projected_impact || null,
        };

        // 5. Deliver to Slack
        const deliveredTo: string[] = ["dashboard"];
        if (sendSlack) {
            const slackOk = await sendToSlack({ ...briefing }, txnAnomalies);
            if (slackOk) deliveredTo.push("slack");
        }

        // 6. Store in database
        const { data: stored, error: storeError } = await supabase.from("ai_briefings").insert({
            briefing_type: briefingType,
            title: briefing.title,
            summary: briefing.summary,
            sections: briefing.sections,
            action_items: briefing.action_items,
            metadata: {
                anomalies: briefing.anomalies,
                transaction_anomalies: txnAnomalies,
                predicted_attendance: briefing.predicted_attendance,
                projected_impact: briefing.projected_impact,
                snapshot_summary: {
                    ads_spend: snapshot.ads.thisWeek.spend,
                    ads_leads: snapshot.ads.thisWeek.leads,
                    new_leads: snapshot.leads.newThisWeek,
                    registrations: snapshot.registrations.thisWeek,
                },
                is_mock,
            },
            ai_model: aiModel,
            confidence: briefing.confidence,
            delivered_to: deliveredTo,
        }).select().single();

        if (storeError) {
            console.error("Failed to store briefing:", storeError);
        }

        return new Response(
            JSON.stringify({
                ok: true,
                briefing: { ...briefing, id: stored?.id, briefing_type: briefingType, ai_model: aiModel, is_mock, delivered_to: deliveredTo, created_at: stored?.created_at },
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );

    } catch (error: any) {
        console.error("AI Briefing Error:", error);
        return new Response(
            JSON.stringify({ ok: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
});
