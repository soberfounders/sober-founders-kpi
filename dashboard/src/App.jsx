import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardOverview from './views/DashboardOverview';
import LeadsDashboard from './views/LeadsDashboard';
import EmailDashboard from './views/EmailDashboard';
import TodosDashboard from './views/TodosDashboard';
import DataCleaning from './views/DataCleaning';
import AttendanceDashboard from './views/AttendanceDashboard';
import EmailMarketingDashboard from './views/EmailMarketingDashboard';
import WebsiteTrafficDashboard from './views/WebsiteTrafficDashboard';
import AIBriefingDashboard from './views/AIBriefingDashboard';
import DonationsDashboard from './views/DonationsDashboard';
import { hasSupabaseConfig, supabaseConfigError } from './lib/supabaseClient';

const TAB_PATHS = {
  Dashboard: '/dashboard',
  Attendance: '/attendance',
  Leads: '/leads',
  Email: '/email',
  'Website Traffic': '/website-traffic',
  SEO: '/seo',
  Donations: '/donations',
  Marketing: '/marketing',
  Sales: '/sales',
  Revenue: '/revenue',
  Operations: '/operations',
  "To-Do's": '/todos',
  Analysis: '/analysis',
  'AI Manager': '/ai-manager',
  'Data Integrity': '/data-integrity',
};

const PATH_TO_TAB = Object.entries(TAB_PATHS).reduce((acc, [tab, path]) => {
  acc[path] = tab;
  return acc;
}, {});

const ROUTE_ALIASES = {
  '/': TAB_PATHS.Dashboard,
  '/to-dos': TAB_PATHS["To-Do's"],
  '/todo': TAB_PATHS["To-Do's"],
  '/website': TAB_PATHS['Website Traffic'],
};

function normalizePathname(pathname = '') {
  const trimmed = String(pathname || '').trim();
  if (!trimmed) return '/';
  if (trimmed.length > 1 && trimmed.endsWith('/')) return trimmed.slice(0, -1).toLowerCase();
  return trimmed.toLowerCase();
}

function resolveTabFromPathname(pathname) {
  const normalizedPath = normalizePathname(pathname);
  const directPath = ROUTE_ALIASES[normalizedPath] || normalizedPath;
  return PATH_TO_TAB[directPath] || null;
}

function PlaceholderView({ tab }) {
  return (
    <div className="glass-panel page-transition-enter" style={{ padding: '32px', maxWidth: '760px', margin: '0 auto' }}>
      <p style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--color-dark-green)', fontWeight: 600, letterSpacing: '0.05em' }}>Module Placeholder</p>
      <h3 style={{ marginTop: '8px', fontSize: '24px', color: 'var(--color-text-primary)' }}>{tab}</h3>
      <p style={{ marginTop: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.6, fontSize: '15px' }}>
        This section does not have an implemented view yet. It is intentionally shown as a placeholder to avoid falling
        back to the Dashboard tab content.
      </p>
    </div>
  );
}

function SupabaseEnvRequiredView() {
  return (
    <div className="glass-panel page-transition-enter" style={{ padding: '32px', maxWidth: '920px', margin: '0 auto', border: '1px solid rgba(255,152,0,0.3)', boxShadow: '0 8px 32px rgba(255,152,0,0.1)' }}>
      <p style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--color-orange)', fontWeight: 600, letterSpacing: '0.05em' }}>Configuration Required</p>
      <h3 style={{ marginTop: '8px', fontSize: '24px', color: 'var(--color-text-primary)' }}>Supabase Environment Variables Missing</h3>
      <p style={{ marginTop: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.6, fontSize: '15px' }}>
        {supabaseConfigError || 'Set Supabase env vars in your deployment to load live KPI data.'}
      </p>
      <div style={{ marginTop: '16px', fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: 1.6, background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
        <p><strong>Required:</strong> `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`</p>
      </div>
    </div>
  );
}

function tabRequiresSupabase(activeTab) {
  return [
    'Dashboard',
    'Attendance',
    'Leads',
    'Email',
    'Online Discovery',
    'Website Traffic',
    'SEO',
    'Donations',
    'Marketing',
    "To-Do's",
    'AI Manager',
    'Data Integrity',
  ].includes(activeTab);
}

const MOBILE_BREAKPOINT = 1024;

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = useMemo(
    () => resolveTabFromPathname(location.pathname) || 'Dashboard',
    [location.pathname],
  );

  const [isMobile, setIsMobile] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false),
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handleMediaChange = (event) => {
      setIsMobile(event.matches);
      if (!event.matches) {
        setIsMobileMenuOpen(false);
      }
    };

    handleMediaChange(mediaQuery);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaChange);
      return () => mediaQuery.removeEventListener('change', handleMediaChange);
    }

    mediaQuery.addListener(handleMediaChange);
    return () => mediaQuery.removeListener(handleMediaChange);
  }, []);

  useEffect(() => {
    const resolvedTab = resolveTabFromPathname(location.pathname);
    if (!resolvedTab) {
      navigate(TAB_PATHS.Dashboard, { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    if (isMobile && isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile, isMobileMenuOpen]);

  const handleSetActiveTab = (tab) => {
    const targetPath = TAB_PATHS[tab] || TAB_PATHS.Dashboard;
    if (normalizePathname(location.pathname) !== targetPath) {
      navigate(targetPath);
    }
    if (isMobile) setIsMobileMenuOpen(false);
  };

  const handleMenuToggle = () => {
    if (isMobile) {
      setIsMobileMenuOpen((previous) => !previous);
      return;
    }
    setIsSidebarCollapsed((previous) => !previous);
  };

  const renderView = () => {
    if (!hasSupabaseConfig && tabRequiresSupabase(activeTab)) {
      return <SupabaseEnvRequiredView />;
    }

    switch (activeTab) {
      case 'Leads':
        return <LeadsDashboard />;
      case 'Email':
        return <EmailDashboard />;
      case 'Marketing':
        return <EmailMarketingDashboard />;
      case 'Online Discovery':
        return <WebsiteTrafficDashboard />;
      case 'Website Traffic':
        return <WebsiteTrafficDashboard />;
      case 'SEO':
        return <WebsiteTrafficDashboard />;
      case 'Donations':
        return <DonationsDashboard />;
      case "To-Do's":
        return <TodosDashboard />;
      case 'AI Manager':
        return <AIBriefingDashboard />;
      case 'Data Integrity':
        return <DataCleaning />;
      case 'Attendance':
        return <AttendanceDashboard />;
      case 'Sales':
        return <PlaceholderView tab="Sales" />;
      case 'Revenue':
        return <PlaceholderView tab="Revenue" />;
      case 'Operations':
        return <PlaceholderView tab="Operations" />;
      case 'Analysis':
        return <PlaceholderView tab="Analysis" />;
      default:
        return <DashboardOverview />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleSetActiveTab}
        isMobile={isMobile}
        isOpen={!isMobile || isMobileMenuOpen}
        isCollapsed={!isMobile && isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((previous) => !previous)}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      <div className="main-content">
        <Header activeTab={activeTab} onMenuClick={handleMenuToggle} isMobile={isMobile} />
        <main style={{ flex: 1, minWidth: 0, padding: isMobile ? '12px' : '32px 40px', overflowY: 'auto' }}>
          <div className="page-transition-enter">
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
