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
  Globe,
  Search,
  Bot,
  Gift,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';

const sidebarItems = [
  { id: 'Dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'Attendance', icon: Calendar, label: 'Attendance' },
  { id: 'Leads', icon: Users, label: 'Leads' },
  { id: 'Email', icon: Mail, label: 'Email' },
  { id: 'Website Traffic', icon: Globe, label: 'Website Traffic' },
  { id: 'SEO', icon: Search, label: 'SEO Expert' },
  { id: 'Donations', icon: Gift, label: 'Donations' },
  { id: 'Marketing', icon: Megaphone, label: 'Marketing' },
  { id: 'Sales', icon: TrendingUp, label: 'Sales' },
  { id: 'Revenue', icon: DollarSign, label: 'Revenue' },
  { id: 'Operations', icon: Briefcase, label: 'Operations' },
  { id: 'To-Do\'s', icon: CheckSquare, label: 'To-Do\'s' },
  { id: 'Analysis', icon: BarChart2, label: 'Analysis' },
  { id: 'AI Manager', icon: Bot, label: 'AI Manager' },
  { id: 'Data Integrity', icon: Database, label: 'Data Integrity' },
];

const Sidebar = ({
  activeTab,
  setActiveTab,
  isMobile = false,
  isOpen = true,
  isCollapsed = false,
  onToggleCollapse = () => {},
  onClose = () => {},
}) => {
  const showLabels = isMobile || !isCollapsed;
  const sidebarWidth = isMobile ? 280 : (isCollapsed ? 88 : 260);

  const sidebarStyle = {
    width: `${sidebarWidth}px`,
    backgroundColor: 'var(--color-sidebar)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'width 0.2s ease, transform 0.25s ease',
    ...(isMobile ? {
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      zIndex: 1001,
      transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
      boxShadow: '0 20px 40px rgba(15, 23, 42, 0.2)',
      pointerEvents: isOpen ? 'auto' : 'none',
    } : {}),
  };

  const handleItemClick = (tabId) => {
    setActiveTab(tabId);
    if (isMobile) onClose();
  };

  return (
    <>
      {isMobile && isOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            border: 'none',
            zIndex: 1000,
          }}
        />
      )}

      <aside style={sidebarStyle}>
        <div style={{ padding: showLabels ? '16px 20px 24px' : '12px 12px 24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: showLabels ? 'space-between' : 'center',
              gap: '12px',
            }}
          >
            {showLabels ? (
              <div style={{ minWidth: 0 }}>
                <h1 style={{
                  color: 'var(--color-dark-green)',
                  fontSize: '24px',
                  letterSpacing: '-0.5px',
                }}>
                  Sober Founders
                </h1>
                <p className="tagline" style={{
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                  marginTop: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}>
                  KPI Dashboard
                </p>
              </div>
            ) : (
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                backgroundColor: '#ecfeff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-dark-green)',
                fontWeight: 700,
              }}>
                SF
              </div>
            )}

            <button
              type="button"
              onClick={isMobile ? onClose : onToggleCollapse}
              aria-label={isMobile ? 'Close navigation menu' : (isCollapsed ? 'Expand sidebar' : 'Collapse sidebar')}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                backgroundColor: '#fff',
                color: 'var(--color-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {isMobile ? <X size={16} /> : (isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />)}
            </button>
          </div>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto' }}>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <li key={item.id} style={{ padding: '0 12px' }}>
                  <motion.button
                    whileHover={showLabels ? { x: 4 } : { scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleItemClick(item.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: showLabels ? 'flex-start' : 'center',
                      gap: showLabels ? '12px' : 0,
                      padding: showLabels ? '12px 16px' : '12px',
                      borderRadius: '8px',
                      color: isActive ? 'white' : 'var(--color-text-secondary)',
                      backgroundColor: isActive ? 'var(--color-dark-green)' : 'transparent',
                      fontSize: '14px',
                      fontWeight: isActive ? '600' : '500',
                      transition: 'background-color 0.2s, color 0.2s',
                      textAlign: 'left',
                    }}
                  >
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                    {showLabels && item.label}
                  </motion.button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div style={{ padding: showLabels ? '24px' : '16px 12px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: showLabels ? 'flex-start' : 'center',
            gap: '12px',
            padding: '12px',
            backgroundColor: '#f1f5f9',
            borderRadius: '12px',
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
              fontSize: '14px',
            }}>
              SF
            </div>
            {showLabels && (
              <div>
                <p style={{ fontSize: '13px', fontWeight: '600' }}>Admin Account</p>
                <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Premium Access</p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
