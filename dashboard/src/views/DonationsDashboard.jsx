import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  DollarSign,
  Gift,
  HeartHandshake,
  Loader2,
  Plus,
  RefreshCcw,
  Repeat,
  Users,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const LOOKBACK_DAYS = 540;

const baseCardStyle = {
  backgroundColor: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '18px',
  boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
};

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isoDateUtc(date) {
  return date.toISOString().slice(0, 10);
}

function dateOnlyUtc(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'N/A';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatCurrency2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'N/A';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  const d = dateOnlyUtc(value);
  if (!d) return 'N/A';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function donorKeyFromRow(row) {
  const email = normalizeEmail(row?.donor_email);
  if (email) return `email:${email}`;
  const name = String(row?.donor_name || '').trim().toLowerCase();
  if (name) return `name:${name}`;
  return `unknown:${row?.source || 'unknown'}:${row?.id || row?.source_event_id || Math.random()}`;
}

function inRange(date, start, end) {
  const d = dateOnlyUtc(date);
  if (!d || !start || !end) return false;
  return d >= start && d <= end;
}

function boolLabel(v) {
  return v ? 'Yes' : 'No';
}

const emptyManualForm = {
  donor_name: '',
  donor_email: '',
  amount: '',
  donated_at: new Date().toISOString().slice(0, 16),
  campaign_name: '',
  designation: '',
  note: '',
  is_recurring: false,
};

const DonationsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [zeffyRows, setZeffyRows] = useState([]);
  const [manualRows, setManualRows] = useState([]);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState(emptyManualForm);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData({ silent = false } = {}) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');

    const start = new Date();
    start.setUTCDate(start.getUTCDate() - LOOKBACK_DAYS);
    const startDate = isoDateUtc(start);

    const nextWarnings = [];
    const [zeffyRes, manualRes] = await Promise.all([
      supabase
        .from('raw_zeffy_donations')
        .select('id,source_event_id,donor_name,donor_email,amount,currency,fee_amount,tip_amount,net_amount,donated_at,source_created_at,status,is_recurring,campaign_name,form_name,payment_method,created_at')
        .gte('donated_at', `${startDate}T00:00:00.000Z`)
        .order('donated_at', { ascending: false })
        .limit(3000),
      supabase
        .from('manual_donation_entries')
        .select('id,donor_name,donor_email,amount,currency,donated_at,campaign_name,designation,note,is_recurring,source_label,created_at')
        .gte('donated_at', `${startDate}T00:00:00.000Z`)
        .order('donated_at', { ascending: false })
        .limit(3000),
    ]);

    if (zeffyRes.error) {
      nextWarnings.push(`Zeffy donations data unavailable: ${zeffyRes.error.message}`);
    }
    if (manualRes.error) {
      nextWarnings.push(`Manual donations table unavailable: ${manualRes.error.message}`);
    }

    if (zeffyRes.error && manualRes.error) {
      setError('Donations module tables are not available yet. Apply the donations migration first.');
    }

    setZeffyRows(zeffyRes.data || []);
    setManualRows(manualRes.data || []);
    setWarnings(nextWarnings);
    if (silent) setRefreshing(false);
    else setLoading(false);
  }

  const donations = useMemo(() => {
    const zeffy = (zeffyRows || []).map((row) => ({
      id: `zeffy:${row.id}`,
      source: 'Zeffy',
      source_event_id: row.source_event_id || null,
      donor_name: row.donor_name || '',
      donor_email: row.donor_email || '',
      amount: safeNum(row.amount),
      currency: row.currency || 'USD',
      fee_amount: row.fee_amount ?? null,
      tip_amount: row.tip_amount ?? null,
      net_amount: row.net_amount ?? null,
      donated_at: row.donated_at || row.source_created_at || row.created_at,
      status: row.status || 'unknown',
      is_recurring: !!row.is_recurring,
      campaign_name: row.campaign_name || row.form_name || '',
      designation: '',
      payment_method: row.payment_method || '',
      note: '',
      rawCreatedAt: row.created_at || null,
    }));

    const manual = (manualRows || []).map((row) => ({
      id: `manual:${row.id}`,
      source: row.source_label || 'Manual',
      source_event_id: null,
      donor_name: row.donor_name || '',
      donor_email: row.donor_email || '',
      amount: safeNum(row.amount),
      currency: row.currency || 'USD',
      fee_amount: null,
      tip_amount: null,
      net_amount: null,
      donated_at: row.donated_at || row.created_at,
      status: 'posted',
      is_recurring: !!row.is_recurring,
      campaign_name: row.campaign_name || '',
      designation: row.designation || '',
      payment_method: '',
      note: row.note || '',
      rawCreatedAt: row.created_at || null,
    }));

    return [...zeffy, ...manual]
      .filter((row) => row.amount > 0)
      .sort((a, b) => new Date(b.donated_at || 0).getTime() - new Date(a.donated_at || 0).getTime());
  }, [manualRows, zeffyRows]);

  const analytics = useMemo(() => {
    const referenceDate = donations.length ? dateOnlyUtc(donations[0].donated_at) : dateOnlyUtc(new Date());
    const last7Start = new Date(referenceDate);
    last7Start.setUTCDate(last7Start.getUTCDate() - 6);
    const last30Start = new Date(referenceDate);
    last30Start.setUTCDate(last30Start.getUTCDate() - 29);
    const ytdStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), 0, 1));

    const sumAmount = (rows) => rows.reduce((acc, row) => acc + safeNum(row.amount), 0);
    const rows7 = donations.filter((row) => inRange(row.donated_at, last7Start, referenceDate));
    const rows30 = donations.filter((row) => inRange(row.donated_at, last30Start, referenceDate));
    const rowsYtd = donations.filter((row) => inRange(row.donated_at, ytdStart, referenceDate));
    const zeffyOnly30 = rows30.filter((row) => row.source === 'Zeffy');
    const manualOnly30 = rows30.filter((row) => row.source !== 'Zeffy');

    const donorsMap = new Map();
    donations.forEach((row) => {
      const key = donorKeyFromRow(row);
      const prev = donorsMap.get(key) || {
        key,
        donor_name: row.donor_name || 'Unknown Donor',
        donor_email: row.donor_email || '',
        totalAmount: 0,
        amount30d: 0,
        giftCount: 0,
        recurringGiftCount: 0,
        lastGiftAt: null,
        sources: new Set(),
        campaigns: new Set(),
      };

      prev.totalAmount += safeNum(row.amount);
      if (inRange(row.donated_at, last30Start, referenceDate)) prev.amount30d += safeNum(row.amount);
      prev.giftCount += 1;
      if (row.is_recurring) prev.recurringGiftCount += 1;
      if (!prev.lastGiftAt || new Date(row.donated_at).getTime() > new Date(prev.lastGiftAt).getTime()) {
        prev.lastGiftAt = row.donated_at;
      }
      if (!prev.donor_email && row.donor_email) prev.donor_email = row.donor_email;
      if ((prev.donor_name === 'Unknown Donor' || !prev.donor_name) && row.donor_name) prev.donor_name = row.donor_name;
      if (row.source) prev.sources.add(row.source);
      if (row.campaign_name) prev.campaigns.add(row.campaign_name);
      donorsMap.set(key, prev);
    });

    const donors = Array.from(donorsMap.values())
      .map((d) => ({
        ...d,
        sources: Array.from(d.sources),
        campaigns: Array.from(d.campaigns),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const donors30 = new Set(rows30.map((r) => donorKeyFromRow(r)));
    const recurringRows30 = rows30.filter((r) => r.is_recurring);
    const avgGift30 = rows30.length ? sumAmount(rows30) / rows30.length : null;
    const netKnownRows30 = rows30.filter((r) => Number.isFinite(Number(r.net_amount)));
    const net30 = netKnownRows30.length ? netKnownRows30.reduce((acc, r) => acc + safeNum(r.net_amount), 0) : null;

    return {
      referenceDate,
      windows: {
        last7: { start: last7Start, end: referenceDate, label: `${formatDate(last7Start)} to ${formatDate(referenceDate)}` },
        last30: { start: last30Start, end: referenceDate, label: `${formatDate(last30Start)} to ${formatDate(referenceDate)}` },
      },
      totals: {
        all: sumAmount(donations),
        last7: sumAmount(rows7),
        last30: sumAmount(rows30),
        ytd: sumAmount(rowsYtd),
        zeffy30: sumAmount(zeffyOnly30),
        manual30: sumAmount(manualOnly30),
        net30,
      },
      counts: {
        donationsAll: donations.length,
        donations30: rows30.length,
        donorsAll: donors.length,
        donors30: donors30.size,
        recurringGifts30: recurringRows30.length,
      },
      avgGift30,
      donors,
      recent: donations.slice(0, 40),
    };
  }, [donations]);

  async function handleSaveManual(e) {
    e.preventDefault();
    if (!manualForm.donor_name.trim() || !manualForm.amount) return;

    setSavingManual(true);
    try {
      const amount = Number(manualForm.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid donation amount.');

      const payload = {
        donor_name: manualForm.donor_name.trim(),
        donor_email: manualForm.donor_email.trim() || null,
        amount,
        currency: 'USD',
        donated_at: manualForm.donated_at ? new Date(manualForm.donated_at).toISOString() : new Date().toISOString(),
        campaign_name: manualForm.campaign_name.trim() || null,
        designation: manualForm.designation.trim() || null,
        note: manualForm.note.trim() || null,
        is_recurring: !!manualForm.is_recurring,
        source_label: 'Manual Entry',
      };

      const { error: insertError } = await supabase
        .from('manual_donation_entries')
        .insert(payload);

      if (insertError) throw insertError;

      setManualForm(emptyManualForm);
      setShowManualForm(false);
      await loadData({ silent: true });
    } catch (err) {
      alert(`Failed to save manual donation: ${err?.message || 'Unknown error'}`);
    } finally {
      setSavingManual(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <p style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-dark-green)' }}>Loading donations module...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'grid', gap: '16px' }}>
        <div style={{ ...baseCardStyle, color: '#991b1b', borderLeft: '4px solid #ef4444' }}>
          <p style={{ fontWeight: 700 }}>Donations module setup needed</p>
          <p style={{ marginTop: '6px' }}>{error}</p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: '#7f1d1d' }}>
            Apply the donations migration, then reload this page. Zeffy ingestion is designed to work via webhook/Zapier payloads plus manual entries.
          </p>
        </div>
        {warnings.length > 0 && (
          <div style={{ ...baseCardStyle, backgroundColor: '#fffaf0', borderLeft: '4px solid #f59e0b' }}>
            {warnings.map((w) => (
              <p key={w} style={{ fontSize: '13px', color: '#92400e' }}>{w}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div
        style={{
          ...baseCardStyle,
          border: 'none',
          color: 'white',
          background: 'linear-gradient(120deg, #7c2d12 0%, #b45309 45%, #92400e 100%)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: '12px', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Donations</p>
            <h2 style={{ fontSize: '28px', marginTop: '6px' }}>Donor Revenue & Stewardship</h2>
            <p style={{ marginTop: '8px', opacity: 0.95, maxWidth: '900px' }}>
              Combined donor view from Zeffy ingestion plus manual entries. Use this page to track donors, contribution trends, and stewardship priorities.
            </p>
            <p style={{ marginTop: '8px', fontSize: '12px', opacity: 0.9 }}>
              Zeffy ingestion path: webhook/Zapier payloads into `raw_zeffy_donations` + manual entries in `manual_donation_entries`.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => loadData({ silent: true })}
              disabled={refreshing}
              style={{
                border: '1px solid rgba(255,255,255,0.35)',
                backgroundColor: 'rgba(255,255,255,0.12)',
                color: 'white',
                padding: '10px 12px',
                borderRadius: '10px',
                fontWeight: 700,
                cursor: refreshing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {refreshing ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCcw size={15} />}
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowManualForm((v) => !v)}
              style={{
                border: 'none',
                backgroundColor: 'white',
                color: '#7c2d12',
                padding: '10px 12px',
                borderRadius: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Plus size={15} />
              Manual Donation
            </button>
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div style={{ ...baseCardStyle, backgroundColor: '#fffaf0', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} color="#b45309" />
            <p style={{ fontWeight: 700, color: '#92400e' }}>Data warnings</p>
          </div>
          <div style={{ marginTop: '8px', display: 'grid', gap: '5px' }}>
            {warnings.map((warning) => (
              <p key={warning} style={{ fontSize: '13px', color: '#92400e' }}>{warning}</p>
            ))}
          </div>
        </div>
      )}

      {showManualForm && (
        <div style={baseCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <HeartHandshake size={17} color="#b45309" />
            <h3 style={{ fontSize: '18px' }}>Add Manual Donation Entry</h3>
          </div>
          <form onSubmit={handleSaveManual} style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
              <input
                value={manualForm.donor_name}
                onChange={(e) => setManualForm((f) => ({ ...f, donor_name: e.target.value }))}
                placeholder="Donor name"
                required
                style={inputStyle}
              />
              <input
                value={manualForm.donor_email}
                onChange={(e) => setManualForm((f) => ({ ...f, donor_email: e.target.value }))}
                placeholder="Donor email (optional)"
                style={inputStyle}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={manualForm.amount}
                onChange={(e) => setManualForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="Amount"
                required
                style={inputStyle}
              />
              <input
                type="datetime-local"
                value={manualForm.donated_at}
                onChange={(e) => setManualForm((f) => ({ ...f, donated_at: e.target.value }))}
                style={inputStyle}
              />
              <input
                value={manualForm.campaign_name}
                onChange={(e) => setManualForm((f) => ({ ...f, campaign_name: e.target.value }))}
                placeholder="Campaign / event"
                style={inputStyle}
              />
              <input
                value={manualForm.designation}
                onChange={(e) => setManualForm((f) => ({ ...f, designation: e.target.value }))}
                placeholder="Designation (optional)"
                style={inputStyle}
              />
            </div>

            <textarea
              value={manualForm.note}
              onChange={(e) => setManualForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Notes (acknowledgment, source detail, donor context)"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }}
            />

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155' }}>
              <input
                type="checkbox"
                checked={manualForm.is_recurring}
                onChange={(e) => setManualForm((f) => ({ ...f, is_recurring: e.target.checked }))}
              />
              Recurring donation / pledge-related entry
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setManualForm(emptyManualForm);
                  setShowManualForm(false);
                }}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingManual}
                style={primaryButtonStyle}
              >
                {savingManual ? 'Saving...' : 'Save Manual Entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
        <SummaryCard icon={DollarSign} label="Total Donated (7d)" value={formatCurrency2(analytics.totals.last7)} note={analytics.windows.last7.label} />
        <SummaryCard icon={Gift} label="Total Donated (30d)" value={formatCurrency2(analytics.totals.last30)} note={analytics.windows.last30.label} />
        <SummaryCard icon={DollarSign} label="YTD Donations" value={formatCurrency2(analytics.totals.ytd)} note={`As of ${formatDate(analytics.referenceDate)}`} />
        <SummaryCard icon={Users} label="Unique Donors (30d)" value={analytics.counts.donors30.toLocaleString()} note={`${analytics.counts.donations30.toLocaleString()} gifts`} />
        <SummaryCard icon={Repeat} label="Recurring Gifts (30d)" value={analytics.counts.recurringGifts30.toLocaleString()} note={`Avg gift ${formatCurrency2(analytics.avgGift30)}`} />
        <SummaryCard icon={HeartHandshake} label="Zeffy vs Manual (30d)" value={`${formatCurrency2(analytics.totals.zeffy30)} / ${formatCurrency2(analytics.totals.manual30)}`} note="Zeffy / Manual" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
        <div style={baseCardStyle}>
          <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Donor List (Combined)</h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
            Lifetime donor rollup across Zeffy and manual entries. Use this for stewardship follow-up and donor context.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Donor', 'Email', 'Total', '30d', 'Gifts', 'Recurring', 'Last Gift'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analytics.donors.slice(0, 30).map((row) => (
                  <tr key={row.key}>
                    <td style={tdStyle}>
                      <div style={{ display: 'grid', gap: '2px' }}>
                        <span style={{ fontWeight: 600 }}>{row.donor_name || 'Unknown Donor'}</span>
                        {row.campaigns.length > 0 && (
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            {row.campaigns.slice(0, 2).join(', ')}{row.campaigns.length > 2 ? ` +${row.campaigns.length - 2}` : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={tdStyle}>{row.donor_email || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{formatCurrency2(row.totalAmount)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency2(row.amount30d)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{row.giftCount}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{row.recurringGiftCount > 0 ? row.recurringGiftCount : '—'}</td>
                    <td style={tdStyle}>{formatDate(row.lastGiftAt)}</td>
                  </tr>
                ))}
                {analytics.donors.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#64748b', padding: '18px' }}>
                      No donations loaded yet. Connect Zeffy webhook ingestion and/or add manual entries.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={baseCardStyle}>
            <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Operations Notes</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={noteBoxStyle}>
                <p style={noteTitleStyle}>Zeffy ingestion</p>
                <p style={noteTextStyle}>
                  This module reads `raw_zeffy_donations`. Recommended production path is Zeffy to Zapier/automation to the `ingest_zeffy_donations` edge function.
                </p>
              </div>
              <div style={noteBoxStyle}>
                <p style={noteTitleStyle}>Manual entries</p>
                <p style={noteTextStyle}>
                  Use manual entries for offline checks, corrections, sponsorships, wire transfers, or backfills from historical donor exports.
                </p>
              </div>
              <div style={noteBoxStyle}>
                <p style={noteTitleStyle}>Compliance / stewardship</p>
                <p style={noteTextStyle}>
                  Track donor contact info, designation, and timely acknowledgments. Add receipt/ack status fields next if you want this page to become the stewardship queue.
                </p>
              </div>
            </div>
          </div>

          <div style={baseCardStyle}>
            <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Recent Donations</h3>
            <div style={{ display: 'grid', gap: '8px', maxHeight: '520px', overflowY: 'auto' }}>
              {analytics.recent.map((row) => (
                <div key={row.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', backgroundColor: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '13px' }}>{row.donor_name || 'Unknown Donor'}</p>
                      <p style={{ marginTop: '2px', fontSize: '12px', color: '#64748b' }}>
                        {row.donor_email || 'No email'} · {row.source} · {formatDate(row.donated_at)}
                      </p>
                      <p style={{ marginTop: '3px', fontSize: '12px', color: '#475569' }}>
                        {row.campaign_name || 'No campaign'}{row.designation ? ` · ${row.designation}` : ''}{row.payment_method ? ` · ${row.payment_method}` : ''}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontWeight: 700 }}>{formatCurrency2(row.amount)}</p>
                      <p style={{ marginTop: '2px', fontSize: '11px', color: '#64748b' }}>
                        {row.status || 'posted'} · Recurring: {boolLabel(row.is_recurring)}
                      </p>
                      {Number.isFinite(Number(row.net_amount)) && (
                        <p style={{ marginTop: '2px', fontSize: '11px', color: '#64748b' }}>
                          Net {formatCurrency2(row.net_amount)}
                        </p>
                      )}
                    </div>
                  </div>
                  {row.note && (
                    <p style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>{row.note}</p>
                  )}
                </div>
              ))}
              {analytics.recent.length === 0 && (
                <p style={{ fontSize: '13px', color: '#64748b' }}>No donation rows available yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const inputStyle = {
  width: '100%',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  padding: '10px 12px',
  fontSize: '14px',
  boxSizing: 'border-box',
  backgroundColor: '#fff',
  color: '#0f172a',
};

const primaryButtonStyle = {
  border: 'none',
  borderRadius: '10px',
  padding: '10px 12px',
  backgroundColor: '#0f172a',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  padding: '10px 12px',
  backgroundColor: '#fff',
  color: '#0f172a',
  fontWeight: 700,
  cursor: 'pointer',
};

const thStyle = {
  textAlign: 'left',
  fontSize: '12px',
  color: '#64748b',
  padding: '10px',
  borderBottom: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  fontSize: '12px',
  color: '#0f172a',
  padding: '10px',
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'top',
};

const noteBoxStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '10px',
  backgroundColor: '#f8fafc',
};

const noteTitleStyle = {
  fontSize: '12px',
  fontWeight: 700,
  color: '#0f172a',
};

const noteTextStyle = {
  marginTop: '4px',
  fontSize: '12px',
  color: '#475569',
  lineHeight: 1.45,
};

function SummaryCard({ icon: Icon, label, value, note }) {
  return (
    <div style={baseCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b45309' }}>
          <Icon size={16} />
        </div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{label}</p>
      </div>
      <p style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{value}</p>
      <p style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>{note}</p>
    </div>
  );
}

export default DonationsDashboard;
