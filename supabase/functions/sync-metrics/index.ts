import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PATCH, PUT, DELETE',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const mustGetEnv = (name: string) => {
      const val = Deno.env.get(name);
      if (!val) throw new Error(`Missing environment variable: ${name}`);
      return val;
    };

    const supabaseClient = createClient(
      mustGetEnv('SUPABASE_URL'),
      mustGetEnv('SUPABASE_SERVICE_ROLE_KEY')
    )


    const url = new URL(req.url)
    const triggerRefresh = url.searchParams.get('trigger_refresh') === 'true'

    if (triggerRefresh) {
      console.log('sync-metrics refresh trigger received')
    }

    // Default Sync Logic (GET/Trigger)
    const { data: integrations, error: intError } = await supabaseClient
      .from('user_integrations')
      .select(`
        id,
        user_id,
        supported_integrations (slug, name),
        integration_credentials (credential_key, credential_value)
      `)
      .eq('is_active', true)

    if (intError) throw intError

    const results = []

    for (const integration of integrations) {
      const slug = integration.supported_integrations.slug
      const credentials = integration.integration_credentials.reduce((acc: any, curr: any) => {
        acc[curr.credential_key] = curr.credential_value
        return acc
      }, {})

      try {
        let metrics: any[] = []

        if (slug === 'notion') {
          metrics = await syncNotion(credentials, supabaseClient, integration)
        } else if (slug === 'mailchimp') {
          const mailchimpMetrics = await syncMailchimp(credentials)
          metrics = [...mailchimpMetrics]
        }

        results.push({ slug, status: 'success', count: metrics.length })
      } catch (err: any) {
        results.push({ slug, status: 'error', message: err.message })
      }
    }

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function syncNotion(credentials: any, supabase: any, integration: any) {
  const { api_key, database_id } = credentials
  if (!api_key || !database_id) return []

  const res = await fetch(`https://api.notion.com/v1/databases/${database_id}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${api_key}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ page_size: 100 })
  })

  const data = await res.json()
  const pages = data.results || []

  // Upsert into local DB for fast loading
  for (const page of pages) {
    const title = page.properties.Name?.title?.[0]?.plain_text || 'Untitled'
    const status = page.properties.Status?.status?.name || 'To Do'
    const dueDate = page.properties['Due Date']?.date?.start || null

    await supabase.from('notion_todos').upsert({
      notion_page_id: page.id,
      task_title: title,
      status: status,
      due_date: dueDate,
      url: page.url,
      user_id: integration.user_id,
      last_updated_at: new Date().toISOString()
    }, { onConflict: 'notion_page_id' })
  }

  return pages
}

async function syncMailchimp(credentials: any) {
  const { api_key, list_id, server_prefix } = credentials
  if (!api_key || !list_id || !server_prefix) {
    console.error('Missing Mailchimp credentials')
    return []
  }

  const baseUrl = `https://${server_prefix}.api.mailchimp.com/3.0`
  const options = {
    headers: {
      Authorization: `Basic ${btoa(`user:${api_key}`)}`,
      'Content-Type': 'application/json'
    }
  }

  const metrics = []
  const meetingCampaigns: any[] = []

  // 1. Fetch List Stats
  try {
    const listRes = await fetch(`${baseUrl}/lists/${list_id}`, options)
    const listData = await listRes.json()
    if (listData.stats) {
      metrics.push({
        metric_name: 'Mailchimp Subscribers',
        metric_value: listData.stats.member_count,
        metadata: { list_name: listData.name }
      })
    }
  } catch (err) {
    console.error('Error fetching Mailchimp lists:', err)
  }

  // 2. Fetch Recent Campaigns and Filter for Meetings
  try {
    const campaignRes = await fetch(`${baseUrl}/campaigns?status=sent&count=20&sort_field=send_time&sort_dir=DESC`, options)
    const campaignData = await campaignRes.json()

    if (campaignData.campaigns) {
      for (const campaign of campaignData.campaigns) {
        const subject = campaign.settings.subject_line || "";
        const isTuesdayMeeting = subject.includes("Meeting Tuesday");
        const isThursdayMeeting = subject.includes("Everyone Meeting today");

        if (isTuesdayMeeting || isThursdayMeeting) {
          if (campaign.report_summary) {
            metrics.push({
              metric_name: isTuesdayMeeting ? 'Tuesday Meeting Email Opens' : 'Thursday Meeting Email Opens',
              metric_value: campaign.report_summary.open_rate * 100,
              metadata: {
                campaign_id: campaign.id,
                subject_line: subject,
                send_time: campaign.send_time,
                open_count: campaign.report_summary.opens,
                click_count: campaign.report_summary.clicks
              }
            })

            // Fetch openers for correlation
            try {
              const activityRes = await fetch(`${baseUrl}/reports/${campaign.id}/email-activity?count=500`, options);
              const activityData = await activityRes.json();
              const openers = activityData.emails?.filter((e: any) => e.activity.some((a: any) => a.action === 'open')).map((e: any) => e.email_address) || [];

              meetingCampaigns.push({
                type: isTuesdayMeeting ? 'Tuesday' : 'Thursday',
                date: campaign.send_time.split('T')[0],
                openers: openers
              });
            } catch (actErr) {
              console.error(`Error fetching activity for campaign ${campaign.id}:`, actErr);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error fetching Mailchimp campaigns:', err)
  }

  // Keep this helper payload so other modules can correlate meeting-email
  // engagement against HubSpot attendance, without any Zoom dependency.
  if (meetingCampaigns.length > 0) {
    metrics.push({
      metric_name: 'Meeting Campaigns Data',
      metric_value: meetingCampaigns.length,
      metadata: { campaigns: meetingCampaigns }
    })
  }

  return metrics
}
