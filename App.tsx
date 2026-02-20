
import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { LandingScreen } from './components/LandingScreen';
import LoginScreen from './components/LoginScreen';
import CalcScreen from './components/CalcScreen';
import BetweenStopsScreen from './components/BetweenStopsScreen';
import TallyScreen from './components/TallyScreen';
import LogsScreen from './components/LogsScreen';
import SetupScreen from './components/SetupScreen';

type Tab = 'calc' | 'between' | 'tally' | 'logs' | 'setup';

const AppContent: React.FC = () => {
  const [hasStarted, setHasStarted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('calc');
  const { authState } = useAuth();

  if (!hasStarted) {
    return <LandingScreen onFinish={() => setHasStarted(true)} />;
  }

  if (!authState.isAuthenticated) {
    return <LoginScreen />;
  }

  const handleExit = () => setActiveTab('calc');

  const renderContent = () => {
    switch (activeTab) {
      case 'calc': return <CalcScreen />;
      case 'between': return <BetweenStopsScreen onExit={handleExit} />;
      case 'tally': return <TallyScreen onExit={handleExit} />;
      case 'logs': return <LogsScreen onExit={handleExit} />;
      case 'setup': return <SetupScreen onExit={handleExit} />;
      default: return <CalcScreen />;
    }
  };

  const navItems = [
    { id: 'calc', icon: 'calculate', label: 'FARE' },
    { id: 'tally', icon: 'fact_check', label: 'TALLY' },
    { id: 'between', icon: 'map', label: 'ROUTE' },
    { id: 'logs', icon: 'receipt_long', label: 'LOGS' },
    { id: 'setup', icon: 'settings', label: 'SETUP' }
  ];

  return (
    <div className="min-h-screen bg-[#f8f6f6] dark:bg-black transition-colors flex flex-col max-w-lg mx-auto border-x dark:border-white/5 relative">
      <main className="flex-1 overflow-y-auto scrollbar-hide">
        {renderContent()}
      </main>

      <nav className="sticky bottom-0 left-0 right-0 z-50 bg-white dark:bg-night-charcoal border-t dark:border-white/10 flex items-center justify-around px-2 py-2 pb-[calc(env(safe-area-inset-bottom)+8px)] shadow-[0_-1px_10px_rgba(0,0,0,0.05)]">
        {navItems.map(item => (
          <button 
            key={item.id}
            onClick={() => setActiveTab(item.id as Tab)}
            className={`flex flex-col items-center gap-1 flex-1 py-2 transition-all group ${activeTab === item.id ? 'text-primary' : 'text-slate-400 dark:text-slate-600'}`}
          >
            <div className={`p-1.5 rounded-2xl transition-all ${activeTab === item.id ? 'bg-primary/10' : ''}`}>
              <span className={`material-icons ${activeTab === item.id ? 'text-2xl' : 'text-2xl'}`}>{item.icon}</span>
            </div>
            <span className="text-[10px] font-black tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AuthProvider>
  );
};

export default App;
