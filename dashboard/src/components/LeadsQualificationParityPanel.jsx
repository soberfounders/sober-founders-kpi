import React, { useMemo } from 'react';

const cardStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '12px',
  backgroundColor: '#fff',
};

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmtInt(value) {
  const n = toNumberOrNull(value);
  return n === null ? 'N/A' : Math.round(n).toLocaleString();
}

export default function LeadsQualificationParityPanel({ data, isLoading = false }) {
  const normalized = useMemo(() => {
    const qualifiedCount = toNumberOrNull(data?.qualified_count);
    const goodCount = toNumberOrNull(data?.good_count);
    const greatCount = toNumberOrNull(data?.great_count);
    const revenueEligible = toNumberOrNull(data?.revenue_eligible_count);

    let qualifiedMinusEligible = toNumberOrNull(data?.qualified_quality_parity_delta);
    const computedEligible = (
      revenueEligible !== null
        ? revenueEligible
        : (goodCount !== null && greatCount !== null ? goodCount + greatCount : null)
    );
    if (qualifiedMinusEligible === null && qualifiedCount !== null && computedEligible !== null) {
      qualifiedMinusEligible = qualifiedCount - computedEligible;
    }
    let sobrietyGap = toNumberOrNull(data?.qualified_sobriety_gap_count);
    if (sobrietyGap === null && qualifiedCount !== null && computedEligible !== null) {
      sobrietyGap = Math.max(computedEligible - qualifiedCount, 0);
    }

    return {
      qualified_count: qualifiedCount,
      good_count: goodCount,
      great_count: greatCount,
      revenue_eligible_count: computedEligible,
      qualified_minus_revenue_eligible: qualifiedMinusEligible,
      qualified_sobriety_gap_count: sobrietyGap,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div style={{ ...cardStyle, backgroundColor: '#f8fafc' }}>
        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Loading qualification rule check...</p>
      </div>
    );
  }

  const hasAnyValue = normalized.qualified_count !== null
    || normalized.good_count !== null
    || normalized.great_count !== null
    || normalized.revenue_eligible_count !== null
    || normalized.qualified_sobriety_gap_count !== null;
  const hasAboveEligible = normalized.qualified_minus_revenue_eligible !== null && normalized.qualified_minus_revenue_eligible > 0;
  const hasSobrietyGap = normalized.qualified_sobriety_gap_count !== null && normalized.qualified_sobriety_gap_count > 0;
  const statusStyle = hasSobrietyGap
      ? { bg: '#ffedd5', color: '#9a3412', border: '#fdba74', label: 'SOBRIETY GATE' }
      : { bg: '#dcfce7', color: '#166534', border: '#86efac', label: 'RULE APPLIED' };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
          Qualification Rule Check
        </p>
        <span
          style={{
            borderRadius: '999px',
            padding: '3px 8px',
            fontSize: '11px',
            fontWeight: 700,
            backgroundColor: statusStyle.bg,
            color: statusStyle.color,
            border: `1px solid ${statusStyle.border}`,
          }}
        >
          {statusStyle.label}
        </span>
      </div>

      {!hasAnyValue && (
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>
          Qualification rule values are not available yet.
        </p>
      )}

      {hasAnyValue && (
        <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '8px' }}>
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>$250k Qualified</p>
            <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{fmtInt(normalized.qualified_count)}</p>
          </div>
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Good</p>
            <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{fmtInt(normalized.good_count)}</p>
          </div>
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Great</p>
            <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{fmtInt(normalized.great_count)}</p>
          </div>
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Revenue Eligible</p>
            <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
              {fmtInt(normalized.revenue_eligible_count)}
            </p>
          </div>
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Sobriety Gate Gap</p>
            <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 800, color: hasSobrietyGap ? '#9a3412' : '#166534' }}>
              {fmtInt(normalized.qualified_sobriety_gap_count)}
            </p>
          </div>
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>$250k Qualified - Eligible</p>
            <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 800, color: hasAboveEligible ? '#9a3412' : '#166534' }}>
              {fmtInt(normalized.qualified_minus_revenue_eligible)}
            </p>
          </div>
        </div>
      )}

      {hasAboveEligible && (
        <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#9a3412', fontWeight: 700 }}>
          Qualified and Good/Great can diverge; review revenue mapping if this stays positive.
        </p>
      )}
      {!hasAboveEligible && hasSobrietyGap && (
        <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#9a3412', fontWeight: 700 }}>
          Gap shows revenue-eligible leads that do not yet meet the 1-year sobriety rule.
        </p>
      )}
    </div>
  );
}
