import React from 'react';
import { Bell, Search, Settings, User } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const Header = ({ activeTab }) => {
  return (
    <header style={{
      height: '70px',
      backgroundColor: 'white',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px'
    }}>
      <div>
        <h2 style={{ fontSize: '18px', color: 'var(--color-text-primary)' }}>{activeTab} Overview</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
          <span>Home</span>
          <span>/</span>
          <span style={{ color: 'var(--color-dark-green)' }}>{activeTab}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ 
          position: 'relative',
          display: 'flex',
          alignItems: 'center'
        }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', color: '#94a3b8' }} />
          <input 
            type="text" 
            placeholder="Search KPIs..." 
            style={{
              padding: '10px 12px 10px 40px',
              borderRadius: '20px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              fontSize: '14px',
              width: '240px',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={async () => {
              const { data, error } = await supabase.functions.invoke('master-sync', {
                queryString: { trigger_refresh: 'true' }
              });
              if (error) alert('Error refreshing data: ' + error.message);
              else alert('Data refresh initiated!');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 16px',
              borderRadius: '20px',
              backgroundColor: 'var(--color-dark-green)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            <Bell size={18} />
            <span>Refresh Data</span>
          </button>
          <button style={{ padding: '8px', borderRadius: '50%', color: '#64748b', border: 'none', background: 'none' }}><Settings size={20} /></button>
          <div style={{ 
            width: '1px', 
            height: '24px', 
            backgroundColor: '#e2e8f0',
            margin: '0 8px'
          }}></div>
          <button style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            borderRadius: '20px',
            backgroundColor: '#f1f5f9',
            border: '1px solid #e2e8f0'
          }}>
            <User size={18} />
            <span style={{ fontSize: '14px', fontWeight: '500' }}>Profile</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
