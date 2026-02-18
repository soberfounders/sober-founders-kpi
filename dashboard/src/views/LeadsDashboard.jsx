import React, { useEffect, useState } from 'react';
import KPICard from '../components/KPICard';
import AIAnalysisCard from '../components/AIAnalysisCard';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { supabase } from '../lib/supabaseClient';

const LeadsDashboard = () => {
  const [metrics, setMetrics] = useState({
    leads: 0,
    leadsFree: 0,
    leadsPhoenix: 0,
    spend: 0,
    spendFree: 0,
    spendPhoenix: 0,
    newShowUps: 0,
    newShowUpsTue: 0,
    newShowUpsThu: 0,
    costPerLead: 0,
    costPerLeadFree: 0,
    costPerLeadPhoenix: 0,
    costPerNewShowUp: 0,
    loading: true,
  });
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

      const { data: adsData, error: adsError } = await supabase
        .from('raw_fb_ads_insights_daily')
        .select('*')
        .gte('date_day', dateStr);

      if (adsError) throw adsError;

      const { data: metricsData, error: metricsError } = await supabase
        .from('kpi_metrics')
        .select('*')
        .in('metric_name', [
          'Zoom New Attendees', 
          'Zoom New Attendees - Tuesday', 
          'Zoom New Attendees - Thursday'
        ])
        .gte('metric_date', dateStr);

      if (metricsError) throw metricsError;

      let totalSpendFree = 0;
      let totalSpendPhoenix = 0;
      let totalLeadsFree = 0;
      let totalLeadsPhoenix = 0;
      let totalNewShowUps = 0;
      let totalNewShowUpsTue = 0;
      let totalNewShowUpsThu = 0;

      const dailyStats = {};

      (adsData || []).forEach((row) => {
        const isPhoenix = 
          row.ad_account_id === '1034775818463907' || 
          (row.campaign_name || '').toLowerCase().includes('phoenix') || 
          row.funnel_key === 'phoenix';
        const spend = Number(row.spend) || 0;
        const leads = Number(row.leads) || 0;

        if (isPhoenix) {
            totalSpendPhoenix += spend;
            totalLeadsPhoenix += leads;
        } else {
            totalSpendFree += spend;
            totalLeadsFree += leads;
        }

        const date = row.date_day;
        if (!dailyStats[date]) dailyStats[date] = { date, spendFree: 0, spendPhoenix: 0, leadsFree: 0, leadsPhoenix: 0, newShowUps: 0, newShowUpsTue: 0, newShowUpsThu: 0 };
        
        if (isPhoenix) {
            dailyStats[date].spendPhoenix += spend;
            dailyStats[date].leadsPhoenix += leads;
        } else {
            dailyStats[date].spendFree += spend;
            dailyStats[date].leadsFree += leads;
        }
      });

      (metricsData || []).forEach((row) => {
        const val = Number(row.metric_value) || 0;
        const date = row.metric_date;
        if (!dailyStats[date]) dailyStats[date] = { date, spendFree: 0, spendPhoenix: 0, leadsFree: 0, leadsPhoenix: 0, newShowUps: 0, newShowUpsTue: 0, newShowUpsThu: 0 };

        if (row.metric_name === 'Zoom New Attendees') {
            totalNewShowUps += val;
            dailyStats[date].newShowUps += val;
        } else if (row.metric_name === 'Zoom New Attendees - Tuesday') {
             totalNewShowUpsTue += val;
             dailyStats[date].newShowUpsTue += val;
        } else if (row.metric_name === 'Zoom New Attendees - Thursday') {
             totalNewShowUpsThu += val;
             dailyStats[date].newShowUpsThu += val;
        }
      });

      const chartDataArray = Object.values(dailyStats)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(d => ({
            ...d,
            costPerLeadFree: d.leadsFree > 0 ? d.spendFree / d.leadsFree : 0,
            costPerLeadPhoenix: d.leadsPhoenix > 0 ? d.spendPhoenix / d.leadsPhoenix : 0,
            // Free-group cost uses Tue + Thu new attendees (explicit business rule).
            costPerNewShowUp: (d.newShowUpsTue + d.newShowUpsThu) > 0
              ? d.spendFree / (d.newShowUpsTue + d.newShowUpsThu)
              : 0
        }));

      const totalLeads = totalLeadsFree + totalLeadsPhoenix;
      const totalSpend = totalSpendFree + totalSpendPhoenix;
      const totalTueThuNew = totalNewShowUpsTue + totalNewShowUpsThu;

      setMetrics({
        leads: totalLeads,
        leadsFree: totalLeadsFree,
        leadsPhoenix: totalLeadsPhoenix,
        spend: totalSpend,
        spendFree: totalSpendFree,
        spendPhoenix: totalSpendPhoenix,
        newShowUps: totalNewShowUps,
        newShowUpsTue: totalNewShowUpsTue,
        newShowUpsThu: totalNewShowUpsThu,
        costPerLead: totalLeads > 0 ? totalSpend / totalLeads : 0,
        costPerLeadFree: totalLeadsFree > 0 ? totalSpendFree / totalLeadsFree : 0,
        costPerLeadPhoenix: totalLeadsPhoenix > 0 ? totalSpendPhoenix / totalLeadsPhoenix : 0,
        costPerNewShowUp: totalTueThuNew > 0 ? totalSpendFree / totalTueThuNew : 0,
        loading: false,
      });
      setChartData(chartDataArray);
    } catch (error) {
      console.error('Error fetching leads data:', error);
      setMetrics((prev) => ({ ...prev, loading: false }));
    }
  }

  if (metrics.loading) return <div>Loading Leads Data...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <AIAnalysisCard metrics={metrics} trends={chartData} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
        <KPICard title="Free Leads" value={metrics.leadsFree.toLocaleString()} trend="neutral" color="var(--color-dark-green)" />
        <KPICard title="Phoenix Leads" value={metrics.leadsPhoenix.toLocaleString()} trend="neutral" color="#be185d" />
        <KPICard title="New Show Ups (Total)" value={metrics.newShowUps.toLocaleString()} trend="up" color="var(--color-light-green)" />
        <KPICard title="Tue Show Ups" value={metrics.newShowUpsTue.toLocaleString()} trend="neutral" color="#0369a1" />
        <KPICard title="Thu Show Ups" value={metrics.newShowUpsThu.toLocaleString()} trend="neutral" color="#0369a1" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
        <KPICard
          title="CPL (Free)"
          value={`$${metrics.costPerLeadFree.toFixed(2)}`}
          trend={metrics.costPerLeadFree < 30 ? 'up' : 'down'}
          color="var(--color-orange)"
        />
        <KPICard
          title="CPL (Phoenix)"
          value={`$${metrics.costPerLeadPhoenix.toFixed(2)}`}
          trend="neutral"
          color="#be185d"
        />
        <KPICard
          title="Cost per New Show Up"
          value={`$${metrics.costPerNewShowUp.toFixed(2)}`}
          trend="neutral"
          color="#1e293b"
        />
      </div>

      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
        <h3 style={{ fontSize: '18px', marginBottom: '24px' }}>Traffic & Attendance</h3>
        <div style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis yAxisId="left" orientation="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px' }} />
              <Legend />
              <Bar yAxisId="left" dataKey="leadsFree" name="Free Leads" fill="var(--color-dark-green)" stackId="a" />
              <Bar yAxisId="left" dataKey="leadsPhoenix" name="Phoenix Leads" fill="#be185d" stackId="a" />
              <Bar yAxisId="left" dataKey="newShowUpsTue" name="Tue Show Ups" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="left" dataKey="newShowUpsThu" name="Thu Show Ups" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="spendFree" name="Free Spend ($)" fill="var(--color-orange)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>


      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
        <h3 style={{ fontSize: '18px', marginBottom: '24px' }}>Cost Efficiency Trends</h3>
        <div style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis />
              <Tooltip
                cursor={{ stroke: '#cbd5e1' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
              />
              <Legend />
              <Line type="monotone" dataKey="costPerLeadFree" name="CPL Free ($)" stroke="var(--color-orange)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="costPerLeadPhoenix" name="CPL Phoenix ($)" stroke="#be185d" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="costPerNewShowUp" name="Cost per New Show Up ($)" stroke="#1e293b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default LeadsDashboard;
