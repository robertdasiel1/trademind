
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Trade, TradeStatus, TradeDirection, TradeSession } from '../types';
import { 
  Trash2, ChevronDown, ChevronUp, 
  Check, X, Pencil, Star,
  Search, Filter, SlidersHorizontal, Clock, ImageIcon, Save, UploadCloud, Plus,
  MoveVertical, Hash, ScrollText
} from 'lucide-react';

interface Props {
  trades: Trade[];
  onDelete: (id: string) => void;
  onUpdate?: (trade: Trade) => void;
  goal: number;
  isReal?: boolean;
}

// Helper para detectar multiplicador basado en nombre parcial
const ASSET_MULTIPLIERS: Record<string, number> = {
  '/ES': 50, 'ES': 50, '/MNQ': 2, 'MNQ': 2, '/MGC': 10, 'MGC': 10,
  '/MES': 5, 'MES': 5, '/CL': 1000, 'CL': 1000, '/MCL': 100, 'MCL': 100
};

// Mapa de Tick Sizes (Movimiento mínimo del precio)
const ASSET_TICK_SIZES: Record<string, number> = {
  '/ES': 0.25, 'ES': 0.25, '/MES': 0.25, 'MES': 0.25,
  '/NQ': 0.25, 'NQ': 0.25, '/MNQ': 0.25, 'MNQ': 0.25,
  '/RTY': 0.10, 'RTY': 0.10, '/M2K': 0.10, 'M2K': 0.10,
  '/GC': 0.10, 'GC': 0.10, '/MGC': 0.10, 'MGC': 0.10,
  '/CL': 0.01, 'CL': 0.01, '/MCL': 0.01, 'MCL': 0.01,
  '/YM': 1.00, 'YM': 1.00, '/MYM': 1.00, 'MYM': 1.00,
  '/6E': 0.00005, '6E': 0.00005
};

const getMultiplier = (assetName: string): number => {
  const upper = assetName.toUpperCase();
  if (ASSET_MULTIPLIERS[upper]) return ASSET_MULTIPLIERS[upper];
  if (ASSET_MULTIPLIERS['/' + upper]) return ASSET_MULTIPLIERS['/' + upper];
  if (upper.includes('MNQ')) return 2;
  if (upper.includes('NQ')) return 20;
  if (upper.includes('MES')) return 5;
  if (upper.includes('ES')) return 50;
  if (upper.includes('MGC') || upper.includes('GC')) return 10;
  if (upper.includes('CL')) return 1000;
  if (upper.includes('MCL')) return 100;
  return 1;
};

const getTickSize = (assetName: string): number => {
  const upper = assetName.toUpperCase();
  if (ASSET_TICK_SIZES[upper]) return ASSET_TICK_SIZES[upper];
  if (ASSET_TICK_SIZES['/' + upper]) return ASSET_TICK_SIZES['/' + upper];
  
  // Detección genérica por tipo de activo
  if (upper.includes('ES') || upper.includes('NQ')) return 0.25;
  if (upper.includes('YM')) return 1.00;
  if (upper.includes('GC') || upper.includes('RTY')) return 0.10;
  if (upper.includes('CL')) return 0.01;
  
  return 0.01; // Default fallback
};

const getCommissionRate = (asset: string): number => {
  if (!asset) return 0;
  const upper = asset.toUpperCase().replace('/', '').trim();
  if (
    upper === 'MES' || upper.startsWith('MES') ||
    upper === 'MNQ' || upper.startsWith('MNQ') ||
    upper === 'MCL' || upper.startsWith('MCL') ||
    upper === 'MGC' || upper.startsWith('MGC') ||
    upper === 'M2K' || upper === 'MYM'
  ) {
    return 0.50;
  }
  return 5.00;
};

const calculateDuration = (start: string, end?: string) => {
    if (!end) return '-';
    const diff = new Date(end).getTime() - new Date(start).getTime();
    if (diff <= 0) return '< 1m';
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
};

const TradeList: React.FC<Props> = ({ trades, onDelete, onUpdate, goal, isReal = false }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [fullImage, setFullImage] = useState<string | null>(null);
  
  // Ref para input de archivo en edición
  const editFileInputRef = useRef<HTMLInputElement>(null);
  
  // Estados para filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TradeStatus>('ALL');
  const [assetFilter, setAssetFilter] = useState<string>('ALL');

  // Estados para Dropdowns personalizados
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const assetDropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdowns al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
      if (assetDropdownRef.current && !assetDropdownRef.current.contains(event.target as Node)) {
        setIsAssetDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Lógica de filtrado
  const uniqueAssets = useMemo(() => Array.from(new Set(trades.map(t => t.asset))).sort(), [trades]);

  const filteredTrades = useMemo(() => {
    return trades.filter(trade => {
      // Filtro de Texto (Activo o Notas)
      const matchesSearch = 
        trade.asset.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (trade.notes && trade.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      
      // Filtro de Estado
      const matchesStatus = statusFilter === 'ALL' || trade.status === statusFilter;

      // Filtro de Activo
      const matchesAsset = assetFilter === 'ALL' || trade.asset === assetFilter;

      return matchesSearch && matchesStatus && matchesAsset;
    });
  }, [trades, searchTerm, statusFilter, assetFilter]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Manejo de imágenes en edición
  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && editingTrade) {
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result) {
            setEditingTrade(prev => {
                if (!prev) return null;
                const currentScreenshots = prev.screenshots || [];
                return { ...prev, screenshots: [...currentScreenshots, reader.result as string] };
            });
          }
        };
        reader.readAsDataURL(file as Blob);
      });
    }
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  };

  const removeEditScreenshot = (index: number) => {
    setEditingTrade(prev => {
        if (!prev) return null;
        const currentScreenshots = prev.screenshots || [];
        return { ...prev, screenshots: currentScreenshots.filter((_, i) => i !== index) };
    });
  };

  // Función para recalcular P/L cuando cambian los datos de edición
  const recalculateEditingTrade = (updatedField: Partial<Trade>) => {
    if (!editingTrade) return;

    const nextTrade = { ...editingTrade, ...updatedField };
    
    // Si cambian precios, size o activo, recalculamos el P/L
    if (
        updatedField.entryPrice !== undefined || 
        updatedField.exitPrice !== undefined || 
        updatedField.size !== undefined || 
        updatedField.asset !== undefined || 
        updatedField.direction !== undefined
    ) {
        const multiplier = getMultiplier(nextTrade.asset);
        const commissionRate = getCommissionRate(nextTrade.asset);
        
        const diff = nextTrade.direction === TradeDirection.LONG 
          ? (nextTrade.exitPrice - nextTrade.entryPrice) 
          : (nextTrade.entryPrice - nextTrade.exitPrice);
        
        const grossProfit = diff * nextTrade.size * multiplier;
        // Apply commission logic based on Account Type
        const totalCommissions = isReal ? (commissionRate * nextTrade.size) : 0;
        const netProfit = grossProfit - totalCommissions;

        nextTrade.profit = netProfit;
        nextTrade.status = netProfit > 0 ? TradeStatus.WIN : netProfit < 0 ? TradeStatus.LOSS : TradeStatus.BREAK_EVEN;
    }

    setEditingTrade(nextTrade);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTrade && onUpdate) {
      onUpdate(editingTrade);
      setEditingTrade(null);
    }
  };

  const getSessionStyle = (session: TradeSession) => {
    switch (session) {
      case TradeSession.NY: return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case TradeSession.LONDON: return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
      case TradeSession.ASIA: return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      default: return 'bg-slate-500/10 text-slate-600 border-slate-500/20';
    }
  };

  const renderStars = (rating: number) => {
    const color = rating === 1 ? 'text-rose-500 fill-rose-500' : rating === 2 ? 'text-orange-500 fill-orange-500' : 'text-emerald-500 fill-emerald-500';
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3].map(i => (
          <Star key={i} className={`w-3 h-3 ${i <= rating ? color : 'text-slate-200 dark:text-slate-700'}`} />
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="mb-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-6 h-6 text-blue-500" />
            Historial de Operaciones
          </h2>
          <p className="text-slate-500 text-sm">Gestiona y revisa tus trades pasados</p>
        </div>
      </div>

      {/* Barra de Filtros */}
      {trades.length > 0 && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 mb-6 shadow-sm flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por activo o notas..." 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
             
             {/* Custom Status Dropdown */}
             <div className="relative" ref={statusDropdownRef}>
               <button 
                  onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 transition-all min-w-[180px] justify-between text-sm font-medium text-slate-600 dark:text-slate-300 shadow-sm"
               >
                 <div className="flex items-center gap-2">
                   <Filter className="w-4 h-4 text-slate-400" />
                   <span>
                     {statusFilter === 'ALL' ? 'Todos los Estados' : 
                      statusFilter === TradeStatus.WIN ? 'Ganadoras' : 
                      statusFilter === TradeStatus.LOSS ? 'Perdedoras' : 'Break Even'}
                   </span>
                 </div>
                 <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isStatusDropdownOpen ? 'rotate-180' : ''}`} />
               </button>
               
               {isStatusDropdownOpen && (
                 <div className="absolute top-full left-0 mt-2 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                   {[
                     { value: 'ALL', label: 'Todos los Estados' },
                     { value: TradeStatus.WIN, label: 'Ganadoras', color: 'text-emerald-500' },
                     { value: TradeStatus.LOSS, label: 'Perdedoras', color: 'text-rose-500' },
                     { value: TradeStatus.BREAK_EVEN, label: 'Break Even', color: 'text-slate-500' }
                   ].map((opt) => (
                     <button
                       key={opt.value}
                       onClick={() => { setStatusFilter(opt.value as any); setIsStatusDropdownOpen(false); }}
                       className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between ${statusFilter === opt.value ? 'bg-slate-50 dark:bg-slate-800 font-bold' : 'text-slate-600 dark:text-slate-300'}`}
                     >
                       <span className={opt.color || ''}>{opt.label}</span>
                       {statusFilter === opt.value && <Check className="w-4 h-4 text-emerald-500" />}
                     </button>
                   ))}
                 </div>
               )}
             </div>
             
             {/* Custom Asset Dropdown */}
             <div className="relative" ref={assetDropdownRef}>
               <button 
                  onClick={() => setIsAssetDropdownOpen(!isAssetDropdownOpen)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 transition-all min-w-[180px] justify-between text-sm font-medium text-slate-600 dark:text-slate-300 shadow-sm"
               >
                 <div className="flex items-center gap-2">
                   <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                   <span>
                     {assetFilter === 'ALL' ? 'Todos los Activos' : assetFilter}
                   </span>
                 </div>
                 <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isAssetDropdownOpen ? 'rotate-180' : ''}`} />
               </button>
               
               {isAssetDropdownOpen && (
                 <div className="absolute top-full left-0 mt-2 w-full min-w-[200px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-60 overflow-y-auto custom-scrollbar">
                   <button
                       onClick={() => { setAssetFilter('ALL'); setIsAssetDropdownOpen(false); }}
                       className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between ${assetFilter === 'ALL' ? 'bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}
                   >
                       <span>Todos los Activos</span>
                       {assetFilter === 'ALL' && <Check className="w-4 h-4 text-emerald-500" />}
                   </button>
                   {uniqueAssets.map(asset => (
                     <button
                       key={asset}
                       onClick={() => { setAssetFilter(asset); setIsAssetDropdownOpen(false); }}
                       className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between ${assetFilter === asset ? 'bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}
                     >
                       <span>{asset}</span>
                       {assetFilter === asset && <Check className="w-4 h-4 text-emerald-500" />}
                     </button>
                   ))}
                 </div>
               )}
             </div>

          </div>
        </div>
      )}

      {/* Lista de Trades */}
      {trades.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-dashed rounded-2xl">
          <Clock className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-slate-600 dark:text-slate-400">No hay trades registrados aún</h3>
        </div>
      ) : filteredTrades.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
           <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
           <p className="text-slate-500">No se encontraron operaciones con estos filtros.</p>
           <button onClick={() => {setSearchTerm(''); setStatusFilter('ALL'); setAssetFilter('ALL')}} className="mt-2 text-emerald-500 font-bold text-sm hover:underline">Limpiar Filtros</button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-6 py-4 font-medium w-10"></th>
                  <th className="px-6 py-4 font-medium">Fecha / Rating</th>
                  <th className="px-6 py-4 font-medium">Sesión</th>
                  <th className="px-6 py-4 font-medium">Activo</th>
                  <th className="px-6 py-4 font-medium">P/L</th>
                  <th className="px-6 py-4 font-medium text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTrades.map((trade) => (
                  <React.Fragment key={trade.id}>
                    <tr onClick={() => toggleExpand(trade.id)} className={`cursor-pointer transition-colors ${expandedId === trade.id ? 'bg-slate-50 dark:bg-slate-800/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
                      <td className="px-6 py-4">
                        {expandedId === trade.id ? <ChevronUp className="w-4 h-4 text-emerald-500" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-900 dark:text-white font-medium">{new Date(trade.date).toLocaleDateString()}</div>
                        <div className="mt-1">{renderStars(trade.rating || 3)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-tighter ${getSessionStyle(trade.session || TradeSession.NY)}`}>
                          {trade.session || 'NY'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-slate-700 dark:text-white">{trade.asset}</div>
                        <div className={`text-[10px] font-bold ${trade.direction === TradeDirection.LONG ? 'text-emerald-500' : 'text-orange-500'}`}>{trade.direction}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-black ${trade.status === TradeStatus.WIN ? 'text-emerald-500' : trade.status === TradeStatus.LOSS ? 'text-rose-500' : 'text-slate-400'}`}>
                          {trade.profit > 0 ? '+' : ''}{trade.profit.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={(e) => { e.stopPropagation(); setEditingTrade(trade); }} className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg">
                            <Pencil className="w-4 h-4" />
                          </button>
                          
                          {deletingId === trade.id ? (
                            <div className="flex items-center gap-1 animate-in fade-in zoom-in duration-200">
                              <button 
                                onClick={(e) => { e.stopPropagation(); onDelete(trade.id); setDeletingId(null); }} 
                                className="p-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg shadow-lg transition-colors"
                                title="Confirmar eliminar"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setDeletingId(null); }} 
                                className="p-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                                title="Cancelar"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={(e) => { e.stopPropagation(); setDeletingId(trade.id); }} 
                              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                              title="Eliminar trade"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === trade.id && (
                      <tr className="bg-slate-50 dark:bg-slate-800/20">
                        <td colSpan={6} className="px-6 py-8">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            
                            {/* COLUMNA 1: Detalles de Ejecución (Lista Vertical) */}
                            <div className="space-y-6">
                              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4 mb-4">
                                   <div>
                                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Calidad</h4>
                                      <div className="scale-105 origin-left">{renderStars(trade.rating || 3)}</div>
                                   </div>
                                   {trade.emotions && (
                                       <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                                           {trade.emotions}
                                       </span>
                                   )}
                                </div>
                                
                                <div className="space-y-3">
                                   <div className="flex justify-between items-center">
                                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Dirección</span>
                                      <span className={`text-sm font-bold ${trade.direction === TradeDirection.LONG ? 'text-emerald-500' : 'text-rose-500'}`}>
                                          {trade.direction}
                                      </span>
                                   </div>

                                   <div className="flex justify-between items-center">
                                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Contratos</span>
                                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                                          {trade.size}
                                      </span>
                                   </div>

                                   <div className="flex justify-between items-center">
                                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Duración</span>
                                      <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1">
                                          <Clock className="w-3 h-3 text-slate-400" />
                                          {calculateDuration(trade.date, trade.exitDate)}
                                      </span>
                                   </div>

                                   <div className="flex justify-between items-center">
                                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Puntos</span>
                                      <span className={`text-sm font-bold ${Math.abs(trade.exitPrice - trade.entryPrice) > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                                          {Math.abs(trade.exitPrice - trade.entryPrice).toFixed(2)}
                                      </span>
                                   </div>

                                   <div className="flex justify-between items-center">
                                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Ticks</span>
                                      <span className="text-sm font-bold text-slate-900 dark:text-white font-mono flex items-center gap-1">
                                          <Hash className="w-3 h-3 text-slate-400" />
                                          {(Math.abs(trade.exitPrice - trade.entryPrice) / getTickSize(trade.asset)).toFixed(0)}
                                      </span>
                                   </div>

                                   <div className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-700">
                                       <div className="flex justify-between items-center mb-1">
                                          <span className="text-[10px] text-slate-400 uppercase font-bold">Entrada</span>
                                          <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">{trade.entryPrice}</span>
                                       </div>
                                       <div className="flex justify-between items-center">
                                          <span className="text-[10px] text-slate-400 uppercase font-bold">Salida</span>
                                          <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">{trade.exitPrice}</span>
                                       </div>
                                   </div>
                                </div>
                              </div>
                              
                              {/* Notas debajo de la lista */}
                              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                      <ScrollText className="w-3 h-3" /> Notas
                                  </h4>
                                  <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                      {trade.notes || <span className="text-slate-400 italic">Sin notas registradas.</span>}
                                  </div>
                              </div>
                            </div>
                            
                            {/* COLUMNA 2 (Ocupa 2 espacios en LG): Evidencia Gráfica */}
                            <div className="lg:col-span-2">
                              {trade.screenshots && trade.screenshots.length > 0 ? (
                                <div className="h-full flex flex-col">
                                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                      <ImageIcon className="w-3 h-3" /> Evidencia Gráfica
                                  </h4>
                                  <div className="grid grid-cols-2 gap-3 flex-1">
                                    {trade.screenshots.map((shot, idx) => (
                                      <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 aspect-video lg:aspect-auto">
                                          <img 
                                            src={shot} 
                                            onClick={() => setFullImage(shot)} 
                                            alt={`Setup ${idx}`} 
                                            className="w-full h-full object-cover cursor-zoom-in transition-transform duration-500 group-hover:scale-105" 
                                          />
                                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none"></div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="h-full min-h-[300px] flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800/30 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-slate-500">
                                    <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
                                    <span className="text-sm italic">Sin evidencia gráfica</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Edición Completa */}
      {editingTrade && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-3xl p-6 md:p-8 shadow-2xl overflow-y-auto max-h-[95vh] animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
               <h2 className="text-xl font-bold flex items-center gap-2"><Pencil className="w-5 h-5 text-emerald-500" /> Editar Operación</h2>
               <button onClick={() => setEditingTrade(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="space-y-5">
              {/* Fechas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Fecha Entrada</label>
                   <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="datetime-local" 
                        required
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                        value={new Date(editingTrade.date).toISOString().slice(0, 16)}
                        onChange={e => recalculateEditingTrade({ date: new Date(e.target.value).toISOString() })}
                      />
                   </div>
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Fecha Salida</label>
                   <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="datetime-local" 
                        required
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                        value={editingTrade.exitDate ? new Date(editingTrade.exitDate).toISOString().slice(0, 16) : ''}
                        onChange={e => recalculateEditingTrade({ exitDate: new Date(e.target.value).toISOString() })}
                      />
                   </div>
                 </div>
              </div>

              {/* Activo y Sesión */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Activo</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white uppercase"
                    value={editingTrade.asset}
                    onChange={e => recalculateEditingTrade({ asset: e.target.value })}
                  />
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Sesión</label>
                   <select 
                      className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                      value={editingTrade.session}
                      onChange={e => recalculateEditingTrade({ session: e.target.value as TradeSession })}
                   >
                     <option value={TradeSession.NY}>NY</option>
                     <option value={TradeSession.LONDON}>Londres</option>
                     <option value={TradeSession.ASIA}>Asia</option>
                   </select>
                </div>
              </div>

              {/* Datos Numéricos */}
              <div className="grid grid-cols-3 gap-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Size</label>
                    <input 
                      type="number" step="any"
                      className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                      value={editingTrade.size}
                      onChange={e => recalculateEditingTrade({ size: parseFloat(e.target.value) })}
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Entrada</label>
                    <input 
                      type="number" step="0.01"
                      className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                      value={editingTrade.entryPrice}
                      onChange={e => recalculateEditingTrade({ entryPrice: parseFloat(e.target.value) })}
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Salida</label>
                    <input 
                      type="number" step="0.01"
                      className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                      value={editingTrade.exitPrice}
                      onChange={e => recalculateEditingTrade({ exitPrice: parseFloat(e.target.value) })}
                    />
                 </div>
              </div>

              {/* Dirección y Emociones */}
              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Dirección</label>
                   <select 
                      className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                      value={editingTrade.direction}
                      onChange={e => recalculateEditingTrade({ direction: e.target.value as TradeDirection })}
                   >
                     <option value={TradeDirection.LONG}>Long</option>
                     <option value={TradeDirection.SHORT}>Short</option>
                   </select>
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Emoción</label>
                   <select 
                      className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                      value={editingTrade.emotions}
                      onChange={e => recalculateEditingTrade({ emotions: e.target.value })}
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

              {/* Screenshots Manager */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
                  <ImageIcon className="w-3 h-3" /> Evidencia Gráfica
                </label>
                
                <div className="space-y-3">
                  {(!editingTrade.screenshots || editingTrade.screenshots.length === 0) && (
                      <div 
                        onClick={() => editFileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 rounded-xl p-4 transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-slate-400"
                      >
                        <UploadCloud className="w-6 h-6" />
                        <span className="text-[10px] font-bold uppercase">Subir Imágenes</span>
                      </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                      {editingTrade.screenshots && editingTrade.screenshots.map((shot, index) => (
                        <div key={index} className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 aspect-square bg-slate-100 dark:bg-slate-800">
                          <img src={shot} alt={`Preview ${index}`} className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={() => removeEditScreenshot(index)} 
                            className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {editingTrade.screenshots && editingTrade.screenshots.length > 0 && (
                          <button 
                            type="button"
                            onClick={() => editFileInputRef.current?.click()}
                            className="flex items-center justify-center border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-lg aspect-square text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-500 transition-all"
                          >
                            <Plus className="w-6 h-6" />
                          </button>
                      )}
                  </div>
                  <input type="file" ref={editFileInputRef} className="hidden" accept="image/*" multiple onChange={handleEditFileChange} />
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Notas</label>
                <textarea 
                  rows={3}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white resize-none"
                  value={editingTrade.notes}
                  onChange={e => recalculateEditingTrade({ notes: e.target.value })}
                />
              </div>

              {/* Rating */}
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <label className="text-xs font-bold text-slate-500 uppercase">Calidad del Trade</label>
                <div className="flex gap-4">
                  {[1, 2, 3].map(s => (
                    <button type="button" key={s} onClick={() => setEditingTrade({...editingTrade, rating: s})} className="focus:outline-none hover:scale-110 transition-transform">
                      <Star className={`w-6 h-6 ${editingTrade.rating >= s ? (editingTrade.rating === 1 ? 'text-rose-500 fill-rose-500' : editingTrade.rating === 2 ? 'text-orange-500 fill-orange-500' : 'text-emerald-500 fill-emerald-500') : 'text-slate-300 dark:text-slate-600'}`} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Preview del P/L */}
              <div className={`p-4 rounded-xl border flex justify-between items-center ${editingTrade.profit >= 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
                 <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-500 uppercase">Nuevo P/L Estimado</span>
                    {!isReal && <span className="text-[10px] text-blue-500 font-bold">(Cuenta Demo)</span>}
                 </div>
                 <span className={`text-xl font-black ${editingTrade.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {editingTrade.profit >= 0 ? '+' : ''}{editingTrade.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                 </span>
              </div>

              <div className="flex gap-3 pt-2">
                 <button onClick={() => setEditingTrade(null)} type="button" className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">Cancelar</button>
                 <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20">
                    <Save className="w-4 h-4 inline mr-2" /> Guardar Cambios
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {fullImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setFullImage(null)}>
          <img src={fullImage} alt="Setup ampliado" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </>
  );
};

export default TradeList;
