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
import SettingsModal from './components/SettingsModal';
import NotificationToast from './components/NotificationToast';
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
  maxDrawdown: 2500,
  currency: 'USD'
};

const DEFAULT_PROFILE: UserProfile = {
  name: 'Trader',
  tradingType: 'Futuros',
  tradingStyle: 'Day Trading',
  username: 'admin'
};

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');

  // --- DATA STATE (LOCAL STORAGE) ---
  const [accounts, setAccounts] = useState<TradingAccount[]>(() => {
    try { const saved = localStorage.getItem('trading_journal_accounts'); return saved ? JSON.parse(saved) : [DEFAULT_ACCOUNT]; } catch { return [DEFAULT_ACCOUNT]; }
  });
  const [activeAccountId, setActiveAccountId] = useState<string>(() => {
    return localStorage.getItem('trading_journal_active_account') || DEFAULT_ACCOUNT.id;
  });
  const [trades, setTrades] = useState<Trade[]>(() => {
    try { const saved = localStorage.getItem('trading_journal_trades'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [globalNotes, setGlobalNotes] = useState<GlobalNote[]>(() => {
    try { const saved = localStorage.getItem('trading_journal_global_notes'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [playbook, setPlaybook] = useState<Playbook | null>(() => {
    try { const saved = localStorage.getItem('trading_journal_playbook'); return saved ? JSON.parse(saved) : null; } catch { return null; }
  });
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try { const saved = localStorage.getItem('trading_journal_profile'); return saved ? JSON.parse(saved) : DEFAULT_PROFILE; } catch { return DEFAULT_PROFILE; }
  });
  const [milestones, setMilestones] = useState<any[]>(() => {
    try { const saved = localStorage.getItem('trading_journal_milestones'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
    try { const saved = localStorage.getItem('trading_journal_chat_history'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  
  // --- AUTH STATE ---
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [currentUser, setCurrentUser] = useState<{id: string, username: string, role: string} | null>(null); 
  const didCloudInitRef = useRef(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });

        if (!res.ok) {
           setAuthStatus('unauthenticated');
           setCurrentUser(null);
           return;
        }

        const data = await res.json();

        // Soporta distintas formas de respuesta del backend:
        // - { authenticated: true, user: {...} }
        // - { user: {...} }
        const isAuthed = data?.authenticated === true || !!data?.user || !!data?.user?.username;

        if (isAuthed) {
          setAuthStatus('authenticated');
          setCurrentUser(data.user ?? null);
          if (data.user?.username) {
             setUserProfile(prev => ({ ...prev, name: data.user.username })); 
          }
        } else {
          setAuthStatus('unauthenticated');
          setCurrentUser(null);
        }

      } catch (e) {
        setAuthStatus('unauthenticated');
        setCurrentUser(null);
      }
    };
    checkAuth();
  }, []);

  // Cloud sync: run once after authentication (and installs auto-upload hooks)
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    if (didCloudInitRef.current) return;
    didCloudInitRef.current = true;
    const cleanup = initCloudSync();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [authStatus]);

  const chatSessionRef = useRef<Chat | null>(null);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [showSettings, setShowSettings] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('trading_journal_accounts', JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem('trading_journal_active_account', activeAccountId);
  }, [activeAccountId]);

  useEffect(() => {
    localStorage.setItem('trading_journal_trades', JSON.stringify(trades));
  }, [trades]);

  useEffect(() => {
    localStorage.setItem('trading_journal_global_notes', JSON.stringify(globalNotes));
  }, [globalNotes]);

  useEffect(() => {
    localStorage.setItem('trading_journal_playbook', JSON.stringify(playbook));
  }, [playbook]);

  useEffect(() => {
    localStorage.setItem('trading_journal_profile', JSON.stringify(userProfile));
  }, [userProfile]);

  useEffect(() => {
    localStorage.setItem('trading_journal_milestones', JSON.stringify(milestones));
  }, [milestones]);

  useEffect(() => {
    localStorage.setItem('trading_journal_chat_history', JSON.stringify(chatHistory));
  }, [chatHistory]);

  const activeAccount = useMemo(() => accounts.find(a => a.id === activeAccountId) || accounts[0], [accounts, activeAccountId]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    setAuthStatus('unauthenticated');
    setCurrentUser(null);
  };

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="flex items-center gap-2">
          <Loader2 className="animate-spin" />
          <span>Cargando…</span>
        </div>
      </div>
    );
  }

  if (authStatus !== 'authenticated') {
    return (
      <LoginScreen
        onLoginSuccess={(user) => {
          setAuthStatus('authenticated');
          setCurrentUser(user);
          if (user?.username) {
            setUserProfile(prev => ({ ...prev, name: user.username }));
          }
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      {/* Sidebar */}
      <aside className={`border-r border-white/10 p-4 ${sidebarCollapsed ? 'w-20' : 'w-72'} transition-all`}>
        <div className="flex items-center justify-between">
          <div className="font-bold text-xl">{sidebarCollapsed ? 'TM' : 'TradeMind'}</div>
          <button
            className="p-2 rounded-lg hover:bg-white/10"
            onClick={() => setSidebarCollapsed(s => !s)}
            title={sidebarCollapsed ? 'Expandir' : 'Colapsar'}
          >
            {sidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}
          </button>
        </div>

        <nav className="mt-6 space-y-2">
          <button className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/10" onClick={() => setActiveTab('dashboard')}>
            <LayoutDashboard /> {!sidebarCollapsed && <span>Dashboard</span>}
          </button>
          <button className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/10" onClick={() => setActiveTab('tradeForm')}>
            <ListPlus /> {!sidebarCollapsed && <span>Nuevo Trade</span>}
          </button>
          <button className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/10" onClick={() => setActiveTab('tradeList')}>
            <History /> {!sidebarCollapsed && <span>Trades</span>}
          </button>
          <button className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/10" onClick={() => setActiveTab('calendar')}>
            <Calendar /> {!sidebarCollapsed && <span>Calendario</span>}
          </button>
          <button className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/10" onClick={() => setActiveTab('notes')}>
            <StickyNote /> {!sidebarCollapsed && <span>Notas</span>}
          </button>
          <button className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/10" onClick={() => setActiveTab('ai')}>
            <BrainCircuit /> {!sidebarCollapsed && <span>AI Coach</span>}
          </button>
        </nav>

        <div className="mt-6 space-y-2">
          <button className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/10" onClick={() => setShowSettings(true)}>
            <Settings /> {!sidebarCollapsed && <span>Settings</span>}
          </button>
          <button className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/10" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun /> : <Moon />} {!sidebarCollapsed && <span>Tema</span>}
          </button>
          <button className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 text-red-300" onClick={handleLogout}>
            <LogOut /> {!sidebarCollapsed && <span>Salir</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6">
        {activeTab === 'dashboard' && (
          <Dashboard
            trades={trades}
            accounts={accounts}
            activeAccount={activeAccount}
            userProfile={userProfile}
            onShowSettings={() => setShowSettings(true)}
          />
        )}

        {activeTab === 'tradeForm' && (
          <TradeForm
            accounts={accounts}
            activeAccountId={activeAccountId}
            onSaveTrade={(t) => {
              setTrades(prev => [t, ...prev]);
              setNotification({ message: 'Trade guardado', type: 'success' });
              setActiveTab('tradeList');
            }}
          />
        )}

        {activeTab === 'tradeList' && (
          <TradeList
            trades={trades}
            accounts={accounts}
            activeAccountId={activeAccountId}
            onSetActiveAccount={setActiveAccountId}
            onUpdateTrades={setTrades}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarView
            trades={trades}
            accounts={accounts}
            activeAccountId={activeAccountId}
          />
        )}

        {activeTab === 'notes' && (
          <NotesView
            notes={globalNotes}
            onUpdateNotes={setGlobalNotes}
          />
        )}

        {activeTab === 'ai' && (
          <AICoach
            trades={trades}
            profile={userProfile}
            playbook={playbook}
            chatHistory={chatHistory}
            onUpdateChatHistory={setChatHistory}
            chatSessionRef={chatSessionRef}
          />
        )}
      </main>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          accounts={accounts}
          activeAccountId={activeAccountId}
          onSetActiveAccountId={setActiveAccountId}
          onUpdateAccounts={setAccounts}
          profile={userProfile}
          onUpdateProfile={setUserProfile}
          playbook={playbook}
          onUpdatePlaybook={setPlaybook}
        />
      )}

      {notification && (
        <NotificationToast
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
    </div>
  );
}

export default App;
