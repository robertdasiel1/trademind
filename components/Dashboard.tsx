
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Trade, TradeStatus, TradingAccount, UserProfile, TradeDirection } from '../types';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, ReferenceLine, ScatterChart, Scatter
} from 'recharts';
import { 
  TrendingUp, Award, BarChart3, Layers, AlertCircle, ShieldAlert, 
  Share2, Loader2, Target, Trophy, Skull, ShieldCheck, ChevronDown, 
  Briefcase, Check, Plus, Settings, Quote, Sparkles, Activity, 
  TrendingDown, RefreshCw, Rocket, Share, CalendarDays, Wallet, Calendar, Filter, X, Crosshair,
  BrainCircuit
} from 'lucide-react';
import html2canvas from 'html2canvas';

interface Props {
  trades: Trade[];
  account: TradingAccount;
  deadline: string;
  theme: 'light' | 'dark';
  accounts: TradingAccount[];
  activeAccountId: string;
  onSwitchAccount: (id: string) => void;
  userProfile: UserProfile;
  isPrivacyMode?: boolean;
}

const MOTIVATIONAL_QUOTES = [
  "Si el mercado no te da una razón clara para entrar, no entres.",
  "Mi prioridad ahora que estoy empezando no es ganar, es sobrevivir.",
  "El trading no se trata de tener la razón, se trata de hacer dinero.",
  "La disciplina es hacer lo que debes hacer, incluso cuando no quieres.",
  "Protege tu capital como si fuera tu vida.",
  "No persigas el precio, deja que el precio venga a ti.",
  "Cada pérdida es una lección, no un fracaso.",
  "La paciencia paga más que la inteligencia en este negocio.",
  "Planifica tu trade y opera tu plan.",
  "El mercado transfiere dinero del impaciente al paciente."
];

type DateRangeType = 'today' | 'week' | 'month' | 'all' | 'custom';

// Helper Global para determinar la FECHA DE SESIÓN (Coincidente con CalendarView)
const getSessionDateStr = (dateStr: string): string => {
    const d = new Date(dateStr);
    if (d.getHours() >= 18) {
      d.setDate(d.getDate() + 1);
    }
    // Formato Local YYYY-MM-DD
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const Dashboard: React.FC<Props> = ({ 
  trades, account, deadline, theme, accounts, activeAccountId, onSwitchAccount, userProfile, isPrivacyMode = false
}) => {
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  
  const [dateRange, setDateRange] = useState<DateRangeType>('all');
  const [showDateMenu, setShowDateMenu] = useState(false);
  const [customRange, setCustomRange] = useState({ start: '', end: '' });

  const [quoteIndex, setQuoteIndex] = useState(0);

  const dashboardRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const dateMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      const savedIndex = localStorage.getItem('trading_journal_quote_index');
      const lastUpdate = localStorage.getItem('trading_journal_quote_time');
      const now = Date.now();
      
      if (savedIndex && lastUpdate && (now - Number(lastUpdate) < 12 * 60 * 60 * 1000)) {
          setQuoteIndex(Number(savedIndex));
      } else {
          const newIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
          setQuoteIndex(newIndex);
          localStorage.setItem('trading_journal_quote_index', String(newIndex));
          localStorage.setItem('trading_journal_quote_time', String(now));
      }
      
      function handleClickOutside(event: MouseEvent) {
        if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
          setShowAccountMenu(false);
        }
        if (dateMenuRef.current && !dateMenuRef.current.contains(event.target as Node)) {
          setShowDateMenu(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- FILTER TRADES BY SESSION DATE KEY ---
  const filteredTrades = useMemo(() => {
    const today = new Date();
    const todayKey = getSessionDateStr(today.toISOString());

    return trades.filter(t => {
        const tradeSessionKey = getSessionDateStr(t.date);
        
        if (dateRange === 'all') return true;
        
        if (dateRange === 'today') {
            return tradeSessionKey === todayKey;
        }
        
        if (dateRange === 'week') {
             // Simplificación: últimos 7 días
             const d = new Date(t.date);
             const diff = (today.getTime() - d.getTime()) / (1000 * 3600 * 24);
             return diff <= 7;
        }
        
        if (dateRange === 'month') {
             // Mismo mes calendario basado en la fecha de sesión
             const tradeDate = new Date(tradeSessionKey + "T12:00:00");
             return tradeDate.getMonth() === today.getMonth() && tradeDate.getFullYear() === today.getFullYear();
        }
        
        if (dateRange === 'custom') {
            if (!customRange.start) return true;
            return tradeSessionKey >= customRange.start && (!customRange.end || tradeSessionKey <= customRange.end);
        }
        return true;
    });
  }, [trades, dateRange, customRange]);

  // --- STATS CALCULATION ---
  const globalProfit = useMemo(() => trades.reduce((acc, t) => acc + t.profit, 0), [trades]);
  const currentBalance = account.initialBalance + globalProfit;
  
  const liquidationLevel = account.initialBalance - account.maxDrawdownLimit;
  const currentCushion = currentBalance - liquidationLevel;
  const displayHealth = (currentCushion / account.maxDrawdownLimit) * 100;

  // Sorted by Execution Time for Curves
  const sortedTrades = useMemo(() => [...filteredTrades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [filteredTrades]);

  const stats = useMemo(() => {
    const profit = sortedTrades.reduce((acc, t) => acc + t.profit, 0);
    const totalTrades = sortedTrades.length;
    const wins = sortedTrades.filter(t => t.profit > 0).length;
    const losses = sortedTrades.filter(t => t.profit < 0).length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    
    const bestTrade = sortedTrades.reduce((max, t) => t.profit > max ? t.profit : max, 0);
    const worstTrade = sortedTrades.reduce((min, t) => t.profit < min ? t.profit : min, 0);

    const today = new Date();
    const deadlineDate = new Date(deadline);
    const timeDiff = deadlineDate.getTime() - today.getTime();
    const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

    return { profit, totalTrades, wins, losses, winRate, bestTrade, worstTrade, daysRemaining };
  }, [sortedTrades, deadline]);

  // --- ADVANCED LONG TERM STATS ---
  const advancedStats = useMemo(() => {
    const wins = sortedTrades.filter(t => t.profit > 0);
    const losses = sortedTrades.filter(t => t.profit < 0);

    const grossProfit = wins.reduce((acc, t) => acc + t.profit, 0);
    const grossLoss = Math.abs(losses.reduce((acc, t) => acc + t.profit, 0));

    const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 100 : 0) : grossProfit / grossLoss;
    
    // Expectancy per trade (Net Profit / Total Trades)
    const expectancy = sortedTrades.length > 0 ? stats.profit / sortedTrades.length : 0;

    // Project frequency (trades per day)
    let tradesPerDay = 0;
    if (sortedTrades.length > 1) {
        const first = new Date(sortedTrades[0].date).getTime();
        const last = new Date(sortedTrades[sortedTrades.length - 1].date).getTime();
        const days = Math.max(1, (last - first) / (1000 * 3600 * 24));
        tradesPerDay = sortedTrades.length / days;
    }

    // 6 Month projection (approx 120 trading days)
    const projected6Months = expectancy * (tradesPerDay || 0.5) * 20 * 6; // Fallback to 0.5 trades/day if no data

    return {
        profitFactor,
        expectancy,
        grossProfit,
        grossLoss,
        projected6Months,
        tradesPerDay,
        avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
        avgLoss: losses.length > 0 ? grossLoss / losses.length : 0
    };
  }, [sortedTrades, stats.profit]);

  // --- R-MULTIPLE DATA PREPARATION ---
  const rMultipleData = useMemo(() => {
    return sortedTrades
        .filter(t => t.stopLoss && t.stopLoss !== 0 && t.entryPrice !== t.stopLoss)
        .map((t, i) => {
            const risk = Math.abs(t.entryPrice - t.stopLoss!);
            // Evitar divisiones locas si el SL está pegado a la entrada por error de redondeo
            if (risk < 0.00001) return null;
            
            let reward = 0;
            if (t.direction === TradeDirection.LONG) {
                reward = t.exitPrice - t.entryPrice;
            } else {
                reward = t.entryPrice - t.exitPrice;
            }
            
            // R = Reward / Risk
            const r = reward / risk;
            
            return {
                id: t.id,
                index: i + 1,
                r: parseFloat(r.toFixed(2)),
                asset: t.asset,
                date: new Date(t.date).toLocaleDateString([], { month: '2-digit', day: '2-digit' }),
                result: t.profit
            };
        })
        .filter(item => item !== null);
  }, [sortedTrades]);

  const capitalData = useMemo(() => {
    let runningBalance = 0;
    return sortedTrades.map(t => {
      runningBalance += t.profit;
      // Para la gráfica visual, usamos MM/DD del session key
      const sessionKey = getSessionDateStr(t.date);
      const [y, m, d] = sessionKey.split('-');
      return {
        name: `${m}/${d}`,
        value: runningBalance,
        profit: t.profit
      };
    });
  }, [sortedTrades]);

  const gradientOffset = () => {
    if (capitalData.length === 0) return 0;
    const dataMax = Math.max(...capitalData.map((i) => i.value));
    const dataMin = Math.min(...capitalData.map((i) => i.value));
    if (dataMax <= 0) return 0;
    if (dataMin >= 0) return 1;
    return dataMax / (dataMax - dataMin);
  };
  
  const off = gradientOffset();

  const dailyData = useMemo(() => {
      const map: Record<string, number> = {};
      sortedTrades.forEach(t => {
          const sessionKey = getSessionDateStr(t.date);
          const [y, m, d] = sessionKey.split('-');
          const dayLabel = `${m}/${d}`;
          map[dayLabel] = (map[dayLabel] || 0) + t.profit;
      });
      return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [sortedTrades]);

  const assetData = useMemo(() => {
      const map: Record<string, number> = {};
      sortedTrades.forEach(t => {
          map[t.asset] = (map[t.asset] || 0) + t.profit;
      });
      return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [sortedTrades]);

  const pieData = [
      { name: 'Ganados', value: stats.wins, color: '#10b981' },
      { name: 'Perdidos', value: stats.losses, color: '#f43f5e' }
  ];

  const chartStyles = useMemo(() => {
     const isDark = theme === 'dark';
     return {
        tooltipContent: { 
            backgroundColor: isDark ? '#0f172a' : '#ffffff', 
            borderColor: isDark ? '#1e293b' : '#e2e8f0', 
            color: isDark ? '#fff' : '#0f172a',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
        },
        gridColor: isDark ? '#1e293b' : '#e2e8f0',
        axisColor: '#64748b',
        cursorFill: isDark ? '#1e293b' : '#e2e8f0'
     };
  }, [theme]);

  const handleShare = async () => {
      if (!dashboardRef.current) return;
      setIsGeneratingShare(true);
      try {
          const canvas = await html2canvas(dashboardRef.current, {
              backgroundColor: theme === 'dark' ? '#0f172a' : '#f8fafc',
              scale: 2
          });
          canvas.toBlob(async (blob) => {
              if (!blob) return;
              const file = new File([blob], 'trading-dashboard.png', { type: 'image/png' });
              if (navigator.share && navigator.canShare({ files: [file] })) {
                  try {
                      await navigator.share({
                          title: 'Mi Progreso en TradeMind',
                          text: `He completado ${stats.totalTrades} trades con un Win Rate de ${stats.winRate.toFixed(1)}%.`,
                          files: [file]
                      });
                      setShareFeedback('¡Compartido!');
                  } catch (e) { console.log('Share cancelled'); }
              } else {
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = 'trading-dashboard.png';
                  link.click();
                  setShareFeedback('Imagen descargada');
              }
          });
      } catch (err) { setShareFeedback('Error'); } 
      finally { setIsGeneratingShare(false); setTimeout(() => setShareFeedback(null), 3000); }
  };

  const getDateRangeLabel = () => {
      switch(dateRange) {
          case 'today': return 'Hoy';
          case 'week': return 'Esta Semana';
          case 'month': return 'Este Mes';
          case 'custom': return 'Rango';
          default: return 'Todo';
      }
  };

  return (
    <div ref={dashboardRef} className="space-y-6 pb-20 font-sans">
      
      {/* 1. HEADER "CENTRO DE MANDO" */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 text-slate-900 dark:text-white shadow-xl border border-slate-200 dark:border-slate-800 relative z-20 transition-colors duration-300">
          {/* ... existing header code ... */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10 items-center">
              
              <div className="flex flex-col justify-center">
                  <h1 className="text-3xl font-black tracking-tight mb-2">Centro de Mando</h1>
                  <div className="flex items-center gap-4 text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">
                      <span>Objetivo: <span className="text-emerald-600 dark:text-emerald-400 font-bold">${account.goal.toLocaleString()}</span></span>
                      <span>•</span>
                      <span>Colchón: <span className="text-slate-900 dark:text-white font-bold">{isPrivacyMode ? '****' : `$${currentCushion.toLocaleString()}`}</span></span>
                  </div>
                  
                  <div className="w-full max-w-md">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                          <span>Salud de Cuenta</span>
                          <span className={displayHealth > 100 ? 'text-emerald-600 dark:text-emerald-400' : displayHealth > 50 ? 'text-emerald-500' : 'text-rose-500'}>
                              {displayHealth.toFixed(1)}%
                          </span>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div 
                              className={`h-full rounded-full transition-all duration-1000 ${displayHealth > 50 ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                              style={{ width: `${Math.min(100, Math.max(0, displayHealth))}%` }}
                          ></div>
                      </div>
                  </div>
              </div>

              <div className="hidden lg:flex flex-col items-center justify-center text-center px-4 border-l border-r border-slate-100 dark:border-slate-800/50 h-full">
                  <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-500 text-[10px] font-bold uppercase tracking-widest mb-3">
                      <Sparkles className="w-3 h-3" /> Enfoque del Día <Sparkles className="w-3 h-3" />
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 italic font-medium leading-relaxed max-w-sm">"{MOTIVATIONAL_QUOTES[quoteIndex]}"</p>
              </div>

              <div className="flex flex-row items-end gap-6 justify-end ml-auto w-full lg:w-auto h-full">
                   
                   <div className="relative hidden md:block mb-2" ref={dateMenuRef}>
                       <div className="flex items-center gap-1">
                           {[
                               { id: 'today', label: '1D' },
                               { id: 'week', label: '1S' },
                               { id: 'month', label: '1M' },
                               { id: 'all', label: 'MAX' },
                               { id: 'custom', label: 'Custom' }
                           ].map((opt) => (
                               <button
                                   key={opt.id}
                                   onClick={() => {
                                       setDateRange(opt.id as DateRangeType);
                                       if (opt.id === 'custom') {
                                           setShowDateMenu(!showDateMenu);
                                       } else {
                                           setShowDateMenu(false);
                                       }
                                   }}
                                   className={`text-[10px] font-bold px-2 py-0.5 transition-colors rounded ${
                                       dateRange === opt.id 
                                       ? 'text-emerald-600 dark:text-emerald-400' 
                                       : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                   }`}
                               >
                                   {opt.label}
                               </button>
                           ))}
                       </div>

                       {dateRange === 'custom' && showDateMenu && (
                           <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden p-3 animate-in fade-in zoom-in-95 duration-200">
                               <div className="space-y-3">
                                   <div>
                                       <label className="text-[10px] text-slate-500 font-bold uppercase">Desde</label>
                                       <input 
                                           type="date" 
                                           value={customRange.start}
                                           onChange={(e) => setCustomRange({...customRange, start: e.target.value})}
                                           className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded p-2 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                                       />
                                   </div>
                                   <div>
                                       <label className="text-[10px] text-slate-500 font-bold uppercase">Hasta</label>
                                       <input 
                                           type="date" 
                                           value={customRange.end}
                                           onChange={(e) => setCustomRange({...customRange, end: e.target.value})}
                                           className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded p-2 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                                       />
                                   </div>
                                   <button 
                                    onClick={() => setShowDateMenu(false)}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 rounded transition-colors"
                                   >
                                       Aplicar Rango
                                   </button>
                               </div>
                           </div>
                       )}
                   </div>

                   <div className="flex flex-col gap-2 items-end">
                       <button 
                           onClick={handleShare}
                           disabled={isGeneratingShare}
                           className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-white text-slate-600 dark:text-slate-900 hover:bg-slate-200 dark:hover:bg-slate-200 rounded-lg font-bold text-xs transition-all w-full justify-center shadow-sm"
                       >
                           {isGeneratingShare ? <Loader2 className="w-3 h-3 animate-spin" /> : (shareFeedback ? <Check className="w-3 h-3" /> : <Share2 className="w-3 h-3" />)}
                           {shareFeedback || "Compartir Progreso"}
                       </button>

                       <div className="relative" ref={accountMenuRef}>
                            <button 
                                onClick={() => setShowAccountMenu(!showAccountMenu)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-all text-xs font-bold"
                            >
                                <Briefcase className="w-3 h-3 text-emerald-500" />
                                <span className="hidden sm:inline">{account.name}</span>
                                <ChevronDown className="w-3 h-3 text-slate-400" />
                            </button>
                            {showAccountMenu && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                                    {accounts.map(acc => (
                                        <button
                                            key={acc.id}
                                            onClick={() => { onSwitchAccount(acc.id); setShowAccountMenu(false); }}
                                            className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between ${activeAccountId === acc.id ? 'bg-slate-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                        >
                                            {acc.name}
                                            {activeAccountId === acc.id && <Check className="w-3 h-3" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                       </div>
                   </div>
              </div>
          </div>
      </div>

      {/* 2. KPI GRID (6 Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 relative z-0">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg relative group overflow-hidden transition-colors">
              <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-xl pointer-events-none group-hover:border-emerald-500/50 transition-colors"></div>
              <div className="relative z-10">
                  <div className="p-2 bg-emerald-500/10 rounded-lg w-fit mb-3"><TrendingUp className="w-4 h-4 text-emerald-500" /></div>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                      {dateRange === 'all' ? 'Ganancia Neta' : 'P/L (Periodo)'}
                  </p>
                  <p className={`text-xl font-black ${stats.profit >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                      {isPrivacyMode ? '****' : `$${stats.profit.toLocaleString()}`}
                  </p>
              </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg relative group overflow-hidden transition-colors">
              <div className="absolute inset-0 border-2 border-blue-500/20 rounded-xl pointer-events-none group-hover:border-blue-500/50 transition-colors"></div>
              <div className="relative z-10">
                  <div className="p-2 bg-blue-500/10 rounded-lg w-fit mb-3"><Award className="w-4 h-4 text-blue-500" /></div>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Win Rate</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white">
                      {stats.winRate.toFixed(1)}%
                  </p>
              </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg relative group overflow-hidden transition-colors">
              <div className="absolute inset-0 border-2 border-purple-500/20 rounded-xl pointer-events-none group-hover:border-purple-500/50 transition-colors"></div>
              <div className="relative z-10">
                  <div className="p-2 bg-purple-500/10 rounded-lg w-fit mb-3"><BarChart3 className="w-4 h-4 text-purple-500" /></div>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Trades</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white">
                      {stats.totalTrades}
                  </p>
              </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg relative group overflow-hidden transition-colors">
              <div className="absolute inset-0 border-2 border-cyan-500/20 rounded-xl pointer-events-none group-hover:border-cyan-500/50 transition-colors"></div>
              <div className="relative z-10">
                  <div className="p-2 bg-cyan-500/10 rounded-lg w-fit mb-3"><Trophy className="w-4 h-4 text-cyan-500" /></div>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Mejor Trade</p>
                  <p className="text-xl font-black text-emerald-500 dark:text-emerald-400">
                      {isPrivacyMode ? '****' : `+$${stats.bestTrade.toLocaleString()}`}
                  </p>
              </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg relative group overflow-hidden transition-colors">
              <div className="absolute inset-0 border-2 border-rose-500/20 rounded-xl pointer-events-none group-hover:border-rose-500/50 transition-colors"></div>
              <div className="relative z-10">
                  <div className="p-2 bg-rose-500/10 rounded-lg w-fit mb-3"><TrendingDown className="w-4 h-4 text-rose-500" /></div>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Peor Trade</p>
                  <p className="text-xl font-black text-rose-500 dark:text-rose-400">
                      {isPrivacyMode ? '****' : `-$${Math.abs(stats.worstTrade).toLocaleString()}`}
                  </p>
              </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg relative group overflow-hidden transition-colors">
              <div className="absolute inset-0 border-2 border-amber-500/20 rounded-xl pointer-events-none group-hover:border-amber-500/50 transition-colors"></div>
              <div className="relative z-10">
                  <div className="p-2 bg-amber-500/10 rounded-lg w-fit mb-3"><Layers className="w-4 h-4 text-amber-500" /></div>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Días Restantes</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white">
                      {stats.daysRemaining}
                  </p>
              </div>
          </div>
      </div>

      {/* 2.5 ADVANCED STATS ROW (New Section) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-0">
          {/* Card 1: Esperanza Matemática */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                  <Target className="w-24 h-24" />
              </div>
              <h3 className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-widest mb-1 flex items-center gap-2">
                  <BrainCircuit className="w-4 h-4 text-purple-500" /> Esperanza Matemática
              </h3>
              <div className="mt-4">
                  <p className={`text-3xl font-black ${advancedStats.expectancy > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {isPrivacyMode ? '****' : `$${advancedStats.expectancy.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                      Es lo que ganas (o pierdes) en promedio <strong>cada vez</strong> que ejecutas un trade.
                  </p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-4 text-xs">
                  <div>
                      <span className="text-slate-400 block mb-0.5">Avg Win</span>
                      <span className="font-bold text-emerald-500">{isPrivacyMode ? '****' : `$${advancedStats.avgWin.toFixed(0)}`}</span>
                  </div>
                  <div>
                      <span className="text-slate-400 block mb-0.5">Avg Loss</span>
                      <span className="font-bold text-rose-500">{isPrivacyMode ? '****' : `$${advancedStats.avgLoss.toFixed(0)}`}</span>
                  </div>
              </div>
          </div>

          {/* Card 2: Profit Factor */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                  <Activity className="w-24 h-24" />
              </div>
              <h3 className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-widest mb-1 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-500" /> Profit Factor
              </h3>
              <div className="mt-4 flex items-baseline gap-2">
                  <p className={`text-3xl font-black ${advancedStats.profitFactor >= 2 ? 'text-emerald-500' : advancedStats.profitFactor >= 1.2 ? 'text-blue-500' : 'text-orange-500'}`}>
                      {advancedStats.profitFactor.toFixed(2)}
                  </p>
                  <span className="text-sm font-bold text-slate-400">
                      {advancedStats.profitFactor >= 2 ? '🔥 Excelente' : advancedStats.profitFactor >= 1.2 ? '✅ Saludable' : '⚠️ Precaución'}
                  </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                  Por cada $1 que pierdes, el mercado te devuelve <strong>${advancedStats.profitFactor.toFixed(2)}</strong>.
              </p>
              
              {/* Simple Bar Gauge */}
              <div className="mt-6 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                  <div className="bg-rose-500 h-full w-1/3"></div>
                  <div className="bg-orange-500 h-full w-1/6"></div>
                  <div className="bg-emerald-500 h-full flex-1 relative">
                      {/* Marker */}
                      <div 
                          className="absolute top-0 bottom-0 w-1 bg-white dark:bg-slate-900 border-x border-slate-300 dark:border-slate-700 shadow-lg" 
                          style={{ left: `${Math.min(100, (Math.max(0, advancedStats.profitFactor - 1.0) / 2.0) * 100)}%` }} // Position logic: starts at 1.0 = 50% ish
                      ></div>
                  </div>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                  <span>1.0</span>
                  <span>1.5</span>
                  <span>3.0+</span>
              </div>
          </div>

          {/* Card 3: Proyección */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                  <Rocket className="w-24 h-24" />
              </div>
              <h3 className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-widest mb-1 flex items-center gap-2">
                  <Rocket className="w-4 h-4 text-orange-500" /> Proyección 6 Meses
              </h3>
              <div className="mt-4">
                  <p className={`text-3xl font-black ${advancedStats.projected6Months > 0 ? 'text-emerald-500' : 'text-slate-500'}`}>
                      {isPrivacyMode ? '****' : `${advancedStats.projected6Months > 0 ? '+' : ''}$${Math.round(advancedStats.projected6Months).toLocaleString()}`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                      Estimación basada en tu Esperanza Matemática y frecuencia actual ({advancedStats.tradesPerDay.toFixed(1)} trades/día).
                  </p>
              </div>
              <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] text-slate-500 italic text-center">
                      "El trading es un juego de números. Mantén tu esperanza positiva y deja que las probabilidades hagan el resto."
                  </p>
              </div>
          </div>
      </div>

      {/* 3. CHARTS ROW 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-0">
          {/* Capital Curve */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg transition-colors">
               <div className="flex justify-between items-center mb-6">
                   <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
                       <TrendingUp className="w-4 h-4 text-emerald-500" /> Curva de P/L {dateRange !== 'all' ? `(${getDateRangeLabel()})` : ''}
                   </h3>
               </div>
               <div className={`h-[300px] w-full ${isPrivacyMode ? 'blur-md select-none' : ''}`}>
                  <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={capitalData}>
                          <defs>
                              <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset={off} stopColor="#10b981" stopOpacity={1} />
                                  <stop offset={off} stopColor="#f43f5e" stopOpacity={1} />
                              </linearGradient>
                              <linearGradient id="splitFill" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset={off} stopColor="#10b981" stopOpacity={0.2} />
                                  <stop offset={off} stopColor="#f43f5e" stopOpacity={0.2} />
                              </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartStyles.gridColor} vertical={false} />
                          <XAxis 
                              dataKey="name" 
                              stroke={chartStyles.axisColor} 
                              fontSize={10} 
                              tickLine={false}
                              axisLine={false}
                          />
                          <YAxis 
                              stroke={chartStyles.axisColor} 
                              fontSize={10} 
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(val) => `$${val}`}
                          />
                          <Tooltip 
                              contentStyle={chartStyles.tooltipContent}
                              itemStyle={{ color: 'inherit' }}
                          />
                          <ReferenceLine y={0} stroke={chartStyles.gridColor} strokeDasharray="3 3" />
                          <Area 
                              type="monotone" 
                              dataKey="value" 
                              stroke="url(#splitColor)" 
                              strokeWidth={3}
                              fillOpacity={1} 
                              fill="url(#splitFill)" 
                          />
                      </AreaChart>
                  </ResponsiveContainer>
               </div>
          </div>

          {/* Distribution Donut */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg transition-colors">
               <h3 className="font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2 text-sm">
                   <Trophy className="w-4 h-4 text-yellow-500" /> Distribución
               </h3>
               <div className="h-[250px] w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                          <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={65}
                              outerRadius={85}
                              paddingAngle={5}
                              dataKey="value"
                              stroke="none"
                          >
                              {pieData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                          </Pie>
                          <Tooltip contentStyle={chartStyles.tooltipContent} />
                      </PieChart>
                  </ResponsiveContainer>
                  {/* Center Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-3xl font-black text-slate-900 dark:text-white">{stats.winRate.toFixed(0)}%</span>
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Win Rate</span>
                  </div>
               </div>
               {/* Custom Legend */}
               <div className="flex flex-col gap-2 mt-4">
                  <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Ganados</span>
                      </div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{stats.wins}</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Perdidos</span>
                      </div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{stats.losses}</span>
                  </div>
               </div>
          </div>
      </div>

      {/* 4. CHARTS ROW 2 (Bar Charts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-0">
           {/* Daily Performance */}
           <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg transition-colors">
               <h3 className="font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2 text-sm">
                   <BarChart3 className="w-4 h-4 text-emerald-500" /> Rendimiento Diario (Por Sesión)
               </h3>
               <div className={`h-[200px] w-full ${isPrivacyMode ? 'blur-md select-none' : ''}`}>
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartStyles.gridColor} vertical={false} />
                          <XAxis dataKey="name" stroke={chartStyles.axisColor} fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke={chartStyles.axisColor} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                          <Tooltip 
                              cursor={{fill: chartStyles.cursorFill, opacity: 0.4}}
                              contentStyle={chartStyles.tooltipContent}
                          />
                          <ReferenceLine y={0} stroke={chartStyles.gridColor} />
                          <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                  </ResponsiveContainer>
               </div>
           </div>

           {/* Asset Performance */}
           <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg transition-colors">
               <h3 className="font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2 text-sm">
                   <BarChart3 className="w-4 h-4 text-blue-500" /> Rendimiento por Activo
               </h3>
               <div className={`h-[200px] w-full ${isPrivacyMode ? 'blur-md select-none' : ''}`}>
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={assetData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartStyles.gridColor} vertical={false} />
                          <XAxis dataKey="name" stroke={chartStyles.axisColor} fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke={chartStyles.axisColor} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                          <Tooltip 
                              cursor={{fill: chartStyles.cursorFill, opacity: 0.4}}
                              contentStyle={chartStyles.tooltipContent}
                          />
                          <ReferenceLine y={0} stroke={chartStyles.gridColor} />
                          <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                  </ResponsiveContainer>
               </div>
           </div>
      </div>

      {/* 5. RISK ANALYSIS ROW (New) */}
      <div className="grid grid-cols-1 gap-6 relative z-0">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg transition-colors">
              <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
                      <Crosshair className="w-4 h-4 text-purple-500" /> Distribución de Riesgo:Beneficio (R-Multiples)
                  </h3>
                  {rMultipleData.length > 0 && (
                      <div className="flex gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Ganancia</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span>Pérdida</span>
                      </div>
                  )}
              </div>
              
              {rMultipleData.length > 0 ? (
                  <div className={`h-[300px] w-full ${isPrivacyMode ? 'blur-md select-none' : ''}`}>
                      <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke={chartStyles.gridColor} vertical={false} />
                              <XAxis type="number" dataKey="index" name="Trade" stroke={chartStyles.axisColor} fontSize={10} tickLine={false} axisLine={false} tickCount={rMultipleData.length > 10 ? 10 : rMultipleData.length} domain={['dataMin', 'dataMax']} />
                              <YAxis type="number" dataKey="r" name="R-Multiple" stroke={chartStyles.axisColor} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}R`} />
                              <Tooltip 
                                  cursor={{ strokeDasharray: '3 3' }} 
                                  contentStyle={chartStyles.tooltipContent}
                                  formatter={(value: any, name: any, props: any) => {
                                      if (name === 'r') return [`${value}R`, 'Riesgo:Beneficio'];
                                      return [value, name];
                                  }}
                                  labelFormatter={() => ''}
                              />
                              <ReferenceLine y={0} stroke={chartStyles.gridColor} strokeWidth={2} />
                              <ReferenceLine y={1} stroke="#10b981" strokeDasharray="3 3" opacity={0.5} label={{ value: '1R', fill: '#10b981', fontSize: 10 }} />
                              <ReferenceLine y={2} stroke="#10b981" strokeDasharray="3 3" opacity={0.3} label={{ value: '2R', fill: '#10b981', fontSize: 10 }} />
                              <ReferenceLine y={-1} stroke="#f43f5e" strokeDasharray="3 3" opacity={0.5} label={{ value: '-1R', fill: '#f43f5e', fontSize: 10 }} />
                              <Scatter name="Trades" data={rMultipleData} fill="#8884d8">
                                  {rMultipleData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.r >= 0 ? '#10b981' : '#f43f5e'} />
                                  ))}
                              </Scatter>
                          </ScatterChart>
                      </ResponsiveContainer>
                  </div>
              ) : (
                  <div className="h-[300px] flex flex-col items-center justify-center text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                      <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                      <p className="text-sm font-medium">No hay datos de R:R disponibles.</p>
                      <p className="text-xs opacity-70 mt-1">Asegúrate de registrar tus trades con "Stop Loss" para ver esta gráfica.</p>
                  </div>
              )}
          </div>
      </div>

    </div>
  );
};

export default Dashboard;
