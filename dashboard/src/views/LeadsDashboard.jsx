import React from 'react';
import KPICard from '../components/KPICard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const chartData = [
  { name: 'Bad Leads', value: 8, color: '#ef4444' },
  { name: 'Medium Leads', value: 15, color: '#f59e0b' },
  { name: 'Good Leads', value: 5, color: 'var(--color-light-green)' },
  { name: 'Great Leads', value: 13, color: 'var(--color-dark-green)' },
];

const LeadsDashboard = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
        <KPICard 
          title="Leads Created (Last Week)" 
          value="41" 
          trend="up" 
          trendValue="24%" 
          color="var(--color-dark-green)"
        />
        <KPICard 
          title="Qualified Leads" 
          value="18" 
          trend="up" 
          trendValue="15%" 
          color="var(--color-light-green)"
        />
        <KPICard 
          title="Cost per Lead" 
          value="$26.03" 
          trend="down" 
          trendValue="8%" 
          color="var(--color-orange)"
        />
        <KPICard 
          title="Cost per Qual. Lead" 
          value="$59.28" 
          trend="down" 
          trendValue="12%" 
          color="#1e293b"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '24px' }}>Weekly Leads Breakdown</h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '24px' }}>Lead Quality Distribution</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {chartData.map((item) => (
              <div key={item.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>{item.name}</span>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>{item.value}</span>
                </div>
                <div style={{ height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    width: `${(item.value / 41) * 100}%`, 
                    backgroundColor: item.color,
                    borderRadius: '4px'
                  }}></div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '32px', padding: '16px', backgroundColor: 'var(--color-bg)', borderRadius: '12px' }}>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>Insight:</strong> Great Leads make up 31% of total leads this week, showing high quality traffic from current campaigns.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadsDashboard;
