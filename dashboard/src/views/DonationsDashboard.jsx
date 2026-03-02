import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, DollarSign, Repeat2, Users } from 'lucide-react';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';

const baseCardStyle = {
  backgroundColor: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '18px',
  boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
};

const chartPalette = ['#0f766e', '#0369a1', '#1d4ed8', '#7c3aed', '#c2410c', '#15803d', '#be185d'];

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
            backgroundColor: '#ecfeff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0f766e',
          }}
        >
          <Icon size={16} />
        </div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{label}</p>
      </div>
      <p style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{value}</p>
      <p style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>{note}</p>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div style={{ ...baseCardStyle, borderStyle: 'dashed', color: '#475569' }}>
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

function PaymentsTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 10px' }}>
      <p style={{ fontWeight: 700, fontSize: '12px' }}>{row.name}</p>
      <p style={{ fontSize: '12px' }}>Amount: {formatCurrency(row.amount)}</p>
      <p style={{ fontSize: '12px' }}>Transactions: {safeNumber(row.count).toLocaleString()}</p>
    </div>
  );
}

function DonationsDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [rows, setRows] = useState([]);
  const [supporterProfiles, setSupporterProfiles] = useState([]);

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

      const [txRes, supportersRes] = await Promise.all([
        supabase
          .from('donation_transactions_unified')
          .select('row_id,source_system,source_event_id,donor_name,donor_email,amount,currency,eligible_amount,payment_method,status,is_recurring,campaign_name,receipt_url,donor_city,donor_region,donor_country,source_file,donated_at,created_at,payload')
          .order('donated_at', { ascending: false })
          .limit(5000),
        supabase
          .from('raw_zeffy_supporter_profiles')
          .select('donor_email,donor_name,donor_company_name,commitment_amount,last_payment_at,manual_lists,donor_city,donor_region,donor_country')
          .order('last_payment_at', { ascending: false })
          .limit(5000),
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
    };
  }, [transactions, supporterProfiles]);

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

  const paymentMethodRows = useMemo(() => {
    const byMethod = new Map();
    transactions.forEach((row) => {
      const key = row.payment_method || 'Unknown';
      const existing = byMethod.get(key) || { name: key, amount: 0, count: 0 };
      existing.amount += row.amount;
      existing.count += 1;
      byMethod.set(key, existing);
    });
    return Array.from(byMethod.values()).sort((a, b) => b.amount - a.amount);
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
    transactions.forEach((row) => {
      const key = donorKey(row);
      const donorEmail = String(row?.donor_email || '').trim().toLowerCase();
      const profile = donorEmail ? supporterProfileByEmail.get(donorEmail) : null;
      const existing = byDonor.get(key) || {
        key,
        donor_name: profile?.donor_name || row.donor_name || 'Unknown donor',
        donor_email: row.donor_email || '',
        donor_company_name: profile?.donor_company_name || '',
        totalAmount: 0,
        gifts: 0,
        recurringGifts: 0,
        lastGiftAt: row.donatedAt,
      };
      if (profile?.donor_name) existing.donor_name = profile.donor_name;
      if (profile?.donor_company_name) existing.donor_company_name = profile.donor_company_name;
      existing.totalAmount += row.amount;
      existing.gifts += 1;
      if (row.is_recurring) existing.recurringGifts += 1;
      if (row.donatedAt > existing.lastGiftAt) existing.lastGiftAt = row.donatedAt;
      byDonor.set(key, existing);
    });
    return Array.from(byDonor.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 12);
  }, [transactions, supporterProfileByEmail]);

  const recentTransactions = useMemo(() => transactions.slice(0, 15), [transactions]);

  const topSupporters = useMemo(() => {
    return [...(supporterProfiles || [])]
      .map((row) => ({
        ...row,
        commitment_amount: safeNumber(row.commitment_amount),
      }))
      .sort((a, b) => b.commitment_amount - a.commitment_amount)
      .slice(0, 8);
  }, [supporterProfiles]);

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
          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>Total and recurring donation amount by month.</p>
          <div style={{ width: '100%', height: '320px' }}>
            <ResponsiveContainer>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="amount" name="Total amount" stroke="#0f766e" strokeWidth={2.2} dot={false} />
                <Line type="monotone" dataKey="recurringAmount" name="Recurring amount" stroke="#1d4ed8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={baseCardStyle}>
          <h3 style={{ fontSize: '18px', marginBottom: '6px' }}>Payment method mix</h3>
          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>Share by amount and transaction count.</p>
          <div style={{ width: '100%', height: '320px' }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={paymentMethodRows}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={105}
                  paddingAngle={2}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {paymentMethodRows.map((entry, idx) => (
                    <Cell key={`${entry.name}-${idx}`} fill={chartPalette[idx % chartPalette.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PaymentsTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
        <div style={baseCardStyle}>
          <h3 style={{ fontSize: '18px', marginBottom: '6px' }}>Supporter commitment snapshot</h3>
          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
            From Zeffy supporter export ({summary.activeSupporters.toLocaleString()} profiles loaded).
          </p>
          <div style={{ display: 'grid', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {topSupporters.length ? (
              topSupporters.map((row) => (
                <div key={row.donor_email} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 700 }}>{row.donor_name || row.donor_email}</p>
                      <p style={{ marginTop: '2px', fontSize: '12px', color: '#64748b' }}>
                        {row.donor_email || 'No email'} | {row.donor_city || '-'}, {row.donor_region || '-'}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontWeight: 700 }}>{formatCurrency(row.commitment_amount)}</p>
                      <p style={{ marginTop: '2px', fontSize: '11px', color: '#64748b' }}>Last payment: {formatDate(row.last_payment_at)}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ fontSize: '13px', color: '#64748b' }}>No supporter snapshot rows loaded yet.</p>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
        <div style={baseCardStyle}>
          <h3 style={{ fontSize: '18px', marginBottom: '6px' }}>Top donors leaderboard</h3>
          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>Ranked by total donated amount.</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Rank', 'Donor', 'Email', 'Total Donated', 'Gift Count', 'Recurring Gifts', 'Last Gift'].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        fontSize: '12px',
                        color: '#64748b',
                        padding: '10px',
                        borderBottom: '1px solid #e2e8f0',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topDonors.map((row, idx) => (
                  <tr key={row.key}>
                    <td style={{ fontSize: '12px', padding: '10px', borderBottom: '1px solid #f1f5f9' }}>#{idx + 1}</td>
                    <td style={{ fontSize: '12px', fontWeight: 700, padding: '10px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'grid', gap: '2px' }}>
                        <span>{row.donor_name}</span>
                        {!!row.donor_company_name && (
                          <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748b' }}>{row.donor_company_name}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', padding: '10px', borderBottom: '1px solid #f1f5f9' }}>{row.donor_email || '-'}</td>
                    <td style={{ fontSize: '12px', fontWeight: 700, textAlign: 'right', padding: '10px', borderBottom: '1px solid #f1f5f9' }}>{formatCurrency(row.totalAmount)}</td>
                    <td style={{ fontSize: '12px', textAlign: 'right', padding: '10px', borderBottom: '1px solid #f1f5f9' }}>{row.gifts}</td>
                    <td style={{ fontSize: '12px', textAlign: 'right', padding: '10px', borderBottom: '1px solid #f1f5f9' }}>{row.recurringGifts}</td>
                    <td style={{ fontSize: '12px', padding: '10px', borderBottom: '1px solid #f1f5f9' }}>{formatDate(row.lastGiftAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={baseCardStyle}>
          <h3 style={{ fontSize: '18px', marginBottom: '6px' }}>Recent donations</h3>
          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>Most recent donation transactions loaded from Supabase.</p>
          <div style={{ display: 'grid', gap: '8px', maxHeight: '520px', overflowY: 'auto' }}>
            {recentTransactions.map((row) => (
              <div key={`${row.source_system}-${row.row_id || row.source_event_id}`} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 700 }}>{row.donor_name || 'Unknown donor'}</p>
                    <p style={{ marginTop: '2px', fontSize: '12px', color: '#64748b' }}>
                      {row.donor_email || 'No email'} | {formatDate(row.donated_at)}
                    </p>
                    <p style={{ marginTop: '3px', fontSize: '12px', color: '#475569' }}>
                      {row.campaign_name || 'Unattributed'} | {row.payment_method || 'Unknown'} | {row.source_system}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 700 }}>{formatCurrency(row.amount)}</p>
                    <p style={{ marginTop: '2px', fontSize: '11px', color: '#64748b' }}>Recurring: {row.is_recurring ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DonationsDashboard;
