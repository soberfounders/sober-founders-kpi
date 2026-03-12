import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Brain, Clock3, DollarSign, Repeat2, Sparkles, Users } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';

const baseCardStyle = {
  background: 'var(--color-card)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '18px',
  boxShadow: 'var(--glass-shadow)',
};

function toDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'N/A';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  const d = toDate(value);
  if (!d) return 'N/A';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function donorKey(row) {
  const email = String(row?.donor_email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = String(row?.donor_name || '').trim().toLowerCase();
  if (name) return `name:${name}`;
  return String(row?.row_id || row?.source_event_id || Math.random());
}

function SummaryCard({ icon: Icon, label, value, note }) {
  return (
    <div style={baseCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            backgroundColor: 'rgba(3,218,198,0.14)',
            border: '1px solid var(--color-border-glow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-dark-green)',
          }}
        >
          <Icon size={16} />
        </div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{label}</p>
      </div>
      <p style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</p>
      <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{note}</p>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div style={{ ...baseCardStyle, borderStyle: 'dashed', color: 'var(--color-text-secondary)' }}>
      <p style={{ fontSize: '14px' }}>{message}</p>
    </div>
  );
}

function monthKey(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthLabelFromKey(key) {
  const [year, month] = String(key).split('-').map(Number);
  const d = new Date(Date.UTC(year, (month || 1) - 1, 1));
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
}


function DonationsDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [rows, setRows] = useState([]);
  const [supporterProfiles, setSupporterProfiles] = useState([]);
  const [donorHealth, setDonorHealth] = useState([]);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      setError('');
      setWarnings([]);

      if (!hasSupabaseConfig) {
        if (!isMounted) return;
        setError('Supabase environment variables are missing; donations cannot load live data.');
        setLoading(false);
        return;
      }

      const [txRes, supportersRes, healthRes] = await Promise.all([
        supabase
          .from('donation_transactions_unified')
          .select('row_id,source_system,source_event_id,donor_name,donor_first_name,donor_last_name,donor_company_name,donor_email,amount,currency,eligible_amount,payment_method,status,is_recurring,campaign_name,receipt_url,donor_city,donor_region,donor_country,source_file,donated_at,created_at,payload')
          .order('donated_at', { ascending: false })
          .limit(5000),
        supabase
          .from('raw_zeffy_supporter_profiles')
          .select('donor_email,donor_name,donor_company_name,commitment_amount,last_payment_at,manual_lists,donor_city,donor_region,donor_country')
          .order('last_payment_at', { ascending: false })
          .limit(5000),
        supabase
          .from('vw_donor_health')
          .select('*'),
      ]);

      if (!isMounted) return;

      if (txRes.error) {
        setError(txRes.error.message || 'Failed to load donation transactions.');
        setLoading(false);
        return;
      }

      const nextWarnings = [];
      if (supportersRes.error) {
        nextWarnings.push(`Supporter profile snapshot unavailable: ${supportersRes.error.message}`);
      }

      setRows(txRes.data || []);
      setSupporterProfiles(supportersRes.data || []);
      setDonorHealth(healthRes.data || []);
      setWarnings(nextWarnings);
      setLoading(false);
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const transactions = useMemo(() => {
    return (rows || [])
      .map((row) => {
        const amount = safeNumber(row.amount);
        const donatedAt = toDate(row.donated_at);
        return {
          ...row,
          amount,
          donatedAt,
          is_recurring: Boolean(row.is_recurring),
          payment_method: String(row.payment_method || 'Unknown').trim() || 'Unknown',
          campaign_name: String(row.campaign_name || 'Unattributed').trim() || 'Unattributed',
        };
      })
      .filter((row) => row.amount > 0 && row.donatedAt);
  }, [rows]);

  const summary = useMemo(() => {
    const totalAmount = transactions.reduce((acc, row) => acc + row.amount, 0);
    const uniqueDonors = new Set(transactions.map((row) => donorKey(row))).size;
    const recurringTransactions = transactions.filter((row) => row.is_recurring);
    const recurringAmount = recurringTransactions.reduce((acc, row) => acc + row.amount, 0);

    const now = new Date();
    const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthToDateAmount = transactions
      .filter((row) => row.donatedAt >= thisMonthStart)
      .reduce((acc, row) => acc + row.amount, 0);

    const healthStats = {
      activeRecurring: (donorHealth || []).filter(h => h.donor_status === 'active_recurring').length,
      lapsedRecurring: (donorHealth || []).filter(h => h.donor_status === 'lapsed_recurring').length,
      atRisk: (donorHealth || []).filter(h => h.donor_status === 'at_risk').length,
      upgradeCandidates: (donorHealth || []).filter(h => h.is_upgrade_candidate).length,
    };

    return {
      totalAmount,
      giftCount: transactions.length,
      uniqueDonors,
      averageGift: transactions.length ? totalAmount / transactions.length : 0,
      recurringShare: transactions.length ? recurringTransactions.length / transactions.length : 0,
      recurringAmountShare: totalAmount > 0 ? recurringAmount / totalAmount : 0,
      monthToDateAmount,
      latestGiftAt: transactions[0]?.donatedAt || null,
      activeSupporters: supporterProfiles.length,
      healthStats,
    };
  }, [transactions, supporterProfiles, donorHealth]);

  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const buckets = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      buckets.push({
        key: monthKey(d),
        label: monthLabelFromKey(monthKey(d)),
        amount: 0,
        recurringAmount: 0,
        count: 0,
      });
    }

    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    transactions.forEach((row) => {
      const key = monthKey(row.donatedAt);
      const bucket = byKey.get(key);
      if (!bucket) return;
      bucket.amount += row.amount;
      bucket.count += 1;
      if (row.is_recurring) bucket.recurringAmount += row.amount;
    });

    return buckets;
  }, [transactions]);


  const supporterProfileByEmail = useMemo(() => {
    const out = new Map();
    (supporterProfiles || []).forEach((row) => {
      const email = String(row?.donor_email || '').trim().toLowerCase();
      if (!email) return;
      if (!out.has(email)) {
        out.set(email, row);
      }
    });
    return out;
  }, [supporterProfiles]);

  const topDonors = useMemo(() => {
    const byDonor = new Map();
    const healthByEmail = new Map();
    (donorHealth || []).forEach(h => {
      const email = String(h.donor_email || '').trim().toLowerCase();
      if (email) healthByEmail.set(email, h);
    });

    transactions.forEach((row) => {
      const key = donorKey(row);
      const donorEmail = String(row?.donor_email || '').trim().toLowerCase();
      const profile = donorEmail ? supporterProfileByEmail.get(donorEmail) : null;
      const hData = donorEmail ? healthByEmail.get(donorEmail) : null;

      const existing = byDonor.get(key) || {
        key,
        donor_name: profile?.donor_name || row.donor_name || 'Unknown donor',
        donor_email: row.donor_email || '',
        donor_company_name: profile?.donor_company_name || '',
        donor_city: profile?.donor_city || '',
        donor_region: profile?.donor_region || '',
        commitment_amount: safeNumber(profile?.commitment_amount),
        totalAmount: 0,
        gifts: 0,
        recurringGifts: 0,
        lastGiftAt: row.donatedAt,
        health_status: hData?.donor_status || 'unknown',
        is_upgrade_candidate: !!hData?.is_upgrade_candidate,
      };
      if (profile?.donor_name) existing.donor_name = profile.donor_name;
      if (profile?.donor_company_name) existing.donor_company_name = profile.donor_company_name;
      if (profile?.donor_city) existing.donor_city = profile.donor_city;
      if (profile?.donor_region) existing.donor_region = profile.donor_region;
      if (profile?.commitment_amount) existing.commitment_amount = safeNumber(profile.commitment_amount);
      existing.totalAmount += row.amount;
      existing.gifts += 1;
      if (row.is_recurring) existing.recurringGifts += 1;
      if (row.donatedAt > existing.lastGiftAt) existing.lastGiftAt = row.donatedAt;
      byDonor.set(key, existing);
    });
    return Array.from(byDonor.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 15);
  }, [transactions, supporterProfileByEmail, donorHealth]);

  const recentTransactions = useMemo(() => transactions.slice(0, 15), [transactions]);

  const invokeDonorAgent = useCallback(async () => {
    if (!hasSupabaseConfig || aiLoading) return;
    setAiLoading(true);
    setAiError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('donor-intelligence-agent', {
        method: 'POST',
        body: {},
      });
      if (fnError) throw fnError;
      setAiAnalysis(data);
    } catch (err) {
      console.error('Donor Agent Error:', err);
      setAiError(err?.message || 'Failed to run donor intelligence agent.');
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading]);

  if (loading) {
    return <EmptyState message="Loading donations data..." />;
  }

  if (error) {
    return <EmptyState message={`Donations data unavailable: ${error}`} />;
  }

  if (!transactions.length) {
    return <EmptyState message="No donations found yet. Run the Zeffy backfill and/or Zapier webhook ingest to populate this view." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div
        style={{
          ...baseCardStyle,
          border: 'none',
          color: 'white',
          background: 'linear-gradient(120deg, #0f766e 0%, #0369a1 55%, #1d4ed8 100%)',
        }}
      >
        <p style={{ fontSize: '12px', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Donations KPI</p>
        <h2 style={{ marginTop: '6px', fontSize: '28px' }}>Live donor performance</h2>
        <p style={{ marginTop: '8px', opacity: 0.95, maxWidth: '920px' }}>
          Backfilled Zeffy exports and live webhook donations are consolidated in Supabase for transaction trends, donor concentration, and recurring mix.
        </p>
        <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px' }}>
          <span>Latest gift: {formatDate(summary.latestGiftAt)}</span>
          <span>Recurring amount share: {(summary.recurringAmountShare * 100).toFixed(1)}%</span>
          <span>Month to date: {formatCurrency(summary.monthToDateAmount)}</span>
        </div>
        {!!warnings.length && (
          <div
            style={{
              marginTop: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              width: 'fit-content',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: '999px',
              padding: '5px 10px',
              fontSize: '12px',
            }}
          >
            <AlertTriangle size={14} />
            {warnings[0]}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
        <SummaryCard icon={DollarSign} label="Total Donated" value={formatCurrency(summary.totalAmount)} note="Across all loaded transactions" />
        <SummaryCard icon={Clock3} label="Total Gifts" value={summary.giftCount.toLocaleString()} note="Posted donation transactions" />
        <SummaryCard icon={Users} label="Unique Donors" value={summary.uniqueDonors.toLocaleString()} note="Email/name based donor dedupe" />
        <SummaryCard icon={Repeat2} label="Recurring Share" value={`${(summary.recurringShare * 100).toFixed(1)}%`} note="Transactions marked recurring" />
        <SummaryCard icon={DollarSign} label="Average Gift" value={formatCurrency(summary.averageGift)} note="Average amount per transaction" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
        <div style={baseCardStyle}>
          <h3 style={{ fontSize: '18px', marginBottom: '6px' }}>12-month donation trend</h3>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>Total and recurring donation amount by month.</p>
          <div style={{ width: '100%', height: '320px' }}>
            <ResponsiveContainer>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `$${Number(v).toLocaleString()}`} tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => formatCurrency(value)}
                  contentStyle={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-primary)' }}
                  itemStyle={{ color: 'var(--color-text-primary)' }}
                  labelStyle={{ color: 'var(--color-text-secondary)' }}
                />
                <Legend />
                <Line type="monotone" dataKey="amount" name="Total amount" stroke="#0f766e" strokeWidth={2.2} dot={false} />
                <Line type="monotone" dataKey="recurringAmount" name="Recurring amount" stroke="#1d4ed8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
        <SummaryCard
          icon={Users}
          label="Active Recurring"
          value={summary.healthStats.activeRecurring}
          note="Recurring + Gift in last 35d"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Lapsed Recurring"
          value={summary.healthStats.lapsedRecurring}
          note="Overdue recurring donors"
        />
        <SummaryCard
          icon={Clock3}
          label="At Risk"
          value={summary.healthStats.atRisk}
          note="Passive churn risk"
        />
        <SummaryCard
          icon={DollarSign}
          label="Upgrade Candidates"
          value={summary.healthStats.upgradeCandidates}
          note="High Net Worth / Low Giving"
        />
      </div>

      {/* Donor Intelligence Agent */}
      <div style={{
        ...baseCardStyle,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: 'white',
        border: '1px solid #334155',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Brain size={20} style={{ color: '#818cf8' }} />
              <h3 style={{ fontSize: '18px', margin: 0 }}>Donor Intelligence Agent</h3>
            </div>
            <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '600px' }}>
              AI-powered analysis of donor health, churn risk, and upgrade opportunities. Generates personalized outreach templates and reports to Slack.
            </p>
          </div>
          <button
            onClick={invokeDonorAgent}
            disabled={aiLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 20px',
              borderRadius: '10px',
              border: 'none',
              background: aiLoading
                ? 'linear-gradient(135deg, #334155 0%, #475569 100%)'
                : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              color: 'white',
              fontWeight: 600,
              fontSize: '13px',
              cursor: aiLoading ? 'wait' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: aiLoading ? 'none' : '0 4px 14px rgba(99,102,241,0.35)',
            }}
          >
            <Sparkles size={15} />
            {aiLoading ? 'Analyzing\u2026' : 'Analyze Now'}
          </button>
        </div>

        {aiError && (
          <div style={{
            marginTop: '12px',
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5',
            fontSize: '13px',
          }}>
            ⚠ {aiError}
          </div>
        )}

        {aiAnalysis && (
          <div style={{ marginTop: '16px', display: 'grid', gap: '14px' }}>
            <div style={{
              padding: '14px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#818cf8', marginBottom: '6px' }}>AI Summary</p>
              <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#e2e8f0' }}>{aiAnalysis.summary}</p>
              <div style={{ marginTop: '8px', display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', color: '#94a3b8' }}>
                <span>Model: {aiAnalysis.model}</span>
                {aiAnalysis.slack_delivered !== undefined && (
                  <span>Slack: {aiAnalysis.slack_delivered ? '✅ Delivered' : '⏭ Skipped'}</span>
                )}
              </div>
            </div>

            {aiAnalysis.health_stats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                {Object.entries(aiAnalysis.health_stats).map(([key, val]) => (
                  <div key={key} style={{
                    padding: '10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    textAlign: 'center',
                  }}>
                    <p style={{ fontSize: '20px', fontWeight: 700, color: '#e2e8f0' }}>{val}</p>
                    <p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', marginTop: '2px' }}>{String(key).replaceAll('_', ' ')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={baseCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: '18px', marginBottom: '4px' }}>Donor roster</h3>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Top donors ranked by total donated — enriched with health status and commitment data ({summary.activeSupporters.toLocaleString()} supporter profiles loaded).</p>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['#', 'Donor', 'Location', 'Status', 'Total Donated', 'Commitment', 'Gifts', 'Last Gift'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: h === 'Total Donated' || h === 'Commitment' || h === 'Gifts' ? 'right' : 'left',
                      fontSize: '11px',
                      color: 'var(--color-text-secondary)',
                      padding: '8px 10px',
                      borderBottom: '1px solid var(--color-border)',
                      whiteSpace: 'nowrap',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topDonors.map((row, idx) => (
                <tr key={row.key} style={{ backgroundColor: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.12)' }}>
                  <td style={{ fontSize: '12px', padding: '10px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontWeight: 600 }}>{idx + 1}</td>
                  <td style={{ fontSize: '12px', fontWeight: 700, padding: '10px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                    <div style={{ display: 'grid', gap: '1px' }}>
                      <span>{row.donor_name}</span>
                      {!!row.donor_company_name && (
                        <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>{row.donor_company_name}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: '11px', padding: '10px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    {row.donor_city || row.donor_region
                      ? [row.donor_city, row.donor_region].filter(Boolean).join(', ')
                      : '—'}
                  </td>
                  <td style={{ fontSize: '12px', padding: '10px', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      <span
                        style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          backgroundColor:
                            row.health_status === 'active_recurring' ? '#dcfce7' :
                              row.health_status === 'lapsed_recurring' ? '#fee2e2' :
                                row.health_status === 'at_risk' ? '#fef3c7' : '#f1f5f9',
                          color:
                            row.health_status === 'active_recurring' ? '#15803d' :
                              row.health_status === 'lapsed_recurring' ? '#b91c1c' :
                                row.health_status === 'at_risk' ? '#b45309' : 'var(--color-text-secondary)',
                        }}
                      >
                        {String(row.health_status).replaceAll('_', ' ')}
                      </span>
                      {row.is_upgrade_candidate && (
                        <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                          UPGRADE
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: '12px', fontWeight: 700, textAlign: 'right', padding: '10px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>{formatCurrency(row.totalAmount)}</td>
                  <td style={{ fontSize: '12px', textAlign: 'right', padding: '10px', borderBottom: '1px solid var(--color-border)', color: row.commitment_amount > 0 ? 'var(--color-dark-green)' : 'var(--color-text-muted)' }}>
                    {row.commitment_amount > 0 ? formatCurrency(row.commitment_amount) : '—'}
                  </td>
                  <td style={{ fontSize: '12px', textAlign: 'right', padding: '10px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>{row.gifts}</td>
                  <td style={{ fontSize: '12px', padding: '10px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>{formatDate(row.lastGiftAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={baseCardStyle}>
        <h3 style={{ fontSize: '18px', marginBottom: '6px' }}>Recent donations</h3>
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>Most recent donation transactions loaded from Supabase.</p>
        <div style={{ display: 'grid', gap: '8px', maxHeight: '520px', overflowY: 'auto' }}>
          {recentTransactions.map((row) => (
            <div key={`${row.source_system}-${row.row_id || row.source_event_id}`} style={{ border: '1px solid var(--color-border)', borderRadius: '10px', padding: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 700 }}>
                    {row.donor_name ||
                      ([row.donor_first_name, row.donor_last_name].filter(Boolean).join(' ')) ||
                      'Unknown donor'}
                  </p>
                  {!!row.donor_company_name && (
                    <p style={{ marginTop: '1px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{row.donor_company_name}</p>
                  )}
                  <p style={{ marginTop: '2px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    {row.donor_email || 'No email'} | {formatDate(row.donated_at)}
                  </p>
                  <p style={{ marginTop: '3px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    {row.campaign_name || 'Unattributed'} | {row.payment_method || 'Unknown'} | {row.source_system}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 700 }}>{formatCurrency(row.amount)}</p>
                  {!!row.is_recurring && (
                    <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: 'rgba(3,218,198,0.15)', color: 'var(--color-dark-green)', border: '1px solid rgba(3,218,198,0.35)' }}>Recurring</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DonationsDashboard;
