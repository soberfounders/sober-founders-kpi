import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Send, 
  MousePointer2, 
  AlertTriangle, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  CheckCircle2,
  Info
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceLine
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabaseClient';

const EmailDashboard = () => {
  const [data, setData] = useState({ tuesday: [], thursday: [], anomalies: [] });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const fetchEmailData = async (shouldSync = false) => {
    try {
      if (shouldSync) setSyncing(true);
      
      // If requested or on initial load (as per user: "Always pull fresh data... on dashboard load")
      // we call the edge function
      const { data: syncResult, error: syncError } = await supabase.functions.invoke('sync_mailchimp');
      
      if (syncError) {
        console.error("Sync error:", syncError);
        // Fallback to reading from DB if sync fails
      }

      // Fetch from DB to get history (Edge function might only return what it just pushed)
      const { data: dbData, error: dbError } = await supabase
        .from('mailchimp_campaigns')
        .select('*')
        .order('send_time', { ascending: false })
        .limit(40);

      if (dbError) throw dbError;

      const tuesday = dbData.filter(c => c.campaign_group === 'Tuesday').slice(0, 10);
      const thursday = dbData.filter(c => c.campaign_group === 'Thursday').slice(0, 10);
      
      setData({
        tuesday,
        thursday,
        anomalies: syncResult?.anomalies || []
      });
      setError(null);
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Failed to load email analytics. Please check your connection.");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchEmailData();
  }, []);

  const formatPercent = (val) => (val * 100).toFixed(1) + '%';
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };

  const renderMetricTable = (campaigns) => (
    <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--color-border)', backgroundColor: 'white' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: '#f8fafc' }}>
            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600' }}>Send Date</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600' }}>Delivered</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: 'var(--color-dark-green)' }}>Human Open Rate (excl. Apple MPP)</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600' }}>Raw Open Rate (incl. Apple MPP)</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600' }}>Click-Through Rate (CTR)</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600' }}>Click-to-Open Rate (CTOR)</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600' }}>Unsubscribe Rate</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600' }}>Bounce Rate</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c, idx) => (
            <tr key={c.id} style={{ borderBottom: idx === campaigns.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
              <td style={{ padding: '12px 16px' }}>{formatDate(c.send_time)}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right' }}>{c.emails_delivered?.toLocaleString()}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: 'var(--color-dark-green)' }}>
                {formatPercent(c.human_open_rate)}
                <div style={{ fontSize: '10px', fontWeight: '400', opacity: 0.7 }}>{(c.unique_opens - c.mpp_opens).toLocaleString()} human opens</div>
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#64748b' }}>
                {formatPercent(c.raw_open_rate)}
                <div style={{ fontSize: '10px', opacity: 0.7 }}>{c.unique_opens?.toLocaleString()} total opens</div>
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600' }}>
                {formatPercent(c.ctr)}
                <div style={{ fontSize: '10px', fontWeight: '400', opacity: 0.7 }}>{c.unique_clicks?.toLocaleString()} clicks</div>
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                {formatPercent(c.ctor)}
                <div style={{ fontSize: '10px', opacity: 0.7 }}>clicks / opens</div>
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                {formatPercent(c.unsubscribe_rate)}
                <div style={{ fontSize: '10px', opacity: 0.7 }}>{c.unsubscribes?.toLocaleString()} unsub</div>
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                {formatPercent(c.bounce_rate)}
                <div style={{ fontSize: '10px', opacity: 0.7 }}>{c.bounces?.toLocaleString()} bounce</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderTrendChart = (campaigns, color) => (
    <div style={{ height: '240px', marginTop: '16px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={[...campaigns].reverse()}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="send_time" 
            tickFormatter={(val) => val.slice(5, 10)} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: '#94a3b8' }} 
          />
          <YAxis 
            tickFormatter={(val) => (val * 100).toFixed(0) + '%'} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: '#94a3b8' }} 
          />
          <Tooltip 
            formatter={(val) => [(val * 100).toFixed(1) + '%', 'Rate']}
            labelFormatter={(val) => formatDate(val)}
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
          />
          <Line 
            type="monotone" 
            dataKey="human_open_rate" 
            stroke={color} 
            strokeWidth={3} 
            dot={{ r: 4, fill: color }}
            activeDot={{ r: 6 }} 
          />
          <Line 
            type="monotone" 
            dataKey="ctr" 
            stroke="var(--color-orange)" 
            strokeWidth={2} 
            dot={{ r: 3, fill: 'var(--color-orange)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <RefreshCw size={48} color="var(--color-dark-green)" />
        </motion.div>
        <p style={{ marginTop: '16px', color: '#64748b', fontWeight: '500' }}>Fetching fresh Mailchimp analytics...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header & Sync */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#1e293b', marginBottom: '4px' }}>Email Analytics</h1>
          <p style={{ color: '#64748b' }}>Direct Mailchimp integration with MPP-adjusted human engagement tracking.</p>
        </div>
        <button 
          onClick={() => fetchEmailData(true)}
          disabled={syncing}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            backgroundColor: syncing ? '#e2e8f0' : 'var(--color-dark-green)', 
            color: syncing ? '#94a3b8' : 'white',
            padding: '10px 20px',
            borderRadius: '10px',
            border: 'none',
            fontWeight: '600',
            cursor: syncing ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
          }}
        >
          <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Mailchimp'}
        </button>
      </div>

      {/* Anomaly Alerts */}
      <AnimatePresence>
        {data.anomalies.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '12px',
              padding: '20px', 
              backgroundColor: '#fff7ed', 
              border: '1px solid #fed7aa', 
              borderRadius: '16px' 
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9a3412', fontWeight: '700' }}>
              <AlertTriangle size={20} />
              Anomaly Detection Alerts
            </div>
            {data.anomalies.map((alert, idx) => (
              <div key={idx} style={{ 
                backgroundColor: 'white', 
                padding: '12px 16px', 
                borderRadius: '8px', 
                borderLeft: '4px solid #f97316',
                fontSize: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: '700' }}>{alert.group} Campaign: {alert.type}</span>
                </div>
                <p style={{ color: '#4b5563', marginBottom: '8px' }}>{alert.message}</p>
                {alert.diagnosis && (
                  <div style={{ display: 'flex', gap: '8px', backgroundColor: '#f8fafc', padding: '8px', borderRadius: '6px', fontSize: '12px', color: '#64748b' }}>
                    <Info size={14} />
                    <span><strong>Diagnosis:</strong> {alert.diagnosis}</span>
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content - Two Streams */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '32px' }}>
        
        {/* Tuesday Stream */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Mail color="var(--color-dark-green)" size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700' }}>Tuesday Group Campaign</h2>
              <p style={{ fontSize: '13px', color: '#64748b' }}>Recurring Tuesday audience stream.</p>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '20px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Human Open Rate vs CTR Trend</h3>
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--color-dark-green)' }} /> Open</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--color-orange)' }} /> CTR</span>
              </div>
            </div>
            {renderTrendChart(data.tuesday, 'var(--color-dark-green)')}
          </div>

          <h3 style={{ fontSize: '15px', fontWeight: '700', marginTop: '8px' }}>Last 8 Sends</h3>
          {renderMetricTable(data.tuesday)}
        </div>

        {/* Thursday Stream */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Mail color="#2563eb" size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700' }}>Thursday Group Campaign</h2>
              <p style={{ fontSize: '13px', color: '#64748b' }}>Recurring Thursday audience stream.</p>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '20px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Human Open Rate vs CTR Trend</h3>
                <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#2563eb' }} /> Open</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--color-orange)' }} /> CTR</span>
              </div>
            </div>
            {renderTrendChart(data.thursday, '#2563eb')}
          </div>

          <h3 style={{ fontSize: '15px', fontWeight: '700', marginTop: '8px' }}>Last 8 Sends</h3>
          {renderMetricTable(data.thursday)}
        </div>

      </div>

      {/* Definition Footer */}
      <div style={{ 
        marginTop: '32px', 
        padding: '24px', 
        backgroundColor: '#f8fafc', 
        borderRadius: '16px', 
        border: '1px solid var(--color-border)',
        fontSize: '13px',
        color: '#64748b',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '24px'
      }}>
        <div>
          <strong style={{ color: '#1e293b', display: 'block', marginBottom: '8px' }}>Open Rate (Human)</strong>
          Excludes bot-triggered Apple MPP auto-opens. Calculated as (Unique Opens - Est. MPP) / Delivered. This is the primary accuracy metric.
        </div>
        <div>
          <strong style={{ color: '#1e293b', display: 'block', marginBottom: '8px' }}>Click-Through Rate (CTR)</strong>
          Unique Clicks / Total Delivered. Typically 1-4%. Shows overall list engagement.
        </div>
        <div>
          <strong style={{ color: '#1e293b', display: 'block', marginBottom: '8px' }}>Click-to-Open Rate (CTOR)</strong>
          Unique Clicks / Unique Opens. Shows content quality for those who actually opened the email.
        </div>
      </div>
    </div>
  );
};

export default EmailDashboard;
