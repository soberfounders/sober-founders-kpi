import React, { useState } from 'react';
import KPICard from '../components/KPICard';
import { 
  Mail, 
  Send, 
  UserCheck, 
  MousePointer2, 
  TrendingUp,
  BarChart2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const subscriberData = [
  { name: 'Mon', value: 2100 },
  { name: 'Tue', value: 2150 },
  { name: 'Wed', value: 2140 },
  { name: 'Thu', value: 2180 },
  { name: 'Fri', value: 2210 },
  { name: 'Sat', value: 2250 },
  { name: 'Sun', value: 2295 },
];

const campaignData = [
  { name: 'Newsletter #42', opens: 42, clicks: 12, sent: 'Feb 15' },
  { name: 'Weekly Update', opens: 38, clicks: 8, sent: 'Feb 08' },
  { name: 'Event Alert', opens: 55, clicks: 22, sent: 'Feb 01' },
];

const EmailDashboard = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Overview Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '24px' 
      }}>
        <KPICard 
          title="Total Subscribers" 
          value="2,295" 
          subvalue="+45 this week"
          trend="up"
          trendValue="2.1%"
          color="var(--color-dark-green)"
        />
        <KPICard 
          title="Avg. Open Rate" 
          value="45.2%" 
          subvalue="Industry avg: 21.3%"
          trend="up"
          trendValue="4.5%"
          color="var(--color-light-green)"
        />
        <KPICard 
          title="Avg. Click Rate" 
          value="12.8%" 
          subvalue="Target: 10%"
          trend="up"
          trendValue="1.2%"
          color="var(--color-orange)"
        />
        <KPICard 
          title="Unsubscribe Rate" 
          value="0.2%" 
          subvalue="Healthy < 0.5%"
          trend="down"
          trendValue="0.05%"
          color="#1e293b"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
        {/* Subscriber Growth Chart */}
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Subscriber Growth</h3>
            <div style={{ backgroundColor: '#f0fdf4', color: '#16a34a', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>
              +8.4% Monthly
            </div>
          </div>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={subscriberData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} domain={['dataMin - 50', 'dataMax + 50']} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="var(--color-dark-green)" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: 'var(--color-dark-green)' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Campaigns */}
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '24px' }}>Recent Campaigns</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {campaignData.map((campaign, idx) => (
              <div key={idx} style={{ 
                padding: '16px', 
                borderRadius: '12px', 
                backgroundColor: '#f8fafc',
                border: '1px solid #f1f5f9'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '600', fontSize: '14px' }}>{campaign.name}</span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>{campaign.sent}</span>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Mail size={14} color="#64748b" />
                    <span style={{ fontSize: '13px', fontWeight: '500' }}>{campaign.opens}% opens</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MousePointer2 size={14} color="#64748b" />
                    <span style={{ fontSize: '13px', fontWeight: '500' }}>{campaign.clicks}% clicks</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button style={{ 
            width: '100%', 
            marginTop: '24px', 
            padding: '10px', 
            backgroundColor: 'transparent', 
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}>
            View All Reports
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailDashboard;
