import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  LayoutDashboard, ListPlus, Calendar, StickyNote, History,
  BrainCircuit, Settings, Sun, Moon, ChevronLeft, ChevronRight,
  LogOut, Loader2
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

import {
  syncFromCloudOnStartup,
  scheduleCloudUploadDebounced,
  initCloudSync,
  setCloudSyncUserScope,
  clearCloudSyncUserScope,
  getUserScopedStorageKeys,
  getUserScopedMetaKeys,
} from "./src/utils/cloudBackup";

function safeReadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const DEFAULT_DEADLINE = new Date(new Date().setMonth(new Date().getMonth() + 6))
  .toISOString()
  .split('T')[0];

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

/**
 * Nombres base (sin prefijo). Se guardarán como:
 * trading_journal_<userId>_<baseKey>
 */
const BASE_KEYS = {
  trades: "trades",
  notes: "global_notes",
  accounts: "accounts",
  activeAccount: "active_account",
  profile: "profile",
  playbook: "playbook",
  chat: "chat_history",
  milestones: "milestones",
  backup: "trademind_backup",
} as const;

function buildUserPrefix(userId: string | null): string {
  const id = userId?.trim();
  return `trading_journal_${id || "guest"}_`;
}

function userKey(prefix: string, baseKey: string): string {
  return prefix + baseKey;
}

function rehydrateAll(
  prefix: string,
  setTrades: React.Dispatch<React.SetStateAction<Trade[]>>,
  setNotes: React.Dispatch<React.SetStateAction<GlobalNote[]>>,
  setAccounts: React.Dispatch<React.SetStateAction<TradingAccount[]>>,
  setActiveAccountId: React.Dispatch<React.SetStateAction<string>>,
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  setPlaybook: React.Dispatch<React.SetStateAction<Playbook | null>>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setAchievedMilestones: React.Dispatch<React.SetStateAction<string[]>>,
) {
  setTrades(safeReadJSON<Trade[]>(userKey(prefix, BASE_KEYS.trades), []));
  setNotes(safeReadJSON<GlobalNote[]>(userKey(prefix, BASE_KEYS.notes), []));
  const a = safeReadJSON<TradingAccount[]>(userKey(prefix, BASE_KEYS.accounts), []);
  setAccounts(a.length ? a : [DEFAULT_ACCOUNT]);
  setActiveAccountId(localStorage.getItem(userKey(prefix, BASE_KEYS.activeAccount)) || DEFAULT_ACCOUNT.id);
  setUserProfile(
    safeReadJSON<UserProfile>(userKey(prefix, BASE_KEYS.profile), {
      name: 'Trader',
      tradingType: 'Futuros',
      tradingStyle: 'Day Trading'
    })
  );
  setPlaybook(safeReadJSON<Playbook | null>(userKey(prefix, BASE_KEYS.playbook), null));
  setMessages(safeReadJSON<ChatMessage[]>(userKey(prefix, BASE_KEYS.chat), []));
  setAchievedMilestones(safeReadJSON<string[]>(userKey(prefix, BASE_KEYS.milestones), []));
}

const NavItem = ({
  active,
  onClick,
  icon,
  label,
  collapsed
}: {
  active: boolean,
  onClick: () => void,
  icon: React.ReactNode,
  label: string,
  collapsed: boolean
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 shrink-0 ${
      active
        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`}
    title={collapsed ? label : ''}
  >
    {icon}
    <span className={`font-medium whitespace-nowrap transition-all duration-300 ${
      collapsed ? 'md:w-0 md:opacity-0 md:hidden' : 'w-auto opacity-100'
    }`}>
      {label}
    </span>
  </button>
);

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'dark';
  });

  // --- AUTH ---
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [currentUser, setCurrentUser] = useState<{ id: string, username: string, role: string } | null>(null);

  const userPrefix = useMemo(() => buildUserPrefix(currentUser?.id ?? null), [currentUser?.id]);
  const k = (base: string) => userKey(userPrefix, base);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [notes, setNotes] = useState<GlobalNote[]>([]);
  const [accounts, setAccounts] = useState<TradingAccount[]>([DEFAULT_ACCOUNT]);

  const [activeAccountId, setActiveAccountId] = useState<string>(DEFAULT_ACCOUNT.id);

  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: 'Trader',
    tradingType: 'Futuros',
    tradingStyle: 'Day Trading',
  });

  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [achievedMilestones, setAchievedMilestones] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const chatSessionRef = useRef<Chat | null>(null);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');
  const [showSettings, setShowSettings] = useState(false);
  const [notification, setNotification] = useState<NotificationData | null>(null);

  // THEME
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // ✅ AUTH CHECK
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
          cache: 'no-store',
        });

        if (!res.ok) {
          setAuthStatus('unauthenticated');
          setCurrentUser(null);
          clearCloudSyncUserScope();
          return;
        }

        const data = await res.json();
        if (data.authenticated) {
          setAuthStatus('authenticated');
          setCurrentUser(data.user);
          if (data.user?.username) setUserProfile(prev => ({ ...prev, name: data.user.username }));
        } else {
          setAuthStatus('unauthenticated');
          setCurrentUser(null);
          clearCloudSyncUserScope();
        }
      } catch (e) {
        console.error("Auth check failed", e);
        setAuthStatus('unauthenticated');
        setCurrentUser(null);
        clearCloudSyncUserScope();
      }
    };

    checkAuth();
  }, []);

  // ✅ Cuando autentica o cambia de usuario -> set scope + rehydrate SU data
  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser?.id) return;

    setCloudSyncUserScope(currentUser.id);

    const prefix = buildUserPrefix(currentUser.id);
    rehydrateAll(
      prefix,
      setTrades,
      setNotes,
      setAccounts,
      setActiveAccountId,
      setUserProfile,
      setPlaybook,
      setMessages,
      setAchievedMilestones,
    );
  }, [authStatus, currentUser?.id]);

  // PERSIST LOCAL (por usuario)
  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser?.id) return;
    localStorage.setItem(k(BASE_KEYS.trades), JSON.stringify(trades));
  }, [authStatus, currentUser?.id, k, trades]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser?.id) return;
    localStorage.setItem(k(BASE_KEYS.notes), JSON.stringify(notes));
  }, [authStatus, currentUser?.id, k, notes]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser?.id) return;
    localStorage.setItem(k(BASE_KEYS.accounts), JSON.stringify(accounts));
  }, [authStatus, currentUser?.id, k, accounts]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser?.id) return;
    localStorage.setItem(k(BASE_KEYS.activeAccount), activeAccountId);
  }, [authStatus, currentUser?.id, k, activeAccountId]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser?.id) return;
    localStorage.setItem(k(BASE_KEYS.profile), JSON.stringify(userProfile));
  }, [authStatus, currentUser?.id, k, userProfile]);

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser?.id) return;
    localStorage.setItem(k(BASE_KEYS.chat), JSON.stringify(messages));
  }, [authStatus, currentUser?.id, k, messages]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser?.id) return;
    if (playbook) localStorage.setItem(k(BASE_KEYS.playbook), JSON.stringify(playbook));
    else localStorage.removeItem(k(BASE_KEYS.playbook));
  }, [authStatus, currentUser?.id, k, playbook]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser?.id) return;
    localStorage.setItem(k(BASE_KEYS.milestones), JSON.stringify(achievedMilestones));
  }, [authStatus, currentUser?.id, k, achievedMilestones]);

  // ✅ INSTALA SYNC SOLO SI ESTÁ AUTH
  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser?.id) return;

    const cleanup = initCloudSync?.();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [authStatus, currentUser?.id]);

  // ✅ Cuando llega restore desde cloud, rehidratamos estado SIN reload
  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser?.id) return;

    const onRestored = () => {
      const prefix = buildUserPrefix(currentUser.id);

      rehydrateAll(
        prefix,
        setTrades,
        setNotes,
        setAccounts,
        setActiveAccountId,
        setUserProfile,
        setPlaybook,
        setMessages,
        setAchievedMilestones,
      );

      setNotification({
        title: 'Sincronización',
        message: 'Datos actualizados desde la nube',
        type: 'success'
      });
    };

    window.addEventListener('tm_cloud_restored', onRestored);
    return () => window.removeEventListener('tm_cloud_restored', onRestored);
  }, [authStatus, currentUser?.id]);

  // ✅ PUSH cuando cambian datos (debounced)
  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser?.id) return;
    scheduleCloudUploadDebounced(1200);
  }, [
    authStatus,
    currentUser?.id,
    trades,
    notes,
    accounts,
    activeAccountId,
    userProfile,
    playbook,
    messages,
    achievedMilestones,
  ]);

  // ✅ PULL inicial extra al autenticar
  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser?.id) return;
    syncFromCloudOnStartup().catch(console.error);
  }, [authStatus, currentUser?.id]);

  const activeAccount = useMemo(
    () => accounts.find(a => a.id === activeAccountId) || accounts[0] || DEFAULT_ACCOUNT,
    [accounts, activeAccountId]
  );

  const accountTrades = useMemo(
    () => trades.filter(t => t.accountId === activeAccountId),
    [trades, activeAccountId]
  );

  const totalProfit = useMemo(() => accountTrades.reduce((acc, t) => acc + t.profit, 0), [accountTrades]);
  const progressPercentage = Math.min(100, Math.max(0, (totalProfit / activeAccount.goal) * 100));

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  const changeTab = (tab: string) => setActiveTab(tab);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.error("Logout failed", e);
    } finally {
      clearCloudSyncUserScope();
      setAuthStatus('unauthenticated');
      setCurrentUser(null);

      // limpia estado en memoria (para no “ver” al user anterior)
      setTrades([]);
      setNotes([]);
      setAccounts([DEFAULT_ACCOUNT]);
      setActiveAccountId(DEFAULT_ACCOUNT.id);
      setPlaybook(null);
      setMessages([]);
      setAchievedMilestones([]);
    }
  };

  const handleAddTrade = (trade: Trade) => {
    setTrades(prev => [...prev, trade]);
    setNotification({ title: 'Trade guardado', message: 'Se agregó el trade correctamente', type: 'success' });
  };

  const handleDeleteTrade = (id: string) => setTrades(prev => prev.filter(t => t.id !== id));
  const handleUpdateTrade = (updatedTrade: Trade) => setTrades(prev => prev.map(t => t.id === updatedTrade.id ? updatedTrade : t));
  const handleSwitchAccount = (id: string) => setActiveAccountId(id);

  const handleImport = (data: any) => {
    try {
      if (data.trades) setTrades(data.trades);
      if (data.notes) setNotes(data.notes);
      if (data.accounts) setAccounts(data.accounts);
      if (data.userProfile) setUserProfile(data.userProfile);
      if (data.playbook) setPlaybook(data.playbook);
      if (data.aiMessages) setMessages(data.aiMessages);
      if (data.achievedMilestones) setAchievedMilestones(data.achievedMilestones);

      setNotification({ title: 'Importación Completada', message: 'Tus datos han sido reemplazados exitosamente', type: 'success' });

      if (authStatus === 'authenticated') scheduleCloudUploadDebounced(800);
    } catch (err) {
      setNotification({
        title: 'Error en la importación',
        message: err instanceof Error ? err.message : 'Error desconocido',
        type: 'error'
      });
    }
  };

  // ⚠️ Antes hacía localStorage.clear() (eso borra TODOS los usuarios).
  // Ahora borra solo el usuario actual.
  const handleDeleteAll = () => {
    if (!currentUser?.id) return;

    const scopedKeys = getUserScopedStorageKeys(currentUser.id);
    const metaKeys = getUserScopedMetaKeys(currentUser.id);

    for (const key of scopedKeys) localStorage.removeItem(key);
    for (const key of metaKeys) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }

    // rehidrata vacío
    const prefix = buildUserPrefix(currentUser.id);
    rehydrateAll(
      prefix,
      setTrades,
      setNotes,
      setAccounts,
      setActiveAccountId,
      setUserProfile,
      setPlaybook,
      setMessages,
      setAchievedMilestones,
    );

    scheduleCloudUploadDebounced(300);
  };

  const handleAddAccount = (acc: TradingAccount) => { setAccounts(prev => [...prev, acc]); setActiveAccountId(acc.id); };
  const handleUpdateAccount = (updated: TradingAccount) => setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a));

  const handleDeleteAccount = (id: string) => {
    if (accounts.length <= 1) {
      setNotification({ title: 'No se puede eliminar', message: 'Debes tener al menos una cuenta', type: 'error' });
      return;
    }

    const updatedAccounts = accounts.filter(acc => acc.id !== id);
    setAccounts(updatedAccounts);

    if (activeAccountId === id) setActiveAccountId(updatedAccounts[0].id);
    setTrades(trades.filter(t => t.accountId !== id));

    setNotification({ title: 'Cuenta eliminada', message: 'La cuenta ha sido eliminada correctamente', type: 'success' });
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
            userProfile={userProfile}
          />
        );
      case 'add':
        return (
          <TradeForm
            onAdd={handleAddTrade}
            goal={activeAccount.goal}
            trades={accountTrades}
            isReal={activeAccount.isReal}
            activeAccountId={activeAccountId}
          />
        );
      case 'history':
        return <TradeList trades={accountTrades} onDelete={handleDeleteTrade} onUpdate={handleUpdateTrade} goal={activeAccount.goal} isReal={activeAccount.isReal} />;
      case 'calendar':
        return <CalendarView trades={accountTrades} onDelete={handleDeleteTrade} onUpdate={handleUpdateTrade} goal={activeAccount.goal} isReal={activeAccount.isReal} />;
      case 'notes':
        return <NotesView notes={notes} onUpdateNotes={setNotes} />;
      case 'ai':
        return (
          <AICoach
            trades={accountTrades}
            goal={activeAccount.goal}
            notes={notes}
            messages={messages}
            setMessages={setMessages}
            chatSessionRef={chatSessionRef}
            playbook={playbook}
            onUpdatePlaybook={setPlaybook}
          />
        );
      default:
        return null;
    }
  };

  if (authStatus === 'loading') {
    return (
      <div className="h-screen w-full bg-[#020617] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <LoginScreen
        userProfile={userProfile}
        onLoginSuccess={() => {
          setAuthStatus('authenticated');
          fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
            .then(r => r.json())
            .then(d => {
              if (d.user) {
                setCurrentUser(d.user);
                setCloudSyncUserScope(d.user.id);
              }
            })
            .catch(console.error);
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
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
              <BrainCircuit className="w-6 h-6 text-white" />
            </div>
            <span className={`font-black text-xl tracking-tight transition-opacity duration-300 md:block ${sidebarCollapsed ? 'md:w-0 md:opacity-0 md:hidden' : 'w-auto opacity-100'}`}>
              Trade<span className="text-emerald-500">Mind</span>
            </span>
          </div>

          <div className="flex md:hidden gap-2">
            <button onClick={toggleTheme} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              <Settings className="w-5 h-5" />
            </button>
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
            <LogOut className="w-5 h-5" />
            <span className={`font-medium whitespace-nowrap transition-all duration-300 ${sidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Salir</span>
          </button>

          <button onClick={() => setShowSettings(true)} className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 ${sidebarCollapsed ? 'justify-center' : ''}`} title="Ajustes">
            <Settings className="w-5 h-5" />
            <span className={`font-medium whitespace-nowrap transition-all duration-300 ${sidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Ajustes</span>
          </button>

          <button onClick={toggleTheme} className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 ${sidebarCollapsed ? 'justify-center' : ''}`} title="Cambiar Modo">
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className={`font-medium whitespace-nowrap transition-all duration-300 ${sidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Modo</span>
          </button>

          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 ${sidebarCollapsed ? 'justify-center' : ''}`}>
            {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            <span className={`font-medium whitespace-nowrap transition-all duration-300 ${sidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Colapsar</span>
          </button>

          <div className={`transition-all duration-300 ${sidebarCollapsed ? 'h-0 opacity-0 hidden' : 'bg-slate-100 dark:bg-slate-800 p-4 rounded-xl mt-2 border border-slate-200 dark:border-slate-700'}`}>
            <div className="flex justify-between items-center mb-2">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Tu Progreso</p>
              <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md">
                {progressPercentage.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden mb-2">
              <div className="bg-emerald-500 h-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ width: `${progressPercentage}%` }} />
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
        onAddAccount={(acc: TradingAccount) => { setAccounts(prev => [...prev, acc]); setActiveAccountId(acc.id); }}
        onUpdateAccount={(updated: TradingAccount) => setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a))}
        onDeleteAccount={(id: string) => {
          if (accounts.length <= 1) {
            setNotification({ title: 'No se puede eliminar', message: 'Debes tener al menos una cuenta', type: 'error' });
            return;
          }
          const updatedAccounts = accounts.filter(acc => acc.id !== id);
          setAccounts(updatedAccounts);
          if (activeAccountId === id) setActiveAccountId(updatedAccounts[0].id);
          setTrades(trades.filter(t => t.accountId !== id));
          setNotification({ title: 'Cuenta eliminada', message: 'La cuenta ha sido eliminada correctamente', type: 'success' });
        }}
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
