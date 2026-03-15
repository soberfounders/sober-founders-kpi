import React from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Megaphone,
  Mail,
  Calendar,
  Globe,
  Bot,
  Gift,
  Send,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';

const sidebarItems = [
  { id: 'Dashboard',        icon: LayoutDashboard, label: 'Dashboard',         path: '/' },
  { id: 'Attendance',       icon: Calendar,        label: 'Attendance',        path: '/attendance' },
  { id: 'Leads',            icon: Users,           label: 'Leads',             path: '/leads' },
  { id: 'Email',            icon: Mail,            label: 'Email',             path: '/email' },
  { id: 'Online Discovery', icon: Globe,           label: 'Online Discovery',  path: '/online-discovery' },
  { id: 'Donations',        icon: Gift,            label: 'Donations',         path: '/donations' },
  { id: 'Marketing',        icon: Megaphone,       label: 'Marketing',         path: '/marketing' },
  { id: 'Outreach',         icon: Send,            label: 'Outreach',          path: '/outreach' },
  { id: "To-Do's",          icon: CheckSquare,     label: "To-Do's",           path: '/todos' },
  { id: 'AI Manager',       icon: Bot,             label: 'Board of Directors', path: '/ai-manager' },
];

const Sidebar = ({
  activeTab,
  isMobile = false,
  isOpen = true,
  isCollapsed = false,
  onToggleCollapse = () => { },
  onClose = () => { },
  onNavigate = () => { },
}) => {
  const showLabels = isMobile || !isCollapsed;
  const sidebarWidth = isMobile ? 280 : (isCollapsed ? 88 : 260);

  const sidebarStyle = {
    width: `${sidebarWidth}px`,
    backgroundColor: 'var(--color-sidebar)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'width 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
    zIndex: 100,
    ...(isMobile ? {
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      zIndex: 1001,
      transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
      pointerEvents: isOpen ? 'auto' : 'none',
    } : {}),
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
                  textShadow: '0 0 15px var(--color-brand-glow)',
                  fontSize: '24px',
                  letterSpacing: '0.02em',
                }}>
                  Sober Founders
                </h1>
                <p className="tagline" style={{
                  fontSize: '11px',
                  color: 'var(--color-text-secondary)',
                  marginTop: '4px',
                }}>
                  KPI Dashboard
                </p>
              </div>
            ) : (
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(3, 218, 198, 0.2) 0%, rgba(3, 218, 198, 0.05) 100%)',
                border: '1px solid var(--color-border-glow)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-dark-green)',
                fontWeight: 700,
                textShadow: '0 0 10px var(--color-brand-glow)',
              }}>
                SF
              </div>
            )}

            <button
              className="btn-glass"
              type="button"
              onClick={isMobile ? onClose : onToggleCollapse}
              aria-label={isMobile ? 'Close navigation menu' : (isCollapsed ? 'Expand sidebar' : 'Collapse sidebar')}
              style={{
                width: '32px',
                height: '32px',
                padding: 0,
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
                  <Link
                    to={item.path}
                    onClick={onNavigate}
                    style={{ textDecoration: 'none' }}
                  >
                    <motion.div
                      whileHover={showLabels ? { x: 4 } : { scale: 1.03 }}
                      whileTap={{ scale: 0.98 }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: showLabels ? 'flex-start' : 'center',
                        gap: showLabels ? '12px' : 0,
                        padding: showLabels ? '12px 16px' : '12px',
                        borderRadius: '10px',
                        color: isActive ? '#0a0f18' : 'var(--color-text-secondary)',
                        background: isActive
                          ? 'linear-gradient(135deg, var(--color-dark-green) 0%, var(--color-light-green) 100%)'
                          : 'transparent',
                        boxShadow: isActive ? '0 4px 15px var(--color-brand-glow)' : 'none',
                        fontSize: '14px',
                        fontWeight: isActive ? '700' : '500',
                        transition: 'all 0.2s',
                        textAlign: 'left',
                      }}
                    >
                      <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                      {showLabels && item.label}
                    </motion.div>
                  </Link>
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
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.1)',
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-orange) 0%, #ff5722 100%)',
              boxShadow: '0 2px 10px rgba(255, 152, 0, 0.3)',
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
                <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' }}>Admin Account</p>
                <p style={{ fontSize: '11px', color: 'var(--color-dark-green)' }}>Premium Access</p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
