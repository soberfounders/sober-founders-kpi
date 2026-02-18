import React, { useState } from 'react';
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

function App() {
  const [activeTab, setActiveTab] = useState('Dashboard');

  const renderView = () => {
    switch (activeTab) {
      case 'Leads':
        return <LeadsDashboard />;
      case 'Email':
        return <EmailDashboard />;
      case 'Marketing':
        return <EmailMarketingDashboard />;
      case 'Website Traffic':
        return <WebsiteTrafficDashboard />;
      case "To-Do's":
        return <TodosDashboard />;
      case 'Data Cleaning':
        return <DataCleaning />;
      case 'Attendance': // Added case for AttendanceDashboard
        return <AttendanceDashboard />;
      default:
        return <DashboardOverview />;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header activeTab={activeTab} />
        <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          {renderView()}
        </main>
      </div>
    </div>
  );
}

export default App;
