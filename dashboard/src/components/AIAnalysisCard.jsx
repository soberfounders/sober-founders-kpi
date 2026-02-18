import React from 'react';

const AIAnalysisCard = ({ metrics }) => {
  const generateInsights = () => {
    const insights = [];
    const totalLeads = Number(
      metrics.leads ?? ((metrics.leadsFree || 0) + (metrics.leadsPhoenix || 0))
    );
    const totalSpend = Number(
      metrics.spend ?? ((metrics.spendFree || 0) + (metrics.spendPhoenix || 0))
    );
    const costPerLead = Number(
      metrics.costPerLead ?? (totalLeads > 0 ? totalSpend / totalLeads : 0)
    );
    const newShowUps = Number(metrics.newShowUps ?? 0);

    if (totalLeads === 0) {
      insights.push('No leads detected in the last 30 days. Check ad account connection.');
      return insights;
    }

    if (costPerLead > 50) {
      insights.push('Cost per Lead is high (>$50). Consider refining audience targeting or refreshing ad creatives.');
    } else if (costPerLead < 20) {
      insights.push('Cost per Lead is excellent (<$20). Consider scaling budget on winning ad sets.');
    }

    if (newShowUps === 0) {
      insights.push('No new show ups tracked. Verify Zoom integration.');
    } else {
      const conversionRate = (newShowUps / totalLeads) * 100;
      if (conversionRate < 10) {
        insights.push(`Lead to Show Up rate is low (${conversionRate.toFixed(1)}%). Consider improving email follow-up sequences.`);
      } else if (conversionRate > 30) {
        insights.push('Lead to Show Up rate is strong (>30%). Current nurture flow is effective.');
      }
    }

    return insights;
  };

  const insights = generateInsights();

  return (
    <div style={{ backgroundColor: '#f0f9ff', padding: '24px', borderRadius: '16px', border: '1px solid #bae6fd' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ backgroundColor: '#0ea5e9', padding: '8px', borderRadius: '8px', color: 'white' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
            <path d="M12 12 2.1 12a10.01 10.01 0 0 0 1.5 4.3L12 12z" />
            <path d="M12 12 6.4 19.1a10.01 10.01 0 0 0 5.6 1.9V12z" />
          </svg>
        </div>
        <h3 style={{ fontSize: '18px', color: '#0369a1', margin: 0 }}>AI Performance Analysis</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {insights.map((insight, index) => (
          <div key={index} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <span style={{ color: '#0ea5e9', marginTop: '4px' }}>*</span>
            <p style={{ margin: 0, color: '#0c4a6e', fontSize: '14px', lineHeight: '1.5' }}>{insight}</p>
          </div>
        ))}
        {insights.length === 0 && (
          <p style={{ margin: 0, color: '#0c4a6e', fontSize: '14px' }}>Performance is stable. No critical actions needed.</p>
        )}
      </div>
    </div>
  );
};

export default AIAnalysisCard;
