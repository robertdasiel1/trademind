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
import { initCloudSync } from "./src/utils/cloudBackup";

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

  // ✅ Cloud sync: inicializa SOLO cuando ya estás autenticado, y solo 1 vez
  const didInitCloudRef = useRef(false);
  useEffect(() => {
    if (authStatus === 'authenticated' && !didInitCloudRef.current) {
      didInitCloudRef.current = true;
      initCloudSync().catch(console.error);
    }
  }, [authStatus]);

  // ✅ FIX: robust auth detection even if API doesn't return "authenticated"
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me', { method: 'GET' });

        if (!res.ok) {
          setAuthStatus('unauthenticated');
          setCurrentUser(null);
          return;
        }

        const data: any = await res.json();

        // If backend explicitly provides authenticated boolean, trust it.
        if (typeof data?.authenticated === 'boolean') {
          if (!data.authenticated) {
            setAuthStatus('unauthenticated');
            setCurrentUser(null);
            return;
          }
        }

        // Some backends return { user: {...} } or { data: { user: {...} } }
        const user = data?.user ?? data?.data?.user ?? null;

        // Some backends may return the user object directly at the top level.
        const topLevelUser =
          data && typeof data === 'object' && (data.id || data.username)
            ? { id: data.id, username: data.username, role: data.role }
            : null;

        const normalizedUser = user ?? topLevelUser;

        if (normalizedUser?.id && normalizedUser?.username) {
          setAuthStatus('authenticated');
          setCurrentUser({
            id: normalizedUser.id,
            username: normalizedUser.username,
            role: normalizedUser.role ?? 'user'
          });

          const username = normalizedUser?.username;
          if (username) {
            setUserProfile(prev => ({ ...prev, name: username }));
          }
        } else {
          setAuthStatus('unauthenticated');
          setCurrentUser(null);
        }
      } catch (e) {
        console.error("Auth check failed", e);
        setAuthStatus('unauthenticated');
        setCurrentUser(null);
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
      console.error("Import failed", err);
      setNotification({
        title: 'Error',
        message: 'No se pudo importar el archivo',
        type: 'error'
      });
    }
  };

  // --- UI & RENDER ---
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-200">
          <Loader2 className="animate-spin" />
          <span>Cargando...</span>
        </div>
      </div>
    );
  }

  if (authStatus !== 'authenticated') {
    return <LoginScreen onLoginSuccess={() => { setAuthStatus('authenticated'); }} />;
  }

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      {/* (Tu UI original sigue igual) */}
      <div className="flex">
        {/* Sidebar */}
        <aside className={`hidden md:flex flex-col gap-4 p-4 ${sidebarCollapsed ? 'w-20' : 'w-72'} transition-all duration-300`}>
          <div className="flex items-center justify-between gap-2">
            <div className={`font-bold text-xl ${sidebarCollapsed ? 'hidden' : 'block'}`}>TradeMind</div>
            <button
              onClick={() => setSidebarCollapsed(v => !v)}
              className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition"
            >
              {sidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <NavItem active={activeTab === 'dashboard'} onClick={() => changeTab('dashboard')} icon={<LayoutDashboard />} label="Dashboard" collapsed={sidebarCollapsed} />
            <NavItem active={activeTab === 'trade'} onClick={() => changeTab('trade')} icon={<ListPlus />} label="Nueva Operación" collapsed={sidebarCollapsed} />
            <NavItem active={activeTab === 'calendar'} onClick={() => changeTab('calendar')} icon={<Calendar />} label="Calendario" collapsed={sidebarCollapsed} />
            <NavItem active={activeTab === 'notes'} onClick={() => changeTab('notes')} icon={<StickyNote />} label="Notas" collapsed={sidebarCollapsed} />
            <NavItem active={activeTab === 'history'} onClick={() => changeTab('history')} icon={<History />} label="Historial" collapsed={sidebarCollapsed} />
            <NavItem active={activeTab === 'ai'} onClick={() => changeTab('ai')} icon={<BrainCircuit />} label="AI Coach" collapsed={sidebarCollapsed} />
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <button onClick={toggleTheme} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              {theme === 'dark' ? <Sun /> : <Moon />}
              <span className={`${sidebarCollapsed ? 'hidden' : 'block'}`}>{theme === 'dark' ? 'Claro' : 'Oscuro'}</span>
            </button>
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              <Settings />
              <span className={`${sidebarCollapsed ? 'hidden' : 'block'}`}>Ajustes</span>
            </button>
            <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition">
              <LogOut />
              <span className={`${sidebarCollapsed ? 'hidden' : 'block'}`}>Salir</span>
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 p-4 md:p-8">
          {activeTab === 'dashboard' && (
            <Dashboard 
              trades={accountTrades}
              totalProfit={totalProfit}
              progressPercentage={progressPercentage}
              activeAccount={activeAccount}
              accounts={accounts}
              activeAccountId={activeAccountId}
              onSwitchAccount={handleSwitchAccount}
              onImport={handleImport}
              userProfile={userProfile}
            />
          )}

          {activeTab === 'trade' && (
            <TradeForm 
              onAddTrade={handleAddTrade} 
              activeAccount={activeAccount} 
            />
          )}

          {activeTab === 'history' && (
            <TradeList 
              trades={accountTrades}
              onDeleteTrade={handleDeleteTrade}
              onUpdateTrade={handleUpdateTrade}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView trades={accountTrades} />
          )}

          {activeTab === 'notes' && (
            <NotesView notes={notes} setNotes={setNotes} />
          )}

          {activeTab === 'ai' && (
            <AICoach 
              trades={accountTrades}
              userProfile={userProfile}
              playbook={playbook}
              messages={messages}
              setMessages={setMessages}
              chatSessionRef={chatSessionRef}
            />
          )}
        </main>
      </div>

      {notification && (
        <NotificationToast data={notification} onClose={() => setNotification(null)} />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          userProfile={userProfile}
          setUserProfile={setUserProfile}
          playbook={playbook}
          setPlaybook={setPlaybook}
          achievedMilestones={achievedMilestones}
          setAchievedMilestones={setAchievedMilestones}
          accounts={accounts}
          setAccounts={setAccounts}
          activeAccountId={activeAccountId}
          setActiveAccountId={setActiveAccountId}
          theme={theme}
        />
      )}
    </div>
  );
}

export default App;
