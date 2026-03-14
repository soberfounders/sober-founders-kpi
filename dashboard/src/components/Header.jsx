import React from 'react';
import { Bell, Menu, Search, Settings, User } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const Header = ({ activeTab, onMenuClick, isMobile = false }) => {
  const triggerRefresh = async () => {
    const { data, error } = await supabase.functions.invoke('master-sync', {
      method: 'GET',
      queryString: { trigger_refresh: 'true' },
    });

    if (error) {
      alert(`Data refresh failed: ${error.message || 'Unknown error'}`);
      return;
    }

    const failures = Array.isArray(data?.results)
      ? data.results.filter((row) => row?.status !== 'success' && row?.status !== 'skipped')
      : [];

    if (failures.length > 0) {
      alert(
        'Refresh completed with issues:\n' +
        failures
          .map((row) => `${row.source || row.function || 'sync'}: ${row.error || 'failed'}`)
          .join('\n'),
      );
    } else {
      alert('Data refresh completed: HubSpot contacts (revenue, sobriety date), calls/meetings, deals, Lu.ma, Meta ads, Google Analytics, and Search Console.');
    }
  };

  return (
    <header className="glass-panel" style={{
      height: isMobile ? '64px' : '70px',
      margin: isMobile ? '12px 12px 0 12px' : '24px 40px 0 40px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: isMobile ? '0 12px' : '0 24px',
      gap: '12px',
      zIndex: 50,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <button
          className="btn-glass"
          type="button"
          onClick={onMenuClick}
          aria-label="Toggle sidebar menu"
          style={{
            width: '36px',
            height: '36px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Menu size={18} />
        </button>

        <div style={{ minWidth: 0 }}>
          <h2 style={{
            fontSize: isMobile ? '16px' : '18px',
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          >
            {activeTab} Overview
          </h2>
          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              <span>Home</span>
              <span>/</span>
              <span style={{ color: 'var(--color-dark-green)' }}>{activeTab}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '20px' }}>
        {!isMobile && (
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', color: 'var(--color-text-muted)' }} />
            <input
              className="neo-input"
              type="text"
              placeholder="Search KPIs..."
              style={{
                paddingLeft: '40px',
                width: '280px',
                borderRadius: '20px',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={triggerRefresh}
            style={{
              padding: isMobile ? '8px' : '8px 18px',
              borderRadius: '20px',
              fontSize: '13px',
            }}
          >
            <Bell size={16} />
            {!isMobile && <span>Refresh Data</span>}
          </button>
          {!isMobile && (
            <>
              <button className="btn-glass" style={{ width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                <Settings size={18} />
              </button>
              <div style={{
                width: '1px',
                height: '24px',
                backgroundColor: 'var(--color-border)',
                margin: '0 8px',
              }}
              />
              <button className="btn-glass" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '20px',
              }}>
                <User size={16} />
                <span style={{ fontSize: '13px', fontWeight: '600' }}>Admin</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
