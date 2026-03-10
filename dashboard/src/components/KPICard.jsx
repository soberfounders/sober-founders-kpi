import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

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
  showChart = true,
}) => {
  const isUp = trend === 'up';
  const isDown = trend === 'down';
  const better = invertColor ? isDown : isUp;
  const worse = invertColor ? isUp : isDown;
  const hasChart = Boolean(showChart && chartData);
  const previousToneColor = previousTone === 'better'
    ? '#16a34a'
    : previousTone === 'worse'
      ? '#dc2626'
      : '#334155';

  return (
    <motion.div
      whileHover={{ y: -4, shadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
      style={{
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
                backgroundColor: better ? '#ecfdf5' : worse ? '#fef2f2' : '#f1f5f9',
                color: better ? '#10b981' : worse ? '#ef4444' : '#64748b'
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
