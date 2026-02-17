import React from 'react';
import KPICard from '../components/KPICard';
import { 
  Mail, 
  Send, 
  MousePointer2, 
  UserMinus, 
  BarChart, 
  PieChart as PieChartIcon 
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart as ReBarChart,
  Bar,
  Cell
} from 'recharts';

const mockChartData = [
  { name: 'Mon', sent: 1200, opens: 450, clicks: 80 },
  { name: 'Tue', sent: 2100, opens: 890, clicks: 120 },
  { name: 'Wed', sent: 1800, opens: 720, clicks: 95 },
  { name: 'Thu', sent: 2400, opens: 1100, clicks: 180 },
  { name: 'Fri', sent: 1900, opens: 780, clicks: 110 },
  { name: 'Sat', sent: 1500, opens: 600, clicks: 75 },
  { name: 'Sun', sent: 2800, opens: 1350, clicks: 240 },
];

const EmailMarketingDashboard = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
        <KPICard 
          title="Total Sent" 
          value="15,700" 
          trend="up" 
          trendValue="12%" 
          color="var(--color-dark-green)"
          chartData={mockChartData.map(d => ({ name: d.name, value: d.sent }))}
        />
        <KPICard 
          title="Avg. Open Rate" 
          value="42.5%" 
          trend="up" 
          trendValue="3.2%" 
          color="var(--color-light-green)"
          chartData={mockChartData.map(d => ({ name: d.name, value: d.opens }))}
        />
        <KPICard 
          title="Avg. Click Rate" 
          value="8.4%" 
          trend="up" 
          trendValue="1.5%" 
          color="var(--color-orange)"
          chartData={mockChartData.map(d => ({ name: d.name, value: d.clicks }))}
        />
        <KPICard 
          title="Unsubscribes" 
          value="24" 
          trend="down" 
          trendValue="5%" 
          color="#1e293b"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '24px' }}>Engagement Trends</h3>
          <div style={{ height: '350px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Line type="monotone" dataKey="sent" stroke="var(--color-dark-green)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="opens" stroke="var(--color-light-green)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="clicks" stroke="var(--color-orange)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', border: '1px solid var(--color-border)', flex: 1 }}>
            <h3 style={{ fontSize: '18px', marginBottom: '20px' }}>Campaign Performance</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)', backgroundColor: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>Weekly Newsletter #42</span>
                  <span style={{ fontSize: '12px', color: 'var(--color-dark-green)', fontWeight: '700' }}>Active</span>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div><p style={{ fontSize: '10px', color: '#64748b' }}>Opens</p><p style={{ fontSize: '14px', fontWeight: '700' }}>1,240</p></div>
                  <div><p style={{ fontSize: '10px', color: '#64748b' }}>Clicks</p><p style={{ fontSize: '14px', fontWeight: '700' }}>280</p></div>
                  <div><p style={{ fontSize: '10px', color: '#64748b' }}>CTR</p><p style={{ fontSize: '14px', fontWeight: '700' }}>22.5%</p></div>
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>Onboarding Series 1</span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Completed</span>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div><p style={{ fontSize: '10px', color: '#64748b' }}>Opens</p><p style={{ fontSize: '14px', fontWeight: '700' }}>890</p></div>
                  <div><p style={{ fontSize: '10px', color: '#64748b' }}>Clicks</p><p style={{ fontSize: '14px', fontWeight: '700' }}>115</p></div>
                  <div><p style={{ fontSize: '10px', color: '#64748b' }}>CTR</p><p style={{ fontSize: '14px', fontWeight: '700' }}>12.9%</p></div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--color-dark-green)', padding: '24px', borderRadius: '16px', color: 'white' }}>
            <h4 style={{ fontSize: '16px', marginBottom: '12px' }}>Marketing Insight</h4>
            <p style={{ fontSize: '14px', opacity: 0.9, lineHeight: '1.6' }}>
              Your "Sunday Round-up" campaign had the highest engagement this month. Consider moving future key updates to Sunday afternoons to maximize visibility.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailMarketingDashboard;
