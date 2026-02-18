import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const taskPath = req.headers.get('x-pathname') || ''
    const isTaskWriteRequest =
      req.method === 'PATCH' ||
      (req.method === 'POST' && (url.pathname.endsWith('/tasks') || taskPath.endsWith('/tasks')))

    // Handle Notion task writes only when this is an explicit write request.
    // Generic refresh pings should not require a JSON body.
    if (isTaskWriteRequest) {
      let body: any = {}
      if (req.method === 'POST' || req.method === 'PATCH') {
        try {
          body = await req.json()
        } catch (_) {
          throw new Error('Missing JSON body for Notion write request')
        }
      }
      const notionKey = Deno.env.get('NOTION_API_KEY')
      if (!notionKey) throw new Error("Missing NOTION_API_KEY");
      
      if (req.method === 'PATCH' && body.pageId) {
        // Update Notion Page
        const res = await fetch(`https://api.notion.com/v1/pages/${body.pageId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${notionKey}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ properties: body.properties })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(`Notion error: ${JSON.stringify(data)}`);
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      if (req.method === 'POST') {
        // Create Notion Page
        const databaseId = Deno.env.get('NOTION_DATABASE_ID')
        if (!databaseId) throw new Error("Missing NOTION_DATABASE_ID");
        const res = await fetch(`https://api.notion.com/v1/pages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${notionKey}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            parent: { database_id: databaseId },
            properties: body.properties 
          })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(`Notion error: ${JSON.stringify(data)}`);
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

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
          
          // Check if we have Zoom credentials in the credentials list (likely stored separately, but for now we might need to mix)
          // Actually, we should iterate all integrations. If we have both, we correlate.
          // For this specific turn, let's assume we might find Zoom credentials in the same loop if we look for them,
          // OR we iterate linearly.
          // Better approach: Let's fetch all active credentials first, then run logic.
          // But to minimize refactor, I will add a special check for Zoom here or just assume we're running them independently.
          // Wait, the user has Zoom credentials in .env? No, they provided them. I should verify if they are in the DB.
          // The current code fetches from 'user_integrations'. I haven't added Zoom to 'user_integrations' table yet.
          // I will use Deno.env for the Zoom credentials provided in .env for now to test.
          
          const zoomCreds = {
              account_id: Deno.env.get('ZOOM_ACCOUNT_ID'),
              client_id: Deno.env.get('ZOOM_CLIENT_ID'),
              client_secret: Deno.env.get('ZOOM_CLIENT_SECRET')
          }
          
          if (zoomCreds.account_id) {
               // Fetch manual aliases
               const { data: aliases, error: aliasesError } = await supabaseClient.from('attendee_aliases').select('*');
               if (aliasesError) {
                 console.warn('attendee_aliases unavailable; proceeding without aliases', aliasesError.message);
               }
               
               const zoomMetrics = await syncZoom(zoomCreds, metrics, aliases || []);
               metrics = [...metrics, ...zoomMetrics];
               
               // CORRELATION LOGIC
               const campaigns = mailchimpMetrics.find(m => m.metric_name === 'Meeting Campaigns Data')?.metadata?.campaigns || [];
               const meetings = zoomMetrics.filter(m => m.metric_name === 'Zoom Meeting Attendees');
               

               for (const camp of campaigns) {
                   // Find meeting on same date
                   // Campaign Date: YYYY-MM-DD
                   // Meeting Start Time: YYYY-MM-DDTHH:MM:SSZ
                   const match = meetings.find((m: any) => m.metadata.start_time.startsWith(camp.date));
                   
                   if (match) {
                       const openers = camp.openers || [];
                       const attendees = match.metadata.attendees || [];
                       
                       // Find intersection
                       const shownUp = openers.filter((email: string) => attendees.includes(email));
                       
                       metrics.push({
                           metric_name: 'Weekly Show Up Rate',
                           metric_value: openers.length > 0 ? (shownUp.length / openers.length) * 100 : 0,
                           metadata: {
                               date: camp.date,
                               type: camp.type,
                               openers_count: openers.length,
                               attendees_count: attendees.length,
                               show_up_count: shownUp.length
                           }
                       });
                   }
               }
          }
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
  
  // Store meeting campaigns in global scope or pass to Zoom sync (simplified for now by storing in metrics metadata)
  // In a real scenario, we'd probably want to correlate this AFTER getting Zoom data.
  // For this MVP, we'll try to find a matching Zoom meeting for these dates if Zoom creds are present.
  
  if (meetingCampaigns.length > 0) {
      // We attach this data to a special metric to be picked up by the Zoom sync logic if needed,
      // or we handle correlation in a separate step. For simplicity, let's just return what we have.
      // The correlation ideally happens if we have both sets of data. 
      // Let's add a "Correlation Ready" marker.
       metrics.push({
        metric_name: 'Meeting Campaigns Data',
        metric_value: meetingCampaigns.length,
        metadata: { campaigns: meetingCampaigns }
      })
  }

  return metrics
}

async function syncZoom(credentials: any, meetingCampaigns: any[] = [], manualAliases: any[] = []) {
    const { account_id, client_id, client_secret } = credentials;
    if (!account_id || !client_id || !client_secret) return [];

    const metrics = [];

    // 1. Get Access Token
    const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${account_id}`;
    let accessToken = '';
    
    try {
        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${btoa(`${client_id}:${client_secret}`)}`
            }
        });
        const tokenData = await tokenRes.json();
        accessToken = tokenData.access_token;
    } catch (err) {
        console.error('Error getting Zoom token:', err);
        return [];
    }

    if (!accessToken) return [];

    // 2. Fetch Past Meeting Instances for Specific IDs
    const targetMeetings = [
        { id: '84242212480', label: 'Sober Founders Mastermind (Tuesday)' },
        { id: '87199667045', label: 'Sober Founders Mastermind (Thursday)' }
    ];
    
    try {
        for (const target of targetMeetings) {
            const instancesRes = await fetch(`https://api.zoom.us/v2/past_meetings/${target.id}/instances`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (instancesRes.status === 404) {
                 console.log(`Zoom Meeting ID ${target.id} not found or no past instances.`);
                 continue;
            }

            const instancesData = await instancesRes.json();
            const meetings = instancesData.meetings || [];
            
            // Filter for recent meetings (last 10 instances)
            const recentMeetings = meetings.slice(0, 10);

            for (const meeting of recentMeetings) {
                 // UUID needs to be double encoded if it contains / or +
                let uuid = meeting.uuid;
                if (uuid.includes('/') || uuid.includes('+')) {
                    uuid = encodeURIComponent(encodeURIComponent(uuid));
                }

                // Fetch Participants
                const participantsRes = await fetch(`https://api.zoom.us/v2/report/meetings/${uuid}/participants?page_size=300`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const participantsData = await participantsRes.json();
                
                const allParticipants = participantsData.participants || [];
                
                // 1. Fetch Manual Aliases
                // Note: In a real high-perf scenario, we'd fetch this once outside the loop.
                // For now, we'll fetch it here or pass it in. To avoid prop drilling too much refactoring,
                // let's fetch it if we can access supabase client.
                // Actually, syncZoom doesn't have the supabase client passed to it.
                // We need to pass supabase client to syncZoom.
                
                // REFACTOR: We need to change the function signature of syncZoom to accept supabase client.
                // But since we can't easily change the call site without reading index.ts again,
                // let's assume we will update the call site too.
                
                // WAIT: I can just create a lightweight client here OR better yet,
                // let's update index.ts to pass the client.
                
                // Let's assume we have `aliases` map passed in (name -> target).
                // I will add `aliases` as an argument to syncZoom.
               
                // 1. First Pass: Filter bots and Basic Dedupe
                // We build a list of candidate objects
                let candidates: any[] = [];
                const seenEmails = new Set();
                const exclusionKeywords = ['note', 'notetaker', 'fireflies.ai', 'fathom', 'read.ai', 'otter.ai'];

                // Prepare Aliases Map (normalized)
                const aliasMap = new Map();
                if (manualAliases && manualAliases.length > 0) {
                    manualAliases.forEach((a: any) => {
                        aliasMap.set(a.original_name.toLowerCase().trim(), a.target_name.trim());
                    });
                }

                for (const p of allParticipants) {
                    let name = (p.name || "").trim();
                    const email = (p.user_email || "").toLowerCase();
                    let lowerName = name.toLowerCase();

                    // APPLY ALIAS
                    if (aliasMap.has(lowerName)) {
                        name = aliasMap.get(lowerName);
                        lowerName = name.toLowerCase();
                    }

                    // Exclusion
                    if (exclusionKeywords.some(k => lowerName.includes(k))) continue;

                    // Basic Dedupe by Email if present
                    if (email && seenEmails.has(email)) continue;
                    if (email) seenEmails.add(email);

                    candidates.push({ name, email, lowerName });
                }

                // 2. Advanced Dedupe
                // Score Quality: Has Email (2), Normal Name (1), Device Name (0)
                candidates.forEach((p: any) => {
                   p.isDevice = /iphone|ipad|android|galaxy/i.test(p.lowerName);
                   p.score = (p.email ? 2 : 0) + (p.isDevice ? 0 : 1);
                   // Clean name for matching (remove "iPhone", etc)
                   p.cleanName = p.lowerName.replace(/['’]s\s*(iphone|ipad|android|galaxy)/i, '').trim();
                });

                // Sort: Score Desc, then Length Desc
                candidates.sort((a: any, b: any) => {
                    if (b.score !== a.score) return b.score - a.score;
                    return b.name.length - a.name.length;
                });

                const uniqueAttendees: string[] = [];
                const finalCandidates: any[] = [];

                for (const p of candidates) {
                    // Check if this person is redundant
                    const isDuplicate = finalCandidates.some((existing: any) => {
                        // Case A: Exact Email Match (Handled by SeenEmails, but good safety)
                        if (p.email && existing.email === p.email) return true;

                        // Case B: Name Substring Match
                        // If "Emil Bakiyev" (Existing) contains "Emil" (p)
                        if (existing.lowerName.includes(p.lowerName)) return true; 
                        
                        // Case C: Device Match
                        // If p is "Lori's iPhone" (cleaned="lori"), and existing is "Lori Smith"
                        if (p.isDevice && existing.lowerName.includes(p.cleanName)) return true;

                        // Case D: Common First Name + Last Initial
                        // "Lori Smith" starts with "Lori" (if p was "Lori")
                        if (existing.lowerName.startsWith(p.lowerName)) return true;

                        return false;
                    });

                    if (!isDuplicate) {
                        finalCandidates.push(p);
                        uniqueAttendees.push(p.name);
                    }
                }

                metrics.push({
                    metric_name: 'Zoom Meeting Attendees',
                    metric_value: uniqueAttendees.length,
                    metadata: {
                        meeting_id: target.id,
                        meeting_topic: target.label,
                        start_time: meeting.start_time,
                        attendees: uniqueAttendees
                    }
                });
            }
        }

    } catch (err) {
        console.error('Error fetching Zoom data:', err);
    }

    return metrics;
}
