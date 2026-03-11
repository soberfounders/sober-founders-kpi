import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

// Single source of truth for better/worse/neutral semantic colors.
// All three rendering blocks (trend badge, previousTone, comparisonRows) use these.
const TONE = {
  better: { text: '#16a34a', bg: '#ecfdf5' },
  worse:  { text: '#dc2626', bg: '#fef2f2' },
  neutral: { text: '#64748b', bg: '#f1f5f9' },
};

const KPICard = ({
  title,
  value,
  subvalue,
  trend,
  trendValue,
  color,
  chartData,
  invertColor,
  previousValue,
  previousLabel = 'Previous',
  previousTone = 'neutral',
  comparisonRows = [],
  showChart = true,
}) => {
  const isUp = trend === 'up';
  const isDown = trend === 'down';
  const better = invertColor ? isDown : isUp;
  const worse = invertColor ? isUp : isDown;
  const hasChart = Boolean(showChart && chartData);
  const previousToneColor = (TONE[previousTone] ?? TONE.neutral).text;
  const renderComparisonRows = Array.isArray(comparisonRows) && comparisonRows.length > 0;

  return (
    <motion.div
      whileHover={{ y: -4, shadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
      style={{
        // Intentionally white: card text uses dark colors (#334155, #0f172a) that
        // require a light background. KPICard is a light-surface component placed
        // inside dark glass-panel sections to create a card-in-dark-panel effect.
        // If you need a transparent/dark card, pass a wrapping container instead.
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid var(--color-border)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: hasChart ? '180px' : '160px'
      }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>
              {title}
            </p>
            <h3 style={{ fontSize: '31px', color: '#0f172a', fontWeight: 800 }}>{value}</h3>
          </div>
          {trend && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '600',
                backgroundColor: better ? TONE.better.bg : worse ? TONE.worse.bg : TONE.neutral.bg,
                color: better ? TONE.better.text : worse ? TONE.worse.text : TONE.neutral.text
            }}>
              {isUp ? <TrendingUp size={14} /> : isDown ? <TrendingDown size={14} /> : <Minus size={14} />}
              {trendValue}
            </div>
          )}
        </div>
        {previousValue && (
          <p style={{ fontSize: '12px', color: previousToneColor, marginTop: '5px', fontWeight: 700 }}>
            {previousLabel}: {previousValue}
          </p>
        )}
        {subvalue && (
          <p style={{ fontSize: '12px', color: '#475569', marginTop: '4px', lineHeight: 1.3 }}>
            {subvalue}
          </p>
        )}
        {renderComparisonRows && (
          <div style={{ marginTop: '8px', display: 'grid', gap: '4px' }}>
            {comparisonRows.map((row) => {
              const toneColor = (TONE[row?.tone] ?? TONE.neutral).text;
              return (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px', lineHeight: 1.3 }}>
                  <span style={{ color: '#475569', fontWeight: 600 }}>{row.label}</span>
                  <span style={{ color: toneColor, fontWeight: 700 }}>{row.display}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ height: hasChart ? '50px' : '0px', width: '100%', marginLeft: '-4px', marginRight: '-4px', marginBottom: hasChart ? '-24px' : '0px' }}>
        {hasChart && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                fillOpacity={1}
                fill={`url(#gradient-${color})`}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
};

export default KPICard;
