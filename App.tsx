import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  LayoutDashboard, ListPlus, Calendar, StickyNote, History, 
  BrainCircuit, Settings, Sun, Moon, ChevronLeft, ChevronRight, 
  LogOut, Unlock, Loader2
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import TradeForm from './components/TradeForm';
import TradeList from './components/TradeList';
import CalendarView from './components/CalendarView';
import NotesView from './components/NotesView';
import AICoach from './components/AICoach';
import NotificationToast, { NotificationData } from './components/NotificationToast';
import SettingsModal from './components/SettingsModal';
import LoginScreen from './components/LoginScreen';
import { Trade, TradingAccount, GlobalNote, ChatMessage, Playbook, UserProfile } from './types';
import { Chat } from "@google/genai";
import { syncFromCloudOnStartup } from "./src/utils/cloudBackup";

const DEFAULT_DEADLINE = new Date(new Date().setMonth(new Date().getMonth() + 6)).toISOString().split('T')[0];

const DEFAULT_ACCOUNT: TradingAccount = {
  id: 'default-acc-1',
  name: 'Cuenta Principal',
  broker: 'NinjaTrader',
  initialBalance: 50000,
  goal: 50000,
  deadline: DEFAULT_DEADLINE,
  maxDrawdownLimit: 2500,
  currency: 'USD',
  isReal: false,
  createdAt: new Date().toISOString()
};

const NavItem = ({ active, onClick, icon, label, collapsed }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, collapsed: boolean }) => (
  <button 
    onClick={onClick} 
    className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 shrink-0 ${active ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
    title={collapsed ? label : ''}
  >
    {icon}
    <span className={`font-medium whitespace-nowrap transition-all duration-300 ${collapsed ? 'md:w-0 md:opacity-0 md:hidden' : 'w-auto opacity-100'}`}>
      {label}
    </span>
  </button>
);

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [trades, setTrades] = useState<Trade[]>(() => {
    try { const saved = localStorage.getItem('trading_journal_trades'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [notes, setNotes] = useState<GlobalNote[]>(() => {
    try { const saved = localStorage.getItem('trading_journal_global_notes'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [accounts, setAccounts] = useState<TradingAccount[]>(() => {
    const saved = localStorage.getItem('trading_journal_accounts');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeAccountId, setActiveAccountId] = useState<string>(() => localStorage.getItem('trading_journal_active_account') || DEFAULT_ACCOUNT.id);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('trading_journal_profile');
    return saved ? JSON.parse(saved) : { name: 'Trader', tradingType: 'Futuros', tradingStyle: 'Day Trading' };
  });
  const [playbook, setPlaybook] = useState<Playbook | null>(() => {
    try { const saved = localStorage.getItem('trading_journal_playbook'); return saved ? JSON.parse(saved) : null; } catch { return null; }
  });
  const [achievedMilestones, setAchievedMilestones] = useState<string[]>(() => {
    try { const saved = localStorage.getItem('trading_journal_milestones'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try { const saved = localStorage.getItem('trading_journal_chat_history'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  
  // --- AUTH STATE ---
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [currentUser, setCurrentUser] = useState<{id: string, username: string, role: string} | null>(null);
  
  useEffect(() => {
    syncFromCloudOnStartup().catch(console.error);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
           const data = await res.json();
           if (data.authenticated) {
             setAuthStatus('authenticated');
             setCurrentUser(data.user);
             if (data.user?.username) {
                setUserProfile(prev => ({ ...prev, name: data.user.username })); 
             }
           } else {
             setAuthStatus('unauthenticated');
             setCurrentUser(null);
           }
        } else {
           setAuthStatus('unauthenticated');
           setCurrentUser(null);
        }
      } catch (e) {
        console.error("Auth check failed", e);
        setAuthStatus('unauthenticated');
      }
    };
    checkAuth();
  }, []);

  const chatSessionRef = useRef<Chat | null>(null);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');
  const [showSettings, setShowSettings] = useState(false);
  const [notification, setNotification] = useState<NotificationData | null>(null);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  useEffect(() => {
    if (accounts.length === 0) {
      setAccounts([DEFAULT_ACCOUNT]);
      setActiveAccountId(DEFAULT_ACCOUNT.id);
    }
  }, []);

  useEffect(() => { if (accounts.length > 0) localStorage.setItem('trading_journal_accounts', JSON.stringify(accounts)); }, [accounts]);
  useEffect(() => { localStorage.setItem('trading_journal_active_account', activeAccountId); }, [activeAccountId]);
  useEffect(() => { localStorage.setItem('trading_journal_trades', JSON.stringify(trades)); }, [trades]);
  useEffect(() => { localStorage.setItem('trading_journal_global_notes', JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem('trading_journal_profile', JSON.stringify(userProfile)); }, [userProfile]);
  useEffect(() => { localStorage.setItem('sidebar_collapsed', String(sidebarCollapsed)); }, [sidebarCollapsed]);
  useEffect(() => { localStorage.setItem('trading_journal_chat_history', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { 
      if (playbook) localStorage.setItem('trading_journal_playbook', JSON.stringify(playbook)); 
      else localStorage.removeItem('trading_journal_playbook'); 
  }, [playbook]);
  useEffect(() => { localStorage.setItem('trading_journal_milestones', JSON.stringify(achievedMilestones)); }, [achievedMilestones]);

  const activeAccount = useMemo(() => accounts.find(a => a.id === activeAccountId) || accounts[0] || DEFAULT_ACCOUNT, [accounts, activeAccountId]);
  const accountTrades = useMemo(() => trades.filter(t => t.accountId === activeAccountId || (!t.accountId && activeAccountId === accounts[0]?.id)), [trades, activeAccountId, accounts]);
  const totalProfit = useMemo(() => accountTrades.reduce((acc, t) => acc + t.profit, 0), [accountTrades]);
  const progressPercentage = Math.min(100, Math.max(0, (totalProfit / activeAccount.goal) * 100));

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  const changeTab = (tab: string) => setActiveTab(tab);

  const handleLogout = async () => {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        setAuthStatus('unauthenticated');
        setCurrentUser(null);
    } catch (e) {
        console.error("Logout failed", e);
    }
  };

  const handleAddTrade = (trade: Trade) => {
    const newTrade = { ...trade, accountId: activeAccountId };
    const updatedTrades = [newTrade, ...trades];
    setTrades(updatedTrades);
    setNotification({
      title: 'Operación Registrada',
      message: `Resultado: $${trade.profit.toFixed(2)}`,
      type: trade.profit > 0 ? 'success' : trade.profit < 0 ? 'info' : 'info'
    });
    setActiveTab('history');
  };

  const handleDeleteTrade = (id: string) => setTrades(trades.filter(t => t.id !== id));
  const handleUpdateTrade = (updatedTrade: Trade) => setTrades(trades.map(t => t.id === updatedTrade.id ? updatedTrade : t));
  const handleSwitchAccount = (id: string) => setActiveAccountId(id);

  const handleImport = (data: any) => {
    try {
      // Reemplazar datos en estado y localStorage
      if (data.trades) setTrades(data.trades);
      if (data.notes) setNotes(data.notes);
      if (data.accounts) setAccounts(data.accounts);
      if (data.userProfile) setUserProfile(data.userProfile);
      if (data.playbook) setPlaybook(data.playbook);
      if (data.aiMessages) setMessages(data.aiMessages);
      if (data.achievedMilestones) setAchievedMilestones(data.achievedMilestones);
      
      setNotification({
        title: 'Importación Completada',
        message: 'Tus datos han sido reemplazados exitosamente',
        type: 'success'
      });
    } catch (err) {
      setNotification({
        title: 'Error en la importación',
        message: err instanceof Error ? err.message : 'Error desconocido',
        type: 'error'
      });
    }
  };
  
  const handleDeleteAll = () => { localStorage.clear(); window.location.reload(); };
  const handleAddAccount = (acc: TradingAccount) => { setAccounts(prev => [...prev, acc]); setActiveAccountId(acc.id); };
  const handleUpdateAccount = (updated: TradingAccount) => { setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a)); };
  const handleDeleteAccount = (id: string) => {
    // No permitir eliminar la última cuenta
    if (accounts.length <= 1) {
      setNotification({
        title: 'No se puede eliminar',
        message: 'Debes tener al menos una cuenta',
        type: 'error'
      });
      return;
    }

    // Eliminar la cuenta
    const updatedAccounts = accounts.filter(acc => acc.id !== id);
    setAccounts(updatedAccounts);

    // Si eliminamos la cuenta activa, cambiar a otra
    if (activeAccountId === id) {
      setActiveAccountId(updatedAccounts[0].id);
    }

    // Eliminar trades asociados a esa cuenta (opcional)
    setTrades(trades.filter(t => t.accountId !== id));

    setNotification({
      title: 'Cuenta eliminada',
      message: 'La cuenta ha sido eliminada correctamente',
      type: 'success'
    });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard trades={accountTrades} account={activeAccount} deadline={activeAccount.deadline || ""} theme={theme} accounts={accounts} activeAccountId={activeAccountId} onSwitchAccount={handleSwitchAccount} userProfile={userProfile} />;
      case 'add': return <TradeForm onAdd={handleAddTrade} goal={activeAccount.goal} trades={accountTrades} isReal={activeAccount.isReal} />;
      case 'history': return <TradeList trades={accountTrades} onDelete={handleDeleteTrade} onUpdate={handleUpdateTrade} goal={activeAccount.goal} isReal={activeAccount.isReal} />;
      case 'calendar': return <CalendarView trades={accountTrades} onDelete={handleDeleteTrade} onUpdate={handleUpdateTrade} goal={activeAccount.goal} isReal={activeAccount.isReal} />;
      case 'notes': return <NotesView notes={notes} onUpdateNotes={setNotes} />;
      case 'ai': return <AICoach trades={accountTrades} goal={activeAccount.goal} notes={notes} messages={messages} setMessages={setMessages} chatSessionRef={chatSessionRef} playbook={playbook} onUpdatePlaybook={setPlaybook} />;
      default: return null;
    }
  };

  if (authStatus === 'loading') {
     return <div className="h-screen w-full bg-[#020617] flex items-center justify-center"><Loader2 className="w-10 h-10 text-emerald-500 animate-spin" /></div>;
  }

  if (authStatus === 'unauthenticated') {
      return (
          <LoginScreen 
            userProfile={userProfile} 
            onLoginSuccess={() => {
                setAuthStatus('authenticated');
                fetch('/api/auth/me').then(r => r.json()).then(d => {
                    if (d.user) setCurrentUser(d.user);
                });
            }}
            onUpdateProfile={setUserProfile}
          />
      );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-sans transition-colors duration-300 overflow-hidden">
      <nav className={`flex flex-col bg-white dark:bg-slate-900 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 transition-all duration-300 z-50 w-full md:h-full shrink-0 ${sidebarCollapsed ? 'md:w-20 md:p-2 md:items-center' : 'md:w-64 md:p-4'} p-2`}>
        <div className={`flex items-center justify-between md:justify-center md:flex-col gap-3 mb-2 md:mb-8 ${sidebarCollapsed ? 'md:px-0' : 'md:px-2'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0"><BrainCircuit className="w-6 h-6 text-white" /></div>
            <span className={`font-black text-xl tracking-tight transition-opacity duration-300 md:block ${sidebarCollapsed ? 'md:w-0 md:opacity-0 md:hidden' : 'w-auto opacity-100'}`}>Trade<span className="text-emerald-500">Mind</span></span>
          </div>
          <div className="flex md:hidden gap-2">
             <button onClick={toggleTheme} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">{theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</button>
             <button onClick={() => setShowSettings(true)} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><Settings className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="flex md:flex-col w-full gap-1 md:gap-2 justify-between md:justify-start overflow-x-auto no-scrollbar pb-2 md:pb-0 md:flex-1 min-h-0">
          <NavItem active={activeTab === 'dashboard'} onClick={() => changeTab('dashboard')} icon={<LayoutDashboard className="w-5 h-5" />} label="Panel" collapsed={sidebarCollapsed} />
          <NavItem active={activeTab === 'add'} onClick={() => changeTab('add')} icon={<ListPlus className="w-5 h-5" />} label="Nuevo" collapsed={sidebarCollapsed} />
          <NavItem active={activeTab === 'calendar'} onClick={() => changeTab('calendar')} icon={<Calendar className="w-5 h-5" />} label="Calendario" collapsed={sidebarCollapsed} />
          <NavItem active={activeTab === 'notes'} onClick={() => changeTab('notes')} icon={<StickyNote className="w-5 h-5" />} label="Notas" collapsed={sidebarCollapsed} />
          <NavItem active={activeTab === 'history'} onClick={() => changeTab('history')} icon={<History className="w-5 h-5" />} label="Historial" collapsed={sidebarCollapsed} />
          <NavItem active={activeTab === 'ai'} onClick={() => changeTab('ai')} icon={<BrainCircuit className="w-5 h-5" />} label="Coach" collapsed={sidebarCollapsed} />
        </div>
        <div className="hidden md:flex flex-col gap-2 shrink-0 mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
          <button onClick={handleLogout} className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-900/10 hover:text-rose-600 dark:hover:text-rose-400 ${sidebarCollapsed ? 'justify-center' : ''}`} title="Cerrar Sesión">
              <LogOut className="w-5 h-5" /><span className={`font-medium whitespace-nowrap transition-all duration-300 ${sidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Salir</span>
          </button>
          <button onClick={() => setShowSettings(true)} className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 ${sidebarCollapsed ? 'justify-center' : ''}`} title="Ajustes">
            <Settings className="w-5 h-5" /><span className={`font-medium whitespace-nowrap transition-all duration-300 ${sidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Ajustes</span>
          </button>
          <button onClick={toggleTheme} className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 ${sidebarCollapsed ? 'justify-center' : ''}`} title="Cambiar Modo">
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}<span className={`font-medium whitespace-nowrap transition-all duration-300 ${sidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Modo</span>
          </button>
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 ${sidebarCollapsed ? 'justify-center' : ''}`}>
             {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}<span className={`font-medium whitespace-nowrap transition-all duration-300 ${sidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Colapsar</span>
          </button>
          <div className={`transition-all duration-300 ${sidebarCollapsed ? 'h-0 opacity-0 hidden' : 'bg-slate-100 dark:bg-slate-800 p-4 rounded-xl mt-2 border border-slate-200 dark:border-slate-700'}`}>
            <div className="flex justify-between items-center mb-2">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Tu Progreso</p>
                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md">{progressPercentage.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden mb-2">
                <div className="bg-emerald-500 h-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ width: `${progressPercentage}%` }}></div>
            </div>
          </div>
        </div>
      </nav>
      <main className="flex-1 h-full overflow-y-auto p-4 md:p-8 relative scroll-smooth bg-slate-50 dark:bg-slate-950">
          <div className="w-full max-w-[1920px] mx-auto min-h-full flex flex-col">{renderContent()}</div>
      </main>
      <SettingsModal 
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        userProfile={userProfile}
        onUpdateProfile={setUserProfile}
        trades={trades}
        notes={notes}
        onImport={handleImport}
        onDeleteAll={handleDeleteAll}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSetActiveAccount={setActiveAccountId}
        onAddAccount={handleAddAccount}
        onUpdateAccount={handleUpdateAccount}
        onDeleteAccount={handleDeleteAccount}
        aiMessages={messages}
        playbook={playbook}
        achievedMilestones={achievedMilestones}
        currentUserRole={currentUser?.role}
        currentData={{
          trades,
          notes,
          accounts,
          userProfile,
          playbook,
          aiMessages: messages,
          achievedMilestones
        }}
      />
      <NotificationToast data={notification} onClose={() => setNotification(null)} />
    </div>
  );
}

export default App;
