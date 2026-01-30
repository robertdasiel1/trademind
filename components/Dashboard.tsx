
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Trade, TradeStatus, TradingAccount, UserProfile } from '../types';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, ReferenceLine
} from 'recharts';
import { 
  TrendingUp, Award, BarChart3, Layers, AlertCircle, ShieldAlert, 
  Share2, Loader2, Target, Trophy, Skull, ShieldCheck, ChevronDown, 
  Briefcase, Check, Plus, Settings, Quote, Sparkles, Activity, 
  TrendingDown, RefreshCw, Rocket, Share, CalendarDays, Wallet, Calendar, Filter, X
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

const Dashboard: React.FC<Props> = ({ 
  trades, account, deadline, theme, accounts, activeAccountId, onSwitchAccount, userProfile
}) => {
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  
  // Date Range State
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

  // --- FILTER TRADES BY DATE RANGE ---
  const filteredTrades = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return trades.filter(t => {
        const tDate = new Date(t.date).getTime();
        
        if (dateRange === 'all') return true;
        
        if (dateRange === 'today') return tDate >= todayStart;
        
        if (dateRange === 'week') {
             // Start of current week (Monday)
             const day = now.getDay();
             const diff = now.getDate() - day + (day === 0 ? -6 : 1); 
             const monday = new Date(now.setDate(diff));
             monday.setHours(0,0,0,0);
             return tDate >= monday.getTime();
        }
        
        if (dateRange === 'month') {
             // Start of current month
             const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
             return tDate >= startOfMonth;
        }
        
        if (dateRange === 'custom') {
            if (!customRange.start) return true;
            const start = new Date(customRange.start).getTime();
            const end = customRange.end ? new Date(customRange.end).getTime() + 86400000 : Infinity; 
            return tDate >= start && tDate < end;
        }
        return true;
    });
  }, [trades, dateRange, customRange]);

  // --- STATS CALCULATION ---
  // 1. GLOBAL STATS (For Account Health / Cushion - unaffected by filters)
  const globalProfit = useMemo(() => trades.reduce((acc, t) => acc + t.profit, 0), [trades]);
  const currentBalance = account.initialBalance + globalProfit;
  
  const liquidationLevel = account.initialBalance - account.maxDrawdownLimit;
  const currentCushion = currentBalance - liquidationLevel;
  const displayHealth = (currentCushion / account.maxDrawdownLimit) * 100;

  // 2. FILTERED STATS (For Charts & KPIs)
  const sortedTrades = useMemo(() => [...filteredTrades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [filteredTrades]);

  const stats = useMemo(() => {
    const profit = sortedTrades.reduce((acc, t) => acc + t.profit, 0);
    const totalTrades = sortedTrades.length;
    const wins = sortedTrades.filter(t => t.profit > 0).length;
    const losses = sortedTrades.filter(t => t.profit < 0).length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    
    // Best & Worst Trade
    const bestTrade = sortedTrades.reduce((max, t) => t.profit > max ? t.profit : max, 0);
    const worstTrade = sortedTrades.reduce((min, t) => t.profit < min ? t.profit : min, 0);

    // Days Remaining (Static)
    const today = new Date();
    const deadlineDate = new Date(deadline);
    const timeDiff = deadlineDate.getTime() - today.getTime();
    const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

    return { profit, totalTrades, wins, losses, winRate, bestTrade, worstTrade, daysRemaining };
  }, [sortedTrades, deadline]);

  // Chart Data: Capital Curve (Relative to period start or cumulative? Usually relative for filtered view)
  const capitalData = useMemo(() => {
    let runningBalance = 0; // Starts at 0 for the selected period P/L view
    return sortedTrades.map(t => {
      runningBalance += t.profit;
      return {
        name: new Date(t.date).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }),
        value: runningBalance,
        profit: t.profit
      };
    });
  }, [sortedTrades]);

  // Calculate Gradient Offset
  const gradientOffset = () => {
    if (capitalData.length === 0) return 0;
    const dataMax = Math.max(...capitalData.map((i) => i.value));
    const dataMin = Math.min(...capitalData.map((i) => i.value));
  
    if (dataMax <= 0) return 0;
    if (dataMin >= 0) return 1;
  
    return dataMax / (dataMax - dataMin);
  };
  
  const off = gradientOffset();

  // Chart Data: Daily Performance
  const dailyData = useMemo(() => {
      const map: Record<string, number> = {};
      sortedTrades.forEach(t => {
          const day = new Date(t.date).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
          map[day] = (map[day] || 0) + t.profit;
      });
      return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [sortedTrades]);

  // Chart Data: Asset Performance
  const assetData = useMemo(() => {
      const map: Record<string, number> = {};
      sortedTrades.forEach(t => {
          map[t.asset] = (map[t.asset] || 0) + t.profit;
      });
      return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [sortedTrades]);

  // Chart Data: Distribution
  const pieData = [
      { name: 'Ganados', value: stats.wins, color: '#10b981' },
      { name: 'Perdidos', value: stats.losses, color: '#f43f5e' }
  ];

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
                  } catch (e) {
                      console.log('Share cancelled');
                  }
              } else {
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = 'trading-dashboard.png';
                  link.click();
                  setShareFeedback('Imagen descargada');
              }
          });
      } catch (err) {
          setShareFeedback('Error');
      } finally {
          setIsGeneratingShare(false);
          setTimeout(() => setShareFeedback(null), 3000);
      }
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
      
      {/* 1. HEADER "CENTRO DE MANDO" - Updated Grid Layout */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 relative z-20">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10 items-center">
              
              {/* Left Column: Title & Health */}
              <div className="flex flex-col justify-center">
                  <h1 className="text-3xl font-black tracking-tight mb-2">Centro de Mando</h1>
                  <div className="flex items-center gap-4 text-sm font-medium text-slate-400 mb-4">
                      <span>Objetivo: <span className="text-emerald-400 font-bold">${account.goal.toLocaleString()}</span></span>
                      <span>•</span>
                      <span>Colchón: <span className="text-white font-bold">${currentCushion.toLocaleString()}</span></span>
                  </div>
                  
                  {/* Health Bar */}
                  <div className="w-full max-w-md">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                          <span>Salud de Cuenta</span>
                          <span className={displayHealth > 100 ? 'text-emerald-500' : displayHealth > 50 ? 'text-emerald-400' : 'text-rose-500'}>
                              {displayHealth.toFixed(1)}%
                          </span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                              className={`h-full rounded-full transition-all duration-1000 ${displayHealth > 50 ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                              style={{ width: `${Math.min(100, Math.max(0, displayHealth))}%` }}
                          ></div>
                      </div>
                  </div>
              </div>

              {/* Center Column: Quote - Perfectly Centered */}
              <div className="hidden lg:flex flex-col items-center justify-center text-center px-4 border-l border-r border-slate-800/50 h-full">
                  <div className="flex items-center justify-center gap-2 mb-3 text-emerald-500 text-[10px] font-bold uppercase tracking-widest">
                      <Sparkles className="w-3 h-3" /> Enfoque del Día <Sparkles className="w-3 h-3" />
                  </div>
                  <p className="text-slate-300 italic font-medium leading-relaxed max-w-sm">"{MOTIVATIONAL_QUOTES[quoteIndex]}"</p>
              </div>

              {/* Right Column: Actions & Date Picker (REARRANGED) */}
              <div className="flex flex-row items-end gap-6 justify-end ml-auto w-full lg:w-auto h-full">
                   
                   {/* 1. Date Range Selector - TEXT ONLY (Now on the LEFT of the buttons, aligned to bottom) */}
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
                                       ? 'text-emerald-400' 
                                       : 'text-slate-500 hover:text-slate-300'
                                   }`}
                               >
                                   {opt.label}
                               </button>
                           ))}
                       </div>

                       {/* Custom Range Popover */}
                       {dateRange === 'custom' && showDateMenu && (
                           <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden p-3 animate-in fade-in zoom-in-95 duration-200">
                               <div className="space-y-3">
                                   <div>
                                       <label className="text-[10px] text-slate-500 font-bold uppercase">Desde</label>
                                       <input 
                                           type="date" 
                                           value={customRange.start}
                                           onChange={(e) => setCustomRange({...customRange, start: e.target.value})}
                                           className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-emerald-500"
                                       />
                                   </div>
                                   <div>
                                       <label className="text-[10px] text-slate-500 font-bold uppercase">Hasta</label>
                                       <input 
                                           type="date" 
                                           value={customRange.end}
                                           onChange={(e) => setCustomRange({...customRange, end: e.target.value})}
                                           className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-emerald-500"
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

                   {/* 2. Vertical Stack: Share (Top) & Account (Bottom) */}
                   <div className="flex flex-col gap-2 items-end">
                       {/* Share Button (Top) */}
                       <button 
                           onClick={handleShare}
                           disabled={isGeneratingShare}
                           className="flex items-center gap-2 px-3 py-1.5 bg-white text-slate-900 hover:bg-slate-200 rounded-lg font-bold text-xs transition-all w-full justify-center shadow-lg shadow-white/10"
                       >
                           {isGeneratingShare ? <Loader2 className="w-3 h-3 animate-spin" /> : (shareFeedback ? <Check className="w-3 h-3" /> : <Share2 className="w-3 h-3" />)}
                           {shareFeedback || "Compartir Progreso"}
                       </button>

                       {/* Account Switcher (Bottom) */}
                       <div className="relative" ref={accountMenuRef}>
                            <button 
                                onClick={() => setShowAccountMenu(!showAccountMenu)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-all text-xs font-bold"
                            >
                                <Briefcase className="w-3 h-3 text-emerald-500" />
                                <span className="hidden sm:inline">{account.name}</span>
                                <ChevronDown className="w-3 h-3 text-slate-500" />
                            </button>
                            {showAccountMenu && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                                    {accounts.map(acc => (
                                        <button
                                            key={acc.id}
                                            onClick={() => { onSwitchAccount(acc.id); setShowAccountMenu(false); }}
                                            className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between ${activeAccountId === acc.id ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}
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
          {/* Card 1: Ganancia Neta */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg relative group overflow-hidden">
              <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-xl pointer-events-none group-hover:border-emerald-500/50 transition-colors"></div>
              <div className="relative z-10">
                  <div className="p-2 bg-emerald-500/10 rounded-lg w-fit mb-3"><TrendingUp className="w-4 h-4 text-emerald-500" /></div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      {dateRange === 'all' ? 'Ganancia Neta' : 'P/L (Periodo)'}
                  </p>
                  <p className={`text-xl font-black ${stats.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ${stats.profit.toLocaleString()}
                  </p>
              </div>
          </div>

          {/* Card 2: Win Rate */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg relative group overflow-hidden">
              <div className="absolute inset-0 border-2 border-blue-500/20 rounded-xl pointer-events-none group-hover:border-blue-500/50 transition-colors"></div>
              <div className="relative z-10">
                  <div className="p-2 bg-blue-500/10 rounded-lg w-fit mb-3"><Award className="w-4 h-4 text-blue-500" /></div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Win Rate</p>
                  <p className="text-xl font-black text-white">
                      {stats.winRate.toFixed(1)}%
                  </p>
              </div>
          </div>

          {/* Card 3: Trades */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg relative group overflow-hidden">
              <div className="absolute inset-0 border-2 border-purple-500/20 rounded-xl pointer-events-none group-hover:border-purple-500/50 transition-colors"></div>
              <div className="relative z-10">
                  <div className="p-2 bg-purple-500/10 rounded-lg w-fit mb-3"><BarChart3 className="w-4 h-4 text-purple-500" /></div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Trades</p>
                  <p className="text-xl font-black text-white">
                      {stats.totalTrades}
                  </p>
              </div>
          </div>

          {/* Card 4: Mejor Trade */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg relative group overflow-hidden">
              <div className="absolute inset-0 border-2 border-cyan-500/20 rounded-xl pointer-events-none group-hover:border-cyan-500/50 transition-colors"></div>
              <div className="relative z-10">
                  <div className="p-2 bg-cyan-500/10 rounded-lg w-fit mb-3"><Trophy className="w-4 h-4 text-cyan-500" /></div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mejor Trade</p>
                  <p className="text-xl font-black text-emerald-400">
                      +${stats.bestTrade.toLocaleString()}
                  </p>
              </div>
          </div>

          {/* Card 5: Peor Trade */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg relative group overflow-hidden">
              <div className="absolute inset-0 border-2 border-rose-500/20 rounded-xl pointer-events-none group-hover:border-rose-500/50 transition-colors"></div>
              <div className="relative z-10">
                  <div className="p-2 bg-rose-500/10 rounded-lg w-fit mb-3"><TrendingDown className="w-4 h-4 text-rose-500" /></div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Peor Trade</p>
                  <p className="text-xl font-black text-rose-400">
                      -${Math.abs(stats.worstTrade).toLocaleString()}
                  </p>
              </div>
          </div>

          {/* Card 6: Días Restantes */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg relative group overflow-hidden">
              <div className="absolute inset-0 border-2 border-amber-500/20 rounded-xl pointer-events-none group-hover:border-amber-500/50 transition-colors"></div>
              <div className="relative z-10">
                  <div className="p-2 bg-amber-500/10 rounded-lg w-fit mb-3"><Layers className="w-4 h-4 text-amber-500" /></div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Días Restantes</p>
                  <p className="text-xl font-black text-white">
                      {stats.daysRemaining}
                  </p>
              </div>
          </div>
      </div>

      {/* 3. CHARTS ROW 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-0">
          {/* Capital Curve */}
          <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
               <div className="flex justify-between items-center mb-6">
                   <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                       <TrendingUp className="w-4 h-4 text-emerald-500" /> Curva de P/L {dateRange !== 'all' ? `(${getDateRangeLabel()})` : ''}
                   </h3>
               </div>
               <div className="h-[300px] w-full">
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
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis 
                              dataKey="name" 
                              stroke="#64748b" 
                              fontSize={10} 
                              tickLine={false}
                              axisLine={false}
                          />
                          <YAxis 
                              stroke="#64748b" 
                              fontSize={10} 
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(val) => `$${val}`}
                          />
                          <Tooltip 
                              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }}
                              itemStyle={{ color: '#fff' }}
                          />
                          <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
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
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
               <h3 className="font-bold text-white mb-6 flex items-center gap-2 text-sm">
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
                          >
                              {pieData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                              ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }} />
                      </PieChart>
                  </ResponsiveContainer>
                  {/* Center Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-3xl font-black text-white">{stats.winRate.toFixed(0)}%</span>
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Win Rate</span>
                  </div>
               </div>
               {/* Custom Legend */}
               <div className="flex flex-col gap-2 mt-4">
                  <div className="flex justify-between items-center bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                      <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                          <span className="text-xs font-bold text-slate-300">Ganados</span>
                      </div>
                      <span className="text-xs font-bold text-white">{stats.wins}</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                      <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                          <span className="text-xs font-bold text-slate-300">Perdidos</span>
                      </div>
                      <span className="text-xs font-bold text-white">{stats.losses}</span>
                  </div>
               </div>
          </div>
      </div>

      {/* 4. CHARTS ROW 2 (Bar Charts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-0">
           {/* Daily Performance */}
           <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
               <h3 className="font-bold text-white mb-6 flex items-center gap-2 text-sm">
                   <BarChart3 className="w-4 h-4 text-emerald-500" /> Rendimiento Diario
               </h3>
               <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                          <Tooltip 
                              cursor={{fill: '#1e293b', opacity: 0.4}}
                              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }}
                          />
                          <ReferenceLine y={0} stroke="#475569" />
                          <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                  </ResponsiveContainer>
               </div>
           </div>

           {/* Asset Performance */}
           <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
               <h3 className="font-bold text-white mb-6 flex items-center gap-2 text-sm">
                   <BarChart3 className="w-4 h-4 text-blue-500" /> Rendimiento por Activo
               </h3>
               <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={assetData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                          <Tooltip 
                              cursor={{fill: '#1e293b', opacity: 0.4}}
                              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }}
                          />
                          <ReferenceLine y={0} stroke="#475569" />
                          <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                  </ResponsiveContainer>
               </div>
           </div>
      </div>

    </div>
  );
};

export default Dashboard;
