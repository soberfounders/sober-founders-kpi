import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch active user integrations
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
      const credentials = integration.integration_credentials.reduce((acc, curr) => {
        acc[curr.credential_key] = curr.credential_value
        return acc
      }, {})

      console.log(`Syncing ${slug} for user ${integration.user_id}`)

      try {
        let metrics: any[] = []
        
        if (slug === 'notion') {
          metrics = await syncNotion(credentials)
        } else if (slug === 'zoom') {
          metrics = await syncZoom(credentials)
        } else if (slug === 'luma') {
          metrics = await syncLuma(credentials)
        } else if (slug === 'mailchimp') {
          metrics = await syncMailchimp(credentials)
        }

        // 2. Store metrics in database
        if (metrics.length > 0) {
          const { error: dbError } = await supabaseClient
            .from('kpi_metrics')
            .insert(metrics.map((m: any) => ({
              user_id: integration.user_id,
              integration_id: integration.id,
              ...m
            })))
          
          if (dbError) throw dbError
        }

        results.push({ slug, status: 'success', count: metrics.length })
      } catch (err: any) {
        console.error(`Error syncing ${slug}:`, err)
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

async function syncNotion(credentials: any) {
  const { api_key, database_id } = credentials
  if (!api_key || !database_id) return []
  // ... actual fetch logic here
  return [] // Placeholder
}

async function syncZoom(credentials: any) {
  // Logic for Zoom OAuth/API
  return []
}

async function syncLuma(credentials: any) {
  // Logic for Luma API
  return []
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

  // 2. Fetch Recent Campaigns
  try {
    const campaignRes = await fetch(`${baseUrl}/campaigns?status=sent&count=5&sort_field=send_time&sort_dir=DESC`, options)
    const campaignData = await campaignRes.json()

    if (campaignData.campaigns) {
      for (const campaign of campaignData.campaigns) {
        if (campaign.report_summary) {
          metrics.push({
            metric_name: 'Email Open Rate',
            metric_value: campaign.report_summary.open_rate * 100, // percentage
            metadata: { campaign_id: campaign.id, campaign_name: campaign.settings.subject_line }
          })
          metrics.push({
            metric_name: 'Email Click Rate',
            metric_value: campaign.report_summary.click_rate * 100, // percentage
            metadata: { campaign_id: campaign.id, campaign_name: campaign.settings.subject_line }
          })
        }
      }
    }
  } catch (err) {
    console.error('Error fetching Mailchimp campaigns:', err)
  }

  return metrics
}
