// Test the sync_mailchimp edge function and report results
const https = require('https');

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkbnVjbmdoenBrdWl4bW5mamJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI2MDI3MCwiZXhwIjoyMDg2ODM2MjcwfQ.XJcyJiaQPWOf-fPj8ZFVb5QVkl32IwE_0mhPRuCxfUU';
const SUPABASE_URL = 'ldnucnghzpkuixmnfjbs.supabase.co';

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname,
      port: 443,
      path,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, res => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
    });
    req.on('error', reject);
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('📡 Calling sync_mailchimp edge function...');
  console.log('   This fetches the last 50 sent campaigns from Mailchimp,');
  console.log('   classifies Tuesday/Thursday, computes MPP-adjusted metrics,');
  console.log('   and upserts to mailchimp_campaigns table.\n');

  try {
    const result = await httpsPost(
      SUPABASE_URL,
      '/functions/v1/sync_mailchimp',
      {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      {}
    );

    console.log(`HTTP Status: ${result.status}`);
    
    let parsed;
    try { parsed = JSON.parse(result.body); } catch { parsed = result.body; }

    if (typeof parsed === 'object' && parsed !== null) {
      if (parsed.ok === true) {
        console.log(`\n✅ Sync successful!`);
        console.log(`   Campaigns synced: ${parsed.synced_campaigns}`);
        console.log(`   Tuesday campaigns: ${parsed.tuesday_count}`);
        console.log(`   Thursday campaigns: ${parsed.thursday_count}`);
        
        if (parsed.anomalies && parsed.anomalies.length > 0) {
          console.log(`\n⚠️  Anomalies detected (${parsed.anomalies.length}):`);
          parsed.anomalies.forEach(a => {
            console.log(`   [${a.severity?.toUpperCase()}] ${a.group} – ${a.type}: ${a.message}`);
          });
        } else {
          console.log(`\n✅ No anomalies detected.`);
        }

        if (parsed.data && parsed.data.length > 0) {
          console.log(`\n📊 Sample campaigns:`);
          parsed.data.slice(0, 3).forEach(c => {
            const rawPct    = (c.raw_open_rate   * 100).toFixed(1);
            const humanPct  = (c.human_open_rate * 100).toFixed(1);
            const ctrPct    = (c.ctr             * 100).toFixed(1);
            const ctorPct   = (c.ctor            * 100).toFixed(1);
            const mppDiff   = Number(c.unique_opens) - Number(c.mpp_opens);
            console.log(`\n   [${c.campaign_group}] ${c.send_time?.slice(0,10)} — "${c.subject_line}"`);
            console.log(`     Delivered:               ${c.emails_delivered?.toLocaleString()}`);
            console.log(`     Human Open Rate (excl. Apple MPP): ${humanPct}%  (${mppDiff} human opens)`);
            console.log(`     Raw Open Rate (incl. Apple MPP):   ${rawPct}%  (${c.unique_opens} total opens, ${c.mpp_opens} MPP)`);
            console.log(`     Click-Through Rate (CTR):          ${ctrPct}%  (${c.unique_clicks} clicks / ${c.emails_delivered} delivered)`);
            console.log(`     Click-to-Open Rate (CTOR):         ${ctorPct}%  (${c.unique_clicks} clicks / ${c.unique_opens} opens)`);
          });
        }
      } else {
        console.log(`\n❌ Sync failed:`);
        console.log(JSON.stringify(parsed, null, 2));
      }
    } else {
      console.log('Raw response:', result.body);
    }
  } catch (err) {
    console.error('❌ Request failed:', err.message);
  }
}

main();
