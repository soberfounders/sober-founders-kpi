import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardOverview from './views/DashboardOverview';
import LeadsDashboard from './views/LeadsDashboard';
import EmailDashboard from './views/EmailDashboard';
import TodosDashboard from './views/TodosDashboard';
import DataCleaning from './views/DataCleaning'; // Added import
import AttendanceDashboard from './views/AttendanceDashboard'; // Added import
import EmailMarketingDashboard from './views/EmailMarketingDashboard';
import WebsiteTrafficDashboard from './views/WebsiteTrafficDashboard';
import AIBriefingDashboard from './views/AIBriefingDashboard';
import DonationsDashboard from './views/DonationsDashboard';
import ManagerReportsIndex from './views/ManagerReportsIndex';
import ManagerReportDetail from './views/ManagerReportDetail';
import { hasSupabaseConfig, supabaseConfigError } from './lib/supabaseClient';

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
    'Manager Reports',
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
const MANAGER_REPORTS_BASE_PATH = '/manager-reports';

function parseManagerReportsRoute(pathname = '/') {
  const clean = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (clean === MANAGER_REPORTS_BASE_PATH) {
    return { isManagerReports: true, managerKey: '' };
  }
  if (clean.startsWith(`${MANAGER_REPORTS_BASE_PATH}/`)) {
    const managerKey = clean.slice(`${MANAGER_REPORTS_BASE_PATH}/`.length).trim().toLowerCase();
    return { isManagerReports: true, managerKey };
  }
  return { isManagerReports: false, managerKey: '' };
}

function App() {
  const [managerReportsRoute, setManagerReportsRoute] = useState(
    () => parseManagerReportsRoute(typeof window !== 'undefined' ? window.location.pathname : '/'),
  );
  const [activeTab, setActiveTab] = useState(
    () => (managerReportsRoute.isManagerReports ? 'Manager Reports' : 'Dashboard'),
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handlePopState = () => {
      const nextRoute = parseManagerReportsRoute(window.location.pathname);
      setManagerReportsRoute(nextRoute);
      setActiveTab((prev) => {
        if (nextRoute.isManagerReports) return 'Manager Reports';
        return prev === 'Manager Reports' ? 'Dashboard' : prev;
      });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToPath = (path) => {
    if (typeof window === 'undefined') return;
    window.history.pushState({}, '', path);
    const nextRoute = parseManagerReportsRoute(path);
    setManagerReportsRoute(nextRoute);
    if (nextRoute.isManagerReports) {
      setActiveTab('Manager Reports');
    }
  };

  const handleSetActiveTab = (tab) => {
    if (tab === 'Manager Reports') {
      navigateToPath(MANAGER_REPORTS_BASE_PATH);
      if (isMobile) setIsMobileMenuOpen(false);
      return;
    }

    if (managerReportsRoute.isManagerReports) {
      navigateToPath('/');
    }

    setActiveTab(tab);
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
    if (managerReportsRoute.isManagerReports) {
      if (!hasSupabaseConfig && tabRequiresSupabase('Manager Reports')) {
        return <SupabaseEnvRequiredView />;
      }
      if (managerReportsRoute.managerKey) {
        return (
          <ManagerReportDetail
            managerKey={managerReportsRoute.managerKey}
            onBack={() => navigateToPath(MANAGER_REPORTS_BASE_PATH)}
          />
        );
      }
      return (
        <ManagerReportsIndex
          onOpenManager={(managerKey) => navigateToPath(`${MANAGER_REPORTS_BASE_PATH}/${managerKey}`)}
        />
      );
    }

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
      case 'Attendance': // Added case for AttendanceDashboard
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
