const { Client } = require('pg');

const SQL = `
CREATE TABLE IF NOT EXISTS public.mailchimp_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  subject_line TEXT,
  send_time TIMESTAMPTZ,
  emails_sent INTEGER DEFAULT 0,
  emails_delivered INTEGER DEFAULT 0,
  unique_opens INTEGER DEFAULT 0,
  mpp_opens INTEGER DEFAULT 0,
  unique_clicks INTEGER DEFAULT 0,
  unsubscribes INTEGER DEFAULT 0,
  bounces INTEGER DEFAULT 0,
  raw_open_rate NUMERIC,
  human_open_rate NUMERIC,
  ctr NUMERIC,
  ctor NUMERIC,
  unsubscribe_rate NUMERIC,
  bounce_rate NUMERIC,
  campaign_group TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.mailchimp_campaigns ENABLE ROW LEVEL SECURITY;

DO $do$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mailchimp_campaigns'
      AND policyname = 'Public read mailchimp_campaigns'
  ) THEN
    CREATE POLICY "Public read mailchimp_campaigns"
      ON public.mailchimp_campaigns
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $do$;

DO $do$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mailchimp_campaigns'
      AND policyname = 'Service role write mailchimp_campaigns'
  ) THEN
    CREATE POLICY "Service role write mailchimp_campaigns"
      ON public.mailchimp_campaigns
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $do$;

CREATE INDEX IF NOT EXISTS idx_mailchimp_campaign_group ON public.mailchimp_campaigns(campaign_group);
CREATE INDEX IF NOT EXISTS idx_mailchimp_send_time ON public.mailchimp_campaigns(send_time DESC);
`;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:eD7IMyb8WUB0xv@db.ldnucnghzpkuixmnfjbs.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Supabase Postgres');
    await client.query(SQL);
    console.log('✅ mailchimp_campaigns table created successfully');

    // Verify
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'mailchimp_campaigns'
      ORDER BY ordinal_position
    `);
    console.log(`\nTable columns (${result.rows.length} total):`);
    result.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
