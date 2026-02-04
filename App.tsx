import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DataImport } from './src/components/DataImport';
import Dashboard from './components/Dashboard';
import TradeList from './components/TradeList';
import TradeForm from './components/TradeForm';
import NotesView from './components/NotesView';
import { AICoach } from './src/components/AICoach';
import { SettingsModal } from './src/components/SettingsModal';
import CalendarView from './components/CalendarView';
import { LoginScreen } from './src/components/LoginScreen';
import { showToast } from './src/components/NotificationToast';
import type { Trade, Note, TradingAccount, UserProfile } from './src/types';
import { syncFromCloudOnStartup, scheduleCloudUploadDebounced } from "./src/utils/cloudBackup";

const DEFAULT_PROFILE: UserProfile = {
  name: 'Trader',
  tradingType: 'Futuros',
  tradingStyle: 'Day Trading',
  username: 'admin',
};

const DEFAULT_ACCOUNT: TradingAccount = {
  id: 'default-acc-1',
  name: 'Cuenta Principal',
  broker: 'NinjaTrader',
  initialBalance: 50000,
  goal: 50000,
  deadline: '2026-08-02',
  maxDrawdown: 2500,
  currency: 'USD',
};

function safeJsonParse<T = any>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function ensureAccountsArray(value: any): TradingAccount[] {
  if (Array.isArray(value) && value.length > 0) return value as TradingAccount[];
  return [DEFAULT_ACCOUNT];
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [trades, setTrades] = useState<Trade[]>(() => {
    const parsed = safeJsonParse<any>(localStorage.getItem('trading_journal_trades'));
    return Array.isArray(parsed) ? parsed : [];
  });

  const [notes, setNotes] = useState<Note[]>(() => {
    const parsed = safeJsonParse<any>(localStorage.getItem('trading_journal_global_notes'));
    return Array.isArray(parsed) ? parsed : [];
  });

  const [accounts, setAccounts] = useState<TradingAccount[]>(() => {
    const parsed = safeJsonParse<any>(localStorage.getItem('trading_journal_accounts'));
    return ensureAccountsArray(parsed);
  });

  const [activeAccountId, setActiveAccountId] = useState<string>(() => {
    return localStorage.getItem('trading_journal_active_account') || DEFAULT_ACCOUNT.id;
  });

  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const parsed = safeJsonParse<any>(localStorage.getItem('trading_journal_profile'));
    return parsed && typeof parsed === 'object' ? parsed : DEFAULT_PROFILE;
  });

  const [playbook, setPlaybook] = useState<any>(() => {
    const parsed = safeJsonParse<any>(localStorage.getItem('trading_journal_playbook'));
    return parsed ?? null;
  });

  const [messages, setMessages] = useState<any>(() => {
    const parsed = safeJsonParse<any>(localStorage.getItem('trading_journal_chat_history'));
    return Array.isArray(parsed) ? parsed : [];
  });

  const [milestones, setMilestones] = useState<any>(() => {
    const parsed = safeJsonParse<any>(localStorage.getItem('trading_journal_milestones'));
    return Array.isArray(parsed) ? parsed : [];
  });

  // --- AUTH STATE ---
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [currentUser, setCurrentUser] = useState<{id: string, username: string, role: string} | null>(null);

  // --- CLOUD SYNC CONTROL ---
  const didCloudSyncRef = useRef(false);
  const didAutoUploadRef = useRef(false);

  // Persist theme
  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Persist main data
  useEffect(() => {
    localStorage.setItem('trading_journal_trades', JSON.stringify(trades));
  }, [trades]);

  useEffect(() => {
    localStorage.setItem('trading_journal_global_notes', JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    localStorage.setItem('trading_journal_accounts', JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem('trading_journal_active_account', activeAccountId);
  }, [activeAccountId]);

  useEffect(() => {
    localStorage.setItem('trading_journal_profile', JSON.stringify(userProfile));
  }, [userProfile]);

  useEffect(() => {
    localStorage.setItem('trading_journal_playbook', JSON.stringify(playbook));
  }, [playbook]);

  useEffect(() => {
    localStorage.setItem('trading_journal_chat_history', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('trading_journal_milestones', JSON.stringify(milestones));
  }, [milestones]);

  // Si no hay datos, inicializar defaults (y evitar cuentas vacías)
  useEffect(() => {
    if (!accounts || accounts.length === 0) {
      setAccounts([DEFAULT_ACCOUNT]);
      setActiveAccountId(DEFAULT_ACCOUNT.id);
      return;
    }
    if (!accounts.some(a => a.id === activeAccountId)) {
      setActiveAccountId(accounts[0].id);
    }
  }, []);

  // Auth check
  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' });
      if (!res.ok) {
        setAuthStatus('unauthenticated');
        setCurrentUser(null);
        return;
      }
      const data = await res.json();
      setAuthStatus('authenticated');
      setCurrentUser(data?.user ?? null);
    } catch {
      setAuthStatus('unauthenticated');
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Run cloud sync once per page load AFTER we know we're authenticated.
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      didCloudSyncRef.current = false;
      didAutoUploadRef.current = false;
      return;
    }

    if (authStatus !== 'authenticated') return;
    if (didCloudSyncRef.current) return;

    didCloudSyncRef.current = true;
    syncFromCloudOnStartup().catch(console.error);
  }, [authStatus]);

  // Auto-upload (debounced) whenever your data changes while authenticated.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    if (!didAutoUploadRef.current) {
      didAutoUploadRef.current = true;
      return;
    }

    scheduleCloudUploadDebounced(1200);
  }, [
    authStatus,
    trades,
    notes,
    accounts,
    activeAccountId,
    userProfile,
    playbook,
    messages,
    milestones,
  ]);

  // Active account (robusto)
  const activeAccount = useMemo(() => {
    const found = accounts?.find(acc => acc.id === activeAccountId);
    return found || accounts?.[0] || DEFAULT_ACCOUNT;
  }, [accounts, activeAccountId]);

  // Trades filtered by active account
  const accountTrades = useMemo(() => {
    const fallbackId = activeAccount?.id || accounts?.[0]?.id;
    return trades.filter(t => t.accountId === (activeAccountId || fallbackId));
  }, [trades, activeAccountId, activeAccount?.id, accounts]);

  const totalProfit = useMemo(() => {
    return accountTrades.reduce((sum, t) => sum + (Number(t.profit) || 0), 0);
  }, [accountTrades]);

  const progressPercentage = useMemo(() => {
    const goal = Number(activeAccount?.goal) || 0;
    if (goal <= 0) return 0;
    return Math.round((totalProfit / goal) * 10000) / 100; // 2 decimals
  }, [totalProfit, activeAccount?.goal]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      setAuthStatus('unauthenticated');
      setCurrentUser(null);
    }
  }, []);

  const handleLoginSuccess = useCallback(async () => {
    await checkAuth();
  }, [checkAuth]);

  // Guard extra: si por alguna razón NO hay activeAccount, evita crash
  if (!activeAccount) return null;

  // --- UI ---
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        Cargando...
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} theme={theme} setTheme={setTheme} />;
  }

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <Dashboard
        theme={theme}
        setTheme={setTheme}
        trades={accountTrades}
        accounts={accounts}
        activeAccountId={activeAccountId}
        setActiveAccountId={setActiveAccountId}
        activeAccount={activeAccount}
        totalProfit={totalProfit}
        progressPercentage={progressPercentage}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <DataImport
          theme={theme}
          trades={trades}
          setTrades={setTrades}
          accounts={accounts}
          setAccounts={setAccounts}
          setActiveAccountId={setActiveAccountId}
          userProfile={userProfile}
          setUserProfile={setUserProfile}
          notes={notes}
          setNotes={setNotes}
          playbook={playbook}
          setPlaybook={setPlaybook}
          messages={messages}
          setMessages={setMessages}
          milestones={milestones}
          setMilestones={setMilestones}
        />

        <CalendarView theme={theme} trades={accountTrades} />

        <TradeList
          theme={theme}
          trades={accountTrades}
          setTrades={setTrades}
          activeAccountId={activeAccountId}
          showToast={showToast}
        />

        <NotesView theme={theme} notes={notes} setNotes={setNotes} />

        <AICoach
          theme={theme}
          trades={accountTrades}
          userProfile={userProfile}
          messages={messages}
          setMessages={setMessages}
          playbook={playbook}
          milestones={milestones}
        />

        <SettingsModal
          theme={theme}
          userProfile={userProfile}
          setUserProfile={setUserProfile}
          activeAccount={activeAccount}
          setActiveAccount={(acc: TradingAccount) => {
            setAccounts(prev => prev.map(a => (a.id === acc.id ? acc : a)));
          }}
          showToast={showToast}
        />
      </div>
    </div>
  );
}

export default App;
