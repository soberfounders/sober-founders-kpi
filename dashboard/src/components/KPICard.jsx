import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

const KPICard = ({ title, value, subvalue, trend, trendValue, color, chartData, invertColor }) => {
  const isUp = trend === 'up';
  const isDown = trend === 'down';
  const better = invertColor ? isDown : isUp;
  const worse = invertColor ? isUp : isDown;

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
        height: '180px'
      }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
              {title}
            </p>
            <h3 style={{ fontSize: '28px', color: 'var(--color-text-primary)' }}>{value}</h3>
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
        {subvalue && (
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {subvalue}
          </p>
        )}
      </div>

      <div style={{ height: '50px', width: '100%', marginLeft: '-4px', marginRight: '-4px', marginBottom: '-24px' }}>
        {chartData && (
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
