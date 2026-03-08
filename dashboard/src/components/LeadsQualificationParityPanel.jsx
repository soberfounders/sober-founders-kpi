import React, { useMemo } from 'react';

const cardStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '12px',
  backgroundColor: '#fff',
};

function toNumberOrNull(value) {
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

    let delta = toNumberOrNull(data?.qualified_quality_parity_delta);
    if (delta === null && qualifiedCount !== null && goodCount !== null && greatCount !== null) {
      delta = qualifiedCount - (goodCount + greatCount);
    }

    return {
      qualified_count: qualifiedCount,
      good_count: goodCount,
      great_count: greatCount,
      qualified_quality_parity_delta: delta,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div style={{ ...cardStyle, backgroundColor: '#f8fafc' }}>
        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Loading qualification parity...</p>
      </div>
    );
  }

  const hasAnyValue = normalized.qualified_count !== null
    || normalized.good_count !== null
    || normalized.great_count !== null
    || normalized.qualified_quality_parity_delta !== null;
  const hasMismatch = normalized.qualified_quality_parity_delta !== null && normalized.qualified_quality_parity_delta !== 0;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
          Qualification Parity
        </p>
        <span
          style={{
            borderRadius: '999px',
            padding: '3px 8px',
            fontSize: '11px',
            fontWeight: 700,
            backgroundColor: hasMismatch ? '#fee2e2' : '#dcfce7',
            color: hasMismatch ? '#991b1b' : '#166534',
            border: `1px solid ${hasMismatch ? '#fca5a5' : '#86efac'}`,
          }}
        >
          {hasMismatch ? 'MISMATCH' : 'IN SYNC'}
        </span>
      </div>

      {!hasAnyValue && (
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>
          Qualification parity values are not available yet.
        </p>
      )}

      {hasAnyValue && (
        <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '8px' }}>
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Qualified</p>
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
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Delta</p>
            <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 800, color: hasMismatch ? '#991b1b' : '#166534' }}>
              {fmtInt(normalized.qualified_quality_parity_delta)}
            </p>
          </div>
        </div>
      )}

      {hasMismatch && (
        <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#991b1b', fontWeight: 700 }}>
          Qualified parity mismatch: Qualified should equal Good + Great
        </p>
      )}
    </div>
  );
}
