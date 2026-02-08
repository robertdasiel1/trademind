import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Trade, TradeDirection, TradeStatus, TradeSession } from '../types';
import { getRecoverySuggestion } from '../services/geminiService';
import { Save, X, Zap, ShieldAlert, Sparkles, ImageIcon, UploadCloud, Loader2, Calendar, AlertTriangle, Globe, Star, Plus, Clock, Coins, TestTube } from 'lucide-react';

interface Props {
  onAdd: (trade: Trade) => void;
  goal: number;
  trades: Trade[];
  isReal?: boolean;

  // ✅ NUEVO: cuenta activa para asignar el trade correctamente
  activeAccountId: string;
}

const SUGGESTED_ASSETS = ['/ES', '/NQ', '/CL', '/GC', '/MES', '/MNQ', '/MCL', '/MGC'];

const ASSET_MULTIPLIERS: Record<string, number> = {
  // Indices
  '/ES': 50, 'ES': 50,
  '/MES': 5, 'MES': 5,
  '/NQ': 20, 'NQ': 20,
  '/MNQ': 2, 'MNQ': 2,
  '/YM': 5, 'YM': 5,
  '/MYM': 0.5, 'MYM': 0.5,
  '/RTY': 50, 'RTY': 50,
  '/M2K': 5, 'M2K': 5,

  // Commodities
  '/CL': 1000, 'CL': 1000,
  '/MCL': 100, 'MCL': 100,
  '/GC': 100, 'GC': 100,
  '/MGC': 10, 'MGC': 10,
  '/SI': 5000, 'SI': 5000,
  '/SIL': 1000, 'SIL': 1000,
  '/HG': 25000, 'HG': 25000,
  '/MHG': 2500, 'MHG': 2500,

  // Currencies (simplificado)
  '/6E': 12.5, '6E': 12.5,
};

// Lógica de Comisiones
// Estándar: $5.00 | Micro: $0.50
const getCommissionRate = (asset: string): number => {
  if (!asset) return 0;
  const clean = asset.toUpperCase().replace('/', '').trim();

  // Lista de Micros comunes (Futuros)
  const micros = ['MES', 'MNQ', 'MCL', 'MGC', 'M2K', 'MYM', 'SIL', 'MHG'];

  if (micros.includes(clean) || (clean.startsWith('M') && clean.length === 4 && ['ES','NQ','CL','GC'].includes(clean.substring(1)))) {
    return 0.50;
  }

  return 5.00;
};

const getCurrentDateTimeLocal = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const TradeForm: React.FC<Props> = ({ onAdd, goal, trades, isReal = false, activeAccountId }) => {
  const [formData, setFormData] = useState({
    date: getCurrentDateTimeLocal(),
    exitDate: getCurrentDateTimeLocal(),
    asset: '',
    direction: TradeDirection.LONG,
    session: TradeSession.NY,
    rating: 3,
    entryPrice: '',
    exitPrice: '',
    size: '',
    notes: '',
    emotions: 'Calmado'
  });

  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const suggestionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (formData.date && formData.exitDate) {
      const entryTime = new Date(formData.date).getTime();
      const exitTime = new Date(formData.exitDate).getTime();

      if (entryTime > exitTime) {
        setDateError('La fecha de entrada no puede ser posterior a la de salida');
      } else {
        setDateError(null);
      }
    }
  }, [formData.date, formData.exitDate]);

  const isLosingStreak = useMemo(() => {
    if (trades.length < 2) return false;
    return trades[0].status === TradeStatus.LOSS && trades[1].status === TradeStatus.LOSS;
  }, [trades]);

  useEffect(() => {
    if (isLosingStreak && !aiSuggestion) {
      fetchSuggestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLosingStreak]);

  const fetchSuggestion = async () => {
    setLoadingSuggestion(true);
    const suggestion = await getRecoverySuggestion(trades, goal);
    setAiSuggestion(suggestion);
    setLoadingSuggestion(false);
  };

  const currentMultiplier =
    ASSET_MULTIPLIERS[formData.asset.toUpperCase()] ||
    ASSET_MULTIPLIERS['/' + formData.asset.toUpperCase()] ||
    1;

  const currentCommission = getCommissionRate(formData.asset);

  const priceWarning = useMemo(() => {
    const entry = parseFloat(formData.entryPrice);
    const exit = parseFloat(formData.exitPrice);

    if (isNaN(entry) || isNaN(exit)) return null;

    if (formData.direction === TradeDirection.LONG && exit < entry) {
      return "Atención: El precio de salida es MENOR a la entrada (Pérdida)";
    }
    if (formData.direction === TradeDirection.SHORT && exit > entry) {
      return "Atención: El precio de salida es MAYOR a la entrada (Pérdida)";
    }
    return null;
  }, [formData.entryPrice, formData.exitPrice, formData.direction]);

  const liveEstimate = useMemo(() => {
    const entry = parseFloat(formData.entryPrice);
    const exit = parseFloat(formData.exitPrice);
    const size = parseFloat(formData.size);

    if (isNaN(entry) || isNaN(exit) || isNaN(size)) return null;

    const diff = formData.direction === TradeDirection.LONG
      ? (exit - entry)
      : (entry - exit);

    const grossProfit = diff * size * currentMultiplier;
    const totalCommissions = isReal ? currentCommission * size : 0;
    const netProfit = grossProfit - totalCommissions;

    const goalImpact = (netProfit / goal) * 100;

    return {
      grossProfit,
      totalCommissions,
      profit: netProfit,
      points: Math.abs(exit - entry),
      isWin: netProfit >= 0,
      goalImpact
    };
  }, [formData, currentMultiplier, currentCommission, goal, isReal]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result) {
            setScreenshots(prev => [...prev, reader.result as string]);
          }
        };
        reader.readAsDataURL(file as Blob);
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeScreenshot = (index: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveEstimate || dateError) return;
    if (!activeAccountId) return; // seguridad

    const entry = Math.round(parseFloat(formData.entryPrice) * 100) / 100;
    const exit = Math.round(parseFloat(formData.exitPrice) * 100) / 100;
    const size = parseFloat(formData.size);
    const assetKey = formData.asset.toUpperCase();

    const profit = liveEstimate.profit;
    const status = profit > 0 ? TradeStatus.WIN : profit < 0 ? TradeStatus.LOSS : TradeStatus.BREAK_EVEN;

    const newTrade: Trade = {
      id: crypto.randomUUID(),
      date: new Date(formData.date).toISOString(),
      exitDate: new Date(formData.exitDate).toISOString(),
      asset: assetKey,
      direction: formData.direction,
      session: formData.session,
      rating: formData.rating,
      entryPrice: entry,
      exitPrice: exit,
      size: size,
      profit: profit,
      status: status,
      notes: formData.notes,
      emotions: formData.emotions,
      screenshots: screenshots,

      // ✅ CLAVE: asignar al account correcto
      accountId: activeAccountId,
    };

    onAdd(newTrade);
    resetForm();
    setAiSuggestion(null);
  };

  const resetForm = () => {
    setFormData({
      date: getCurrentDateTimeLocal(),
      exitDate: getCurrentDateTimeLocal(),
      asset: '',
      direction: TradeDirection.LONG,
      session: TradeSession.NY,
      rating: 3,
      entryPrice: '',
      exitPrice: '',
      size: '',
      notes: '',
      emotions: 'Calmado'
    });
    setScreenshots([]);
    setDateError(null);
  };

  const getRatingLabel = (val: number) => {
    if (val === 1) return { text: 'Mal Trade', color: 'text-rose-500' };
    if (val === 2) return { text: 'Regular', color: 'text-orange-500' };
    return { text: 'Excelente', color: 'text-emerald-500' };
  };

  const getRatingColor = (val: number) => {
    if (val === 1) return 'text-rose-500 fill-rose-500';
    if (val === 2) return 'text-orange-500 fill-orange-500';
    return 'text-emerald-500 fill-emerald-500';
  };

  return (
    <div className="space-y-6">
      {isLosingStreak && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 md:p-6 animate-pulse-subtle shadow-[0_0_20px_rgba(245,158,11,0.1)]">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-amber-500 rounded-lg shrink-0">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black text-amber-500 uppercase tracking-widest">Protocolo de Recuperación IA</span>
                <Sparkles className="w-3 h-3 text-amber-400" />
              </div>
              {loadingSuggestion ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm italic">
                  <Loader2 className="w-3 h-3 animate-spin" /> Consultando al estratega...
                </div>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium italic">
                  "{aiSuggestion}"
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className={`absolute top-0 right-0 p-4 pointer-events-none opacity-5`}>
          {isReal ? <Coins className="w-32 h-32" /> : <TestTube className="w-32 h-32" />}
        </div>

        <div className="flex justify-between items-center mb-6 relative z-10">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-emerald-500" />
            Registrar Operación
          </h2>
          <div className="flex flex-col md:flex-row gap-2 items-end md:items-center">
            {currentMultiplier !== 1 && (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                <span className="text-[11px] font-bold text-emerald-500 dark:text-emerald-400 uppercase tracking-tight">Valor Punto: ${currentMultiplier}</span>
              </div>
            )}
            {formData.asset && (
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1 rounded-full">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight">
                  Comisión: ${isReal ? currentCommission.toFixed(2) : '0.00 (Demo)'}
                </span>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                <Globe className="w-3.5 h-3.5" /> Sesión de Mercado
              </label>
              <div className="flex gap-2">
                {[
                  { id: TradeSession.NY, label: 'NY', color: 'bg-blue-500' },
                  { id: TradeSession.LONDON, label: 'Londres', color: 'bg-purple-500' },
                  { id: TradeSession.ASIA, label: 'Asia', color: 'bg-amber-500' }
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, session: s.id })}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${formData.session === s.id
                      ? `${s.color} text-white border-transparent shadow-lg scale-105`
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                      }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DateTimeInput
                label="Entrada"
                value={formData.date}
                onChange={(newVal) => setFormData({ ...formData, date: newVal })}
                hasError={!!dateError}
                type="entry"
              />
              <DateTimeInput
                label="Salida"
                value={formData.exitDate}
                onChange={(newVal) => setFormData({ ...formData, exitDate: newVal })}
                hasError={!!dateError}
                type="exit"
              />
            </div>

            {dateError && (
              <div className="flex items-center gap-2 text-rose-500 dark:text-rose-400 text-xs font-bold bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                <AlertTriangle className="w-3 h-3" />
                {dateError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="relative" ref={suggestionRef}>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Activo</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. /ES"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm uppercase"
                  value={formData.asset}
                  onFocus={() => setShowSuggestions(true)}
                  onChange={e => setFormData({ ...formData, asset: e.target.value.toUpperCase() })}
                  autoComplete="off"
                />
                {showSuggestions && (
                  <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                    {SUGGESTED_ASSETS.map((asset) => (
                      <button
                        key={asset}
                        type="button"
                        className="w-full text-left px-4 py-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
                        onClick={() => { setFormData({ ...formData, asset }); setShowSuggestions(false); }}
                      >
                        <span className="font-bold">{asset}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Contratos</label>
                <input
                  required
                  type="number"
                  step="any"
                  min="0"
                  placeholder="1"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  value={formData.size}
                  onChange={e => setFormData({ ...formData, size: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Entrada</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className={`w-full bg-slate-50 dark:bg-slate-800 border ${priceWarning ? 'border-amber-400 dark:border-amber-500/50' : 'border-slate-200 dark:border-slate-700'} rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm`}
                  value={formData.entryPrice}
                  onChange={e => setFormData({ ...formData, entryPrice: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Salida</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className={`w-full bg-slate-50 dark:bg-slate-800 border ${priceWarning ? 'border-amber-400 dark:border-amber-500/50' : 'border-slate-200 dark:border-slate-700'} rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm`}
                  value={formData.exitPrice}
                  onChange={e => setFormData({ ...formData, exitPrice: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Dirección</label>
                <select
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  value={formData.direction}
                  onChange={e => setFormData({ ...formData, direction: e.target.value as TradeDirection })}
                >
                  <option value={TradeDirection.LONG}>Long</option>
                  <option value={TradeDirection.SHORT}>Short</option>
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Psicología</label>
                <select
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                  value={formData.emotions}
                  onChange={e => setFormData({ ...formData, emotions: e.target.value })}
                >
                  <option>Calmado</option>
                  <option>Ansioso</option>
                  <option>Codicioso</option>
                  <option>Miedo</option>
                  <option>Venganza</option>
                  <option>Confiado</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-400" /> Capturas (Entrada/Gestión/Salida)
              </label>

              <div className="space-y-3">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded-xl p-4 transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-slate-500"
                >
                  <UploadCloud className="w-6 h-6" />
                  <span className="text-[10px] font-bold uppercase">Subir Imágenes</span>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileChange} />
                </div>

                {screenshots.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 animate-in fade-in zoom-in duration-300">
                    {screenshots.map((shot, index) => (
                      <div key={index} className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 aspect-square">
                        <img src={shot} alt={`Preview ${index}`} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                        <button
                          type="button"
                          onClick={() => removeScreenshot(index)}
                          className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-lg aspect-square text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-500 transition-all"
                    >
                      <Plus className="w-6 h-6" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <textarea
                rows={3}
                placeholder="Notas del trade..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none text-sm"
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
              ></textarea>
            </div>

            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700/50">
              <div className="flex flex-col">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Calidad de Ejecución</label>
                <span className={`text-xs font-bold ${getRatingLabel(formData.rating).color}`}>
                  {getRatingLabel(formData.rating).text}
                </span>
              </div>
              <div className="flex gap-1">
                {[1, 2, 3].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFormData({ ...formData, rating: star })}
                    className="focus:outline-none transition-transform hover:scale-110 active:scale-95 p-1"
                  >
                    <Star
                      className={`w-6 h-6 transition-all ${formData.rating >= star
                        ? getRatingColor(formData.rating)
                        : 'text-slate-200 dark:text-slate-700'
                        }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className={`p-4 rounded-xl border ${liveEstimate ? (liveEstimate.isWin ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20') : 'bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Estimación Neta</span>
                <span className={`text-xl font-black ${liveEstimate ? (liveEstimate.isWin ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400') : 'text-slate-600'}`}>
                  {liveEstimate ? `${liveEstimate.profit >= 0 ? '+' : ''}$${liveEstimate.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$ 0.00'}
                </span>
              </div>

              {liveEstimate && (
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700/50 flex flex-col gap-1">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Bruto (Gross)</span>
                    <span className="font-mono">${liveEstimate.grossProfit.toFixed(2)}</span>
                  </div>
                  {liveEstimate.totalCommissions > 0 ? (
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span className="flex items-center gap-1"><Coins className="w-3 h-3" /> Comisiones</span>
                      <span className="font-mono text-rose-400">-${liveEstimate.totalCommissions.toFixed(2)}</span>
                    </div>
                  ) : !isReal && (
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span className="flex items-center gap-1"><TestTube className="w-3 h-3" /> Cuenta Prueba</span>
                      <span className="font-mono text-slate-400">Sin Comisiones</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-4 pt-2">
              <button
                type="submit"
                disabled={!liveEstimate || !!dateError}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                <Save className="w-5 h-5 inline mr-2" /> Guardar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

const DateTimeInput = ({ label, value, onChange, hasError, type }: { label: string, value: string, onChange: (val: string) => void, hasError?: boolean, type: 'entry' | 'exit' }) => {
  const datePart = value.split('T')[0] || '';
  const timePart = value.split('T')[1]?.slice(0, 5) || '00:00';

  const dateObj = new Date(value);
  const isValid = !isNaN(dateObj.getTime());

  const displayDate = isValid
    ? dateObj.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    : '-';

  const displayTime = isValid
    ? dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  const isEntry = type === 'entry';

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (!newDate) return;
    onChange(`${newDate}T${timePart}`);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    if (!newTime) return;
    onChange(`${datePart}T${newTime}`);
  };

  return (
    <div className={`bg-slate-50 dark:bg-slate-800 border ${hasError ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-200 dark:border-slate-700'} rounded-xl p-3 relative`}>
      <div className="flex justify-between items-center mb-3">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isEntry ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`}></div>
          {label}
        </label>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative flex-1 group">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-950/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700/80 group-hover:border-emerald-500/50 transition-colors pointer-events-none">
            <Calendar className={`w-4 h-4 ${isEntry ? 'text-emerald-500' : 'text-rose-500'}`} />
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 capitalize truncate">{displayDate}</span>
          </div>
          <input
            type="date"
            value={datePart}
            onChange={handleDateChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
        </div>

        <div className="relative group min-w-[90px]">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-950/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700/80 group-hover:border-blue-500/50 transition-colors pointer-events-none justify-center">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">{displayTime}</span>
          </div>
          <input
            type="time"
            value={timePart}
            onChange={handleTimeChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
        </div>
      </div>
    </div>
  );
};

export default TradeForm;
