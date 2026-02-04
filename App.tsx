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
  maxDrawdown: 2500,
  currency: 'USD',
  isReal: false
};

const DEFAULT_PROFILE: UserProfile = {
  name: "Trader",
  tradingType: "Futuros",
  tradingStyle: "Day Trading",
  username: "admin"
};

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');
  const [showSettings, setShowSettings] = useState(false);

  const [notification, setNotification] = useState<NotificationData | null>(null);

  const [trades, setTrades] = useState<Trade[]>(() => {
    const saved = localStorage.getItem('trading_journal_trades');
    return saved ? JSON.parse(saved) : [];
  });

  const [notes, setNotes] = useState<GlobalNote[]>(() => {
    const saved = localStorage.getItem('trading_journal_global_notes');
    return saved ? JSON.parse(saved) : [];
  });

  const [accounts, setAccounts] = useState<TradingAccount[]>(() => {
    const saved = localStorage.getItem('trading_journal_accounts');
    return saved ? JSON.parse(saved) : [DEFAULT_ACCOUNT];
  });

  const [activeAccountId, setActiveAccountId] = useState<string>(() => {
    return localStorage.getItem('trading_journal_active_account') || DEFAULT_ACCOUNT.id;
  });

  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('trading_journal_profile');
    return saved ? JSON.parse(saved) : DEFAULT_PROFILE;
  });

  const [playbook, setPlaybook] = useState<Playbook | null>(() => {
    const saved = localStorage.getItem('trading_journal_playbook');
    return saved ? JSON.parse(saved) : null;
HookWithToast=hash
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('trading_journal_chat_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [achievedMilestones, setAchievedMilestones] = useState<any[]>(() => {
    const saved = localStorage.getItem('trading_journal_milestones');
    return saved ? JSON.parse(saved) : [];
  });

  // AUTH
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; role: string } | null>(null);

  // keep genai chat session
  const chatSessionRef = useRef<Chat | null>(null);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => { if (accounts.length > 0) localStorage.setItem('trading_journal_accounts', JSON.stringify(accounts)); }, [accounts]);
  useEffect(() => { localStorage.setItem('trading_journal_active_account', activeAccountId); }, [activeAccountId]);
  useEffect(() => { localStorage.setItem('trading_journal_trades', JSON.stringify(trades)); }, [trades]);
  useEffect(() => { localStorage.setItem('trading_journal_global_notes', JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem('trading_journal_profile', JSON.stringify(profile)); }, [profile]);
  useEffect(() => { localStorage.setItem('sidebar_collapsed', String(sidebarCollapsed)); }, [sidebarCollapsed]);
  useEffect(() => { localStorage.setItem('trading_journal_chat_history', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { 
    if (playbook) localStorage.setItem('trading_journal_playbook', JSON.stringify(playbook)); 
    else localStorage.removeItem('trading_journal_playbook'); 
  }, [playbook]);
  useEffect(() => { localStorage.setItem('trading_journal_milestones', JSON.stringify(achievedMilestones)); }, [achievedMilestones]);

  // Auth check (mantener sesión en refresh)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' });
        if (res.ok) {
          const me = await res.json();
          setCurrentUser(me);
          setAuthStatus('authenticated');
        } else {
          setCurrentUser(null);
          setAuthStatus('unauthenticated');
        }
      } catch (e) {
        console.error('Auth check failed', e);
        setCurrentUser(null);
        setAuthStatus('unauthenticated');
      }
    };
    checkAuth();
  }, []);

  // Cloud sync on startup (solo cuando está autenticado)
  useEffect(() => {
    if (authStatus === 'authenticated') {
      syncFromCloudOnStartup().catch(console.error);
    }
  }, [authStatus]);

  const activeAccount = useMemo(() => accounts.find(a => a.id === activeAccountId) || accounts[0] || DEFAULT_ACCOUNT, [accounts, activeAccountId]);
  const accountTrades = useMemo(
    () => trades.filter(t => t.accountId === activeAccountId || (!t.accountId && activeAccountId === accounts[0]?.id)),
    [trades, activeAccountId, accounts]
  );

  const totalProfit = useMemo(() => accountTrades.reduce((acc, t) => acc + t.profit, 0), [accountTrades]);
  const progressPercentage = Math.min(100, Math.max(0, (totalProfit / (activeAccount.goal || 1)) * 100));

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
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

  const handleDeleteAll = () => { localStorage.clear(); window.location.reload(); };

  const handleAddAccount = (account: TradingAccount) => { setAccounts([account, ...accounts]); };
  const handleUpdateAccount = (updated: TradingAccount) => { setAccounts(accounts.map(a => a.id === updated.id ? updated : a)); };
  const handleDeleteAccount = (id: string) => {
    if (accounts.length <= 1) {
      setNotification({
        title: 'No se puede eliminar',
        message: 'Debes tener al menos una cuenta',
        type: 'error'
      });
      return;
    }
    const updatedAccounts = accounts.filter(acc => acc.id !== id);
    setAccounts(updatedAccounts);

    if (activeAccountId === id) {
      setActiveAccountId(updatedAccounts[0].id);
    }

    setTrades(trades.filter(t => t.accountId !== id));

    setNotification({
      title: 'Cuenta eliminada',
      message: 'La cuenta ha sido eliminada correctamente',
      type: 'success'
    });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            trades={accountTrades}
            account={activeAccount}
            deadline={activeAccount.deadline || ""}
            theme={theme}
            accounts={accounts}
            activeAccountId={activeAccountId}
            onSwitchAccount={handleSwitchAccount}
            userProfile={profile}
          />
        );
      case 'add':
        return <TradeForm onAdd={handleAddTrade} goal={activeAccount.goal} trades={accountTrades} isReal={activeAccount.isReal} />;
      case 'calendar':
        return <CalendarView trades={accountTrades} />;
      case 'notes':
        return <NotesView notes={notes} onUpdateNotes={setNotes} />;
      case 'history':
        return <TradeList trades={accountTrades} onDeleteTrade={handleDeleteTrade} onUpdateTrade={handleUpdateTrade} />;
      case 'coach':
        return <AICoach trades={accountTrades} profile={profile} playbook={playbook} onUpdatePlaybook={setPlaybook} messages={messages} onUpdateMessages={setMessages} chatSessionRef={chatSessionRef} />;
      default:
        return null;
    }
  };

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="flex items-center gap-2 opacity-80">
          <Loader2 className="animate-spin" size={18} />
          Cargando...
        </div>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <div className={theme === 'dark' ? 'dark' : ''}>
        <LoginScreen
          onLogin={(user) => {
            setCurrentUser(user);
            setAuthStatus('authenticated');
          }}
        />
      </div>
    );
  }

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        {/* Sidebar */}
        <div className={`border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all ${sidebarCollapsed ? 'w-16' : 'w-64'}`}>
          <div className="p-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold">ƭ</div>
              {!sidebarCollapsed && <div className="font-semibold">TradeMind</div>}
            </div>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              title={sidebarCollapsed ? "Expandir" : "Colapsar"}
            >
              {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>

          <div className="px-3 space-y-1">
            <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 ${activeTab === 'dashboard' ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
              <LayoutDashboard size={18} /> {!sidebarCollapsed && <span>Dashboard</span>}
            </button>
            <button onClick={() => setActiveTab('add')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 ${activeTab === 'add' ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
              <ListPlus size={18} /> {!sidebarCollapsed && <span>Agregar</span>}
            </button>
            <button onClick={() => setActiveTab('calendar')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 ${activeTab === 'calendar' ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
              <Calendar size={18} /> {!sidebarCollapsed && <span>Calendario</span>}
            </button>
            <button onClick={() => setActiveTab('notes')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 ${activeTab === 'notes' ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
              <StickyNote size={18} /> {!sidebarCollapsed && <span>Notas</span>}
            </button>
            <button onClick={() => setActiveTab('history')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 ${activeTab === 'history' ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
              <History size={18} /> {!sidebarCollapsed && <span>Historial</span>}
            </button>
            <button onClick={() => setActiveTab('coach')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 ${activeTab === 'coach' ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
              <BrainCircuit size={18} /> {!sidebarCollapsed && <span>AI Coach</span>}
            </button>
          </div>

          <div className="mt-auto p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              {!sidebarCollapsed && <span>{theme === 'dark' ? 'Claro' : 'Oscuro'}</span>}
            </button>

            <button
              onClick={() => setShowSettings(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Settings size={18} /> {!sidebarCollapsed && <span>Ajustes</span>}
            </button>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-red-500"
            >
              <LogOut size={18} /> {!sidebarCollapsed && <span>Salir</span>}
            </button>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 overflow-auto">
          <div className="p-6 max-w-6xl mx-auto">
            {renderContent()}
          </div>
        </div>

        {showSettings && (
          <SettingsModal
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            userProfile={profile}
            onUpdateProfile={setProfile}
            accounts={accounts}
            activeAccountId={activeAccountId}
            onSwitchAccount={handleSwitchAccount}
            onAddAccount={handleAddAccount}
            onUpdateAccount={handleUpdateAccount}
            onDeleteAccount={handleDeleteAccount}
            onDeleteAll={handleDeleteAll}
          />
        )}

        {notification && (
          <NotificationToast
            notification={notification}
            onClose={() => setNotification(null)}
          />
        )}
      </div>
    </div>
  );
}

export default App;
