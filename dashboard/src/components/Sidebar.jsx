import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  TrendingUp, 
  DollarSign, 
  Briefcase, 
  CheckSquare, 
  BarChart2, 
  Megaphone,
  Mail,
  Database,
  Calendar,
  Globe
} from 'lucide-react';
import { motion } from 'framer-motion';

const sidebarItems = [
  { id: 'Dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'Attendance', icon: Calendar, label: 'Attendance' },
  { id: 'Leads', icon: Users, label: 'Leads' },
  { id: 'Email', icon: Mail, label: 'Email' },
  { id: 'Website Traffic', icon: Globe, label: 'Website Traffic' },
  { id: 'Marketing', icon: Megaphone, label: 'Marketing' },
  { id: 'Sales', icon: TrendingUp, label: 'Sales' },
  { id: 'Revenue', icon: DollarSign, label: 'Revenue' },
  { id: 'Operations', icon: Briefcase, label: 'Operations' },
  { id: 'To-Do\'s', icon: CheckSquare, label: 'To-Do\'s' },
  { id: 'Analysis', icon: BarChart2, label: 'Analysis' },
  { id: 'Data Cleaning', icon: Database, label: 'Data Cleaning' },
];

const Sidebar = ({ activeTab, setActiveTab }) => {
  return (
    <div style={{
      width: '260px',
      backgroundColor: 'var(--color-sidebar)',
      borderRight: '1px solid var(--color-border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 0'
    }}>
      <div style={{ padding: '0 24px 32px 24px' }}>
        <h1 style={{ 
          color: 'var(--color-dark-green)', 
          fontSize: '24px',
          letterSpacing: '-0.5px'
        }}>
          Sober Founders
        </h1>
        <p className="tagline" style={{ 
          fontSize: '12px', 
          color: 'var(--color-text-secondary)',
          marginTop: '4px',
          textTransform: 'uppercase',
          letterSpacing: '1px'
        }}>
          KPI Dashboard
        </p>
      </div>

      <nav style={{ flex: 1 }}>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <li key={item.id} style={{ padding: '0 12px' }}>
                <motion.button
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    color: isActive ? 'white' : 'var(--color-text-secondary)',
                    backgroundColor: isActive ? 'var(--color-dark-green)' : 'transparent',
                    fontSize: '14px',
                    fontWeight: isActive ? '600' : '500',
                    transition: 'background-color 0.2s, color 0.2s',
                    textAlign: 'left'
                  }}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  {item.label}
                </motion.button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div style={{ padding: '24px', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          padding: '12px',
          backgroundColor: '#f1f5f9',
          borderRadius: '12px'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-orange)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px'
          }}>
            SF
          </div>
          <div>
            <p style={{ fontSize: '13px', fontWeight: '600' }}>Admin Account</p>
            <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Premium Access</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
