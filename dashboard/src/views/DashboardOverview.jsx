import React, { useEffect, useState } from 'react';
import KPICard from '../components/KPICard';
import { supabase } from '../lib/supabaseClient';
import { 
  Users, 
  MessageSquare, 
  UserPlus, 
  DollarSign, 
  MousePointer2, 
  Target 
} from 'lucide-react';

const mockData = [
  { name: 'Jan', value: 400 },
  { name: 'Feb', value: 300 },
  { name: 'Mar', value: 600 },
  { name: 'Apr', value: 800 },
  { name: 'May', value: 500 },
  { name: 'Jun', value: 900 },
];

const DashboardOverview = () => {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState([]);

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('kpi_metrics')
        .select('*')
        .order('metric_date', { ascending: false });
      
      if (!error && data) {
        setMetrics(data);
      }
      setLoading(false);
    };

    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--color-dark-green)' }}>
        <p style={{ fontSize: '18px', fontWeight: '600' }}>Loading KPI Data...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Top Section: Quick Stats */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: '24px' 
      }}>
        {metrics.slice(0, 3).map((metric, idx) => (
          <KPICard 
            key={metric.id || idx}
            title={metric.metric_name} 
            value={metric.metric_value.toLocaleString()} 
            subvalue={`Source: ${metric.source_slug}`}
            trend={metric.metadata?.trend || 'up'}
            trendValue={metric.metadata?.trend_value || '0%'}
            color={idx === 1 ? 'var(--color-orange)' : idx === 2 ? 'var(--color-light-green)' : 'var(--color-dark-green)'}
            chartData={mockData}
          />
        ))}
        {metrics.length === 0 && (
          <p style={{ color: 'var(--color-text-secondary)' }}>No metrics found. Click "Refresh Data" to pull latest.</p>
        )}
      </div>

      {/* Middle Section: More Detailed KPIs */}
      <h3 style={{ fontSize: '20px', marginBottom: '-8px' }}>Performance Metrics</h3>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '24px' 
      }}>
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ backgroundColor: '#f0fdf4', color: '#16a34a', padding: '8px', borderRadius: '10px' }}><DollarSign size={20} /></div>
            <p style={{ fontWeight: '600', fontSize: '15px' }}>Donations</p>
          </div>
          <h4 style={{ fontSize: '24px', color: 'var(--color-dark-green)' }}>$250.00</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '700' }}>+15%</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>from last month</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ backgroundColor: '#fff7ed', color: '#ea580c', padding: '8px', borderRadius: '10px' }}><MousePointer2 size={20} /></div>
            <p style={{ fontWeight: '600', fontSize: '15px' }}>Ad Spend (last week)</p>
          </div>
          <h4 style={{ fontSize: '24px', color: 'var(--color-orange)' }}>$1,067.03</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: '700' }}>+53%</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Increase in spend</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ backgroundColor: '#eff6ff', color: '#2563eb', padding: '8px', borderRadius: '10px' }}><Target size={20} /></div>
            <p style={{ fontWeight: '600', fontSize: '15px' }}>Cost per Lead</p>
          </div>
          <h4 style={{ fontSize: '24px' }}>$26.03</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '700' }}>-12%</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Efficiency improved</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ backgroundColor: '#fdf2f8', color: '#db2777', padding: '8px', borderRadius: '10px' }}><UserPlus size={20} /></div>
            <p style={{ fontWeight: '600', fontSize: '15px' }}>Phoenix Interviews</p>
          </div>
          <h4 style={{ fontSize: '24px' }}>1</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>Stable</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Weekly average</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardOverview;
