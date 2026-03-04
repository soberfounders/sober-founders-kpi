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
import SEODashboard from './views/SEODashboard';
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
    <div style={{
      backgroundColor: 'white',
      border: '1px solid var(--color-border)',
      borderRadius: '16px',
      padding: '24px',
      maxWidth: '760px',
    }}>
      <p style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Module Placeholder</p>
      <h3 style={{ marginTop: '8px', fontSize: '22px', color: 'var(--color-text-primary)' }}>{tab}</h3>
      <p style={{ marginTop: '10px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
        This section does not have an implemented view yet. It is intentionally shown as a placeholder to avoid falling
        back to the Dashboard tab content.
      </p>
    </div>
  );
}

function SupabaseEnvRequiredView() {
  return (
    <div style={{
      backgroundColor: 'white',
      border: '1px solid var(--color-border)',
      borderRadius: '16px',
      padding: '24px',
      maxWidth: '920px',
    }}>
      <p style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Configuration Required</p>
      <h3 style={{ marginTop: '8px', fontSize: '22px', color: 'var(--color-text-primary)' }}>Supabase Environment Variables Missing</h3>
      <p style={{ marginTop: '10px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
        {supabaseConfigError || 'Set Supabase env vars in your deployment to load live KPI data.'}
      </p>
      <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
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
      case 'Website Traffic':
        return <WebsiteTrafficDashboard />;
      case 'SEO':
        return <SEODashboard />;
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
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleSetActiveTab}
        isMobile={isMobile}
        isOpen={!isMobile || isMobileMenuOpen}
        isCollapsed={!isMobile && isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((previous) => !previous)}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header activeTab={activeTab} onMenuClick={handleMenuToggle} isMobile={isMobile} />
        <main style={{ flex: 1, minWidth: 0, padding: isMobile ? '12px' : '24px', overflowY: 'auto' }}>
          {renderView()}
        </main>
      </div>
    </div>
  );
}

export default App;
