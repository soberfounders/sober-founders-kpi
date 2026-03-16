import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardOverview from './views/DashboardOverview';
import { hasSupabaseConfig, supabaseConfigError } from './lib/supabaseClient';

const LeadsDashboard = lazy(() => import('./views/LeadsDashboard'));
const EmailDashboard = lazy(() => import('./views/EmailDashboard'));
const TodosDashboard = lazy(() => import('./views/TodosDashboard'));
const DataCleaning = lazy(() => import('./views/DataCleaning'));
const AttendanceDashboard = lazy(() => import('./views/AttendanceDashboard'));
const EmailMarketingDashboard = lazy(() => import('./views/EmailMarketingDashboard'));
const WebsiteTrafficDashboard = lazy(() => import('./views/WebsiteTrafficDashboard'));
const AIBriefingDashboard = lazy(() => import('./views/AIBriefingDashboard'));
const DonationsDashboard = lazy(() => import('./views/DonationsDashboard'));
const OutreachExperimentDashboard = lazy(() => import('./views/OutreachExperimentDashboard'));

/* ── route ↔ tab mapping ── */
const ROUTES = [
  { path: '/',                 tabId: 'Dashboard',        label: 'Dashboard',         element: <DashboardOverview /> },
  { path: '/attendance',       tabId: 'Attendance',       label: 'Attendance',         element: <AttendanceDashboard /> },
  { path: '/leads',            tabId: 'Leads',            label: 'Leads',              element: <LeadsDashboard /> },
  { path: '/email',            tabId: 'Email',            label: 'Email',              element: <EmailDashboard /> },
  { path: '/online-discovery', tabId: 'Online Discovery', label: 'Online Discovery',   element: <WebsiteTrafficDashboard /> },
  { path: '/donations',        tabId: 'Donations',        label: 'Donations',          element: <DonationsDashboard /> },
  { path: '/marketing',        tabId: 'Marketing',        label: 'Marketing',          element: <EmailMarketingDashboard /> },
  { path: '/todos',            tabId: "To-Do's",          label: "To-Do's",            element: <TodosDashboard /> },
  { path: '/outreach',          tabId: 'Outreach',         label: 'Outreach',           element: <OutreachExperimentDashboard /> },
  { path: '/ai-manager',       tabId: 'AI Manager',       label: 'Board of Directors', element: <AIBriefingDashboard /> },
  { path: '/data-integrity',   tabId: 'Data Integrity',   label: 'Data Integrity',     element: <DataCleaning /> },
];

const TAB_BY_PATH = Object.fromEntries(ROUTES.map((r) => [r.path, r.tabId]));

const SUPABASE_REQUIRED_TABS = new Set([
  'Dashboard', 'Attendance', 'Leads', 'Email', 'Online Discovery',
  'Website Traffic', 'SEO', 'Donations', 'Marketing', "To-Do's",
  'Outreach', 'AI Manager', 'Data Integrity',
]);

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

function ModuleLoadingView() {
  return (
    <div className="glass-panel page-transition-enter" style={{ padding: '24px', maxWidth: '760px', margin: '0 auto' }}>
      <p style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Loading module...</p>
    </div>
  );
}

function SupabaseGate({ tabId, children }) {
  if (!hasSupabaseConfig && SUPABASE_REQUIRED_TABS.has(tabId)) {
    return <SupabaseEnvRequiredView />;
  }
  return children;
}

const MOBILE_BREAKPOINT = 1024;

function App() {
  const location = useLocation();
  const activeTab = TAB_BY_PATH[location.pathname] || 'Dashboard';

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

  const handleMenuToggle = () => {
    if (isMobile) {
      setIsMobileMenuOpen((previous) => !previous);
      return;
    }
    setIsSidebarCollapsed((previous) => !previous);
  };

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        isMobile={isMobile}
        isOpen={!isMobile || isMobileMenuOpen}
        isCollapsed={!isMobile && isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((previous) => !previous)}
        onClose={() => setIsMobileMenuOpen(false)}
        onNavigate={() => { if (isMobile) setIsMobileMenuOpen(false); }}
      />
      <div className="main-content">
        <Header activeTab={activeTab} onMenuClick={handleMenuToggle} isMobile={isMobile} />
        <main style={{ flex: 1, minWidth: 0, padding: isMobile ? '12px' : '32px 40px', overflowY: 'auto' }}>
          <div className="page-transition-enter">
            <Suspense fallback={<ModuleLoadingView />}>
              <Routes>
                {ROUTES.map((r) => (
                  <Route
                    key={r.path}
                    path={r.path}
                    element={<SupabaseGate tabId={r.tabId}>{r.element}</SupabaseGate>}
                  />
                ))}
                {/* Catch-all: redirect unknown paths to dashboard */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
