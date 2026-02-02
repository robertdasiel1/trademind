
import React, { useState, useRef } from 'react';
import { Trade, TradingAccount, UserProfile, GlobalNote, ChatMessage, Playbook, TradeDirection, TradeStatus, TradeSession } from '../types';
import { 
  User, Wallet, Database, Settings, X, ChevronRight, Plus, 
  Check, BadgeCheck, TestTube, Pencil, Trash2, Clock, ShieldAlert, 
  Target, Download, FileSpreadsheet, Siren, Lock, Bell, AlertTriangle
} from 'lucide-react';

const DEFAULT_DEADLINE = new Date(new Date().setMonth(new Date().getMonth() + 6)).toISOString().split('T')[0];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  onUpdateProfile: (p: UserProfile) => void;
  trades: Trade[];
  notes: GlobalNote[];
  onImport: (data: any) => void;
  onDeleteAll: () => void;
  accounts: TradingAccount[];
  activeAccountId: string;
  onSetActiveAccount: (id: string) => void;
  onAddAccount: (acc: TradingAccount) => void;
  onUpdateAccount: (acc: TradingAccount) => void;
  onDeleteAccount: (id: string) => void;
  aiMessages: ChatMessage[];
  playbook: Playbook | null;
  achievedMilestones?: string[];
}

// --- NINJATRADER PARSER LOGIC ---
const ASSET_MULTIPLIERS: Record<string, number> = {
  '/ES': 50, 'ES': 50, '/MNQ': 2, 'MNQ': 2, '/MGC': 10, 'MGC': 10,
  '/MES': 5, 'MES': 5, '/CL': 1000, 'CL': 1000, '/MCL': 100, 'MCL': 100,
  '/NQ': 20, 'NQ': 20, '/GC': 100, 'GC': 100, '/RTY': 50, 'RTY': 50, '/M2K': 5,
  '/YM': 5, 'YM': 5, '/MYM': 0.5, 'MYM': 0.5
};

const getMultiplier = (assetName: string): number => {
  const upper = assetName.toUpperCase();
  const root = upper.split(' ')[0].replace('/', ''); 
  
  if (ASSET_MULTIPLIERS[root]) return ASSET_MULTIPLIERS[root];
  if (ASSET_MULTIPLIERS['/' + root]) return ASSET_MULTIPLIERS['/' + root];
  
  if (root.startsWith('MNQ')) return 2;
  if (root.startsWith('NQ')) return 20;
  if (root.startsWith('MES')) return 5;
  if (root.startsWith('ES')) return 50;
  if (root.startsWith('MGC') || root.startsWith('GC')) return 10;
  if (root.startsWith('CL')) return 1000;
  if (root.startsWith('MCL')) return 100;
  if (root.startsWith('YM')) return 5;
  if (root.startsWith('MYM')) return 0.5;
  
  return 1;
};

interface NinjaExecution {
  instrument: string;
  action: 'Buy' | 'Sell';
  quantity: number;
  price: number;
  time: Date;
  commission: number;
}

// Helper para determinar la sesión basada en la hora de inicio
const getSessionFromTime = (date: Date): TradeSession => {
  const hour = date.getHours();

  // New York: 08:00 – 17:00
  if (hour >= 8 && hour < 17) {
    return TradeSession.NY;
  }
  
  // Londres: 02:00 – 08:00
  if (hour >= 2 && hour < 8) {
    return TradeSession.LONDON;
  }

  // Asia: 18:00 – 02:00 (Incluye el gap de 17:00 a 18:00 como Asia/Pre-market)
  return TradeSession.ASIA;
};

// LÓGICA DE CICLO FLAT-TO-FLAT
// Agrupa múltiples fills parciales en un solo Trade sólido
const parseNinjaTraderCSV = (csvText: string): Trade[] => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  
  const colMap = {
    instrument: headers.findIndex(h => h.includes('instrument')),
    action: headers.findIndex(h => h.includes('action')),
    quantity: headers.findIndex(h => h.includes('quantity')),
    price: headers.findIndex(h => h.includes('price')),
    time: headers.findIndex(h => h.includes('time')),
    commission: headers.findIndex(h => h.includes('commission')),
  };

  if (colMap.instrument === -1 || colMap.action === -1 || colMap.price === -1) return [];

  // 1. Parsear ejecuciones en crudo
  const rawExecutions: NinjaExecution[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
    if (cols.length < 5) continue;

    try {
      const priceStr = cols[colMap.price];
      const qtyStr = cols[colMap.quantity];
      const timeStr = cols[colMap.time];
      
      let comm = 0;
      if (colMap.commission !== -1 && cols[colMap.commission]) {
          comm = parseFloat(cols[colMap.commission].replace('$', '').replace(',', '')) || 0;
      }

      if (!priceStr || !qtyStr || !timeStr) continue;

      rawExecutions.push({
        instrument: cols[colMap.instrument],
        action: cols[colMap.action] as 'Buy' | 'Sell',
        quantity: parseFloat(qtyStr),
        price: parseFloat(priceStr),
        time: new Date(timeStr),
        commission: comm,
      });
    } catch (e) {
      console.warn("Error parsing line:", i, e);
    }
  }

  // 2. Ordenar por Tiempo (CRÍTICO para reconstruir la narrativa)
  rawExecutions.sort((a, b) => a.time.getTime() - b.time.getTime());

  // 3. Agrupar por Instrumento para procesar ciclos independientemente
  const executionsByInstrument: Record<string, NinjaExecution[]> = {};
  rawExecutions.forEach(exec => {
    if (!executionsByInstrument[exec.instrument]) executionsByInstrument[exec.instrument] = [];
    executionsByInstrument[exec.instrument].push(exec);
  });

  const trades: Trade[] = [];

  // 4. Procesar Ciclos (Flat -> Open -> Flat)
  Object.keys(executionsByInstrument).forEach(instrument => {
      const execs = executionsByInstrument[instrument];
      const multiplier = getMultiplier(instrument);
      
      let currentPosition = 0;
      
      // Acumuladores para el ciclo actual
      let entryQty = 0;
      let entryCost = 0; // price * qty
      let exitQty = 0;
      let exitRevenue = 0; // price * qty
      let totalComm = 0;
      let startTime: Date | null = null;
      let endTime: Date | null = null;
      let direction: TradeDirection | null = null;

      for (const exec of execs) {
          // Si la posición es 0, esta ejecución inicia un nuevo trade
          if (currentPosition === 0) {
              startTime = exec.time;
              direction = exec.action === 'Buy' ? TradeDirection.LONG : TradeDirection.SHORT;
              
              // Resetear acumuladores
              entryQty = 0; entryCost = 0;
              exitQty = 0; exitRevenue = 0;
              totalComm = 0;
          }

          // Actualizar posición neta
          const signedQty = exec.action === 'Buy' ? exec.quantity : -exec.quantity;
          currentPosition += signedQty;
          
          // Acumular métricas
          totalComm += exec.commission;
          endTime = exec.time; // La hora de fin se actualiza con cada fill, la última será la definitiva

          // Determinar si este fill contribuye a la Entrada o a la Salida
          const isEntryFill = (direction === TradeDirection.LONG && exec.action === 'Buy') || 
                              (direction === TradeDirection.SHORT && exec.action === 'Sell');

          if (isEntryFill) {
              entryQty += exec.quantity;
              entryCost += (exec.price * exec.quantity);
          } else {
              exitQty += exec.quantity;
              exitRevenue += (exec.price * exec.quantity);
          }

          // CHECK DE CIERRE DE CICLO: Si volvimos a 0 (o muy cerca por errores de float)
          if (Math.abs(currentPosition) < 0.0001 && startTime && direction) {
              // Trade Completado
              const avgEntry = entryCost / entryQty;
              const avgExit = exitRevenue / exitQty;
              
              // Cálculo de PnL Bruto
              let grossPnl = 0;
              if (direction === TradeDirection.LONG) {
                  grossPnl = (avgExit - avgEntry) * entryQty * multiplier;
              } else {
                  grossPnl = (avgEntry - avgExit) * entryQty * multiplier;
              }

              const netPnl = grossPnl - totalComm;

              trades.push({
                  id: crypto.randomUUID(),
                  date: startTime.toISOString(),
                  exitDate: endTime?.toISOString(),
                  asset: instrument.split(' ')[0], // Limpiar nombre (quitar fechas vto)
                  direction: direction,
                  session: getSessionFromTime(startTime), // Asignación automática de sesión
                  rating: 3,
                  entryPrice: parseFloat(avgEntry.toFixed(2)),
                  exitPrice: parseFloat(avgExit.toFixed(2)),
                  quantity: entryQty, // Tamaño total de la posición construida
                  profit: parseFloat(netPnl.toFixed(2)),
                  status: netPnl > 0 ? TradeStatus.WIN : netPnl < 0 ? TradeStatus.LOSS : TradeStatus.BREAK_EVEN,
                  notes: `Ciclo Completo (Flat-to-Flat). ${entryQty} contratos. Comis: $${totalComm.toFixed(2)}`,
                  emotions: 'Calmado',
                  screenshots: []
              });

              // Resetear para seguridad
              startTime = null;
              direction = null;
          }
      }
  });

  // Ordenar trades finales por fecha descendente
  return trades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

const SettingsModal: React.FC<Props> = ({
  isOpen, onClose, userProfile, onUpdateProfile, trades, notes, onImport, onDeleteAll, accounts, activeAccountId, onSetActiveAccount,
  onAddAccount, onUpdateAccount, onDeleteAccount, aiMessages, playbook, achievedMilestones
}) => {
  if (!isOpen) return null;
  
  const [activeTab, setActiveTab] = useState<'profile' | 'accounts' | 'data' | 'notifications'>('profile');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [editForm, setEditForm] = useState<Partial<TradingAccount>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const activeAccount = accounts.find(a => a.id === activeAccountId);

  const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (!file) return;
     const reader = new FileReader();
     reader.onload = (ev) => {
         try {
             const content = ev.target?.result as string;
             const parsed = JSON.parse(content);
             console.log('=== JSON IMPORTADO ===', parsed);
             
             // Guardar en localStorage también
             localStorage.setItem('trademind_backup', JSON.stringify(parsed));
             console.log('✓ Guardado en localStorage');
             
             // Llamar onImport
             onImport(parsed);
             console.log('✓ onImport ejecutado');
             
             alert('✓ Datos importados correctamente\n\nRecargando la aplicación...');
             
             // Recargar después de 1 segundo para que vea los cambios
             setTimeout(() => {
                 window.location.reload();
             }, 1000);
         } catch (err) { 
             console.error('❌ Error JSON:', err);
             alert('❌ Error: Archivo JSON inválido\n\n' + (err instanceof Error ? err.message : '')); 
         }
     };
     reader.readAsText(file);
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (!file) return;
     const reader = new FileReader();
     reader.onload = (ev) => {
         try {
             const content = ev.target?.result as string;
             console.log('=== CSV RECIBIDO ===', 'Longitud:', content.length);
             
             const newTrades = parseNinjaTraderCSV(content);
             console.log('=== TRADES PARSEADOS ===', newTrades.length, 'trades');
             console.log('Trades:', newTrades);
             
             if (newTrades.length > 0) {
               const importData = {trades: newTrades};
               console.log('Importando:', importData);
               
               // Guardar en localStorage
               localStorage.setItem('trademind_trades_temp', JSON.stringify(newTrades));
               console.log('✓ Guardado en localStorage');
               
               onImport(importData);
               console.log('✓ onImport ejecutado');
               
               alert(`✓ Se importaron ${newTrades.length} trades consolidados (Ciclos Flat-to-Flat).\n\nRecargando la aplicación...`);
               
               setTimeout(() => {
                   window.location.reload();
               }, 1000);
             } else {
               alert("⚠ No se encontraron operaciones cerradas válidas en el CSV.");
             }
         } catch (err) { 
             console.error('❌ Error CSV:', err);
             alert('❌ Error leyendo CSV: ' + (err instanceof Error ? err.message : 'Desconocido')); 
         }
     };
     reader.readAsText(file);
  };

  const handleExport = async () => {
      const data = { version: 2, timestamp: new Date().toISOString(), userProfile, accounts, trades, notes, aiMessages, playbook, achievedMilestones, activeAccountId };
      const jsonString = JSON.stringify(data, null, 2);
      const filename = `trading_journal_FULL_BACKUP_${new Date().toISOString().split('T')[0]}.json`;

      const downloadFallback = () => {
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      };

      // Use File System Access API if supported and allowed
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'JSON Backup File',
              accept: { 'application/json': ['.json'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(jsonString);
          await writable.close();
        } catch (err: any) {
          // Fallback if user cancels or if environment blocks the API (e.g. cross-origin iframe)
          if (err.name !== 'AbortError') {
             console.warn('File System API error (likely environment restriction), using fallback:', err);
             downloadFallback();
          }
        }
      } else {
        // Fallback for browsers not supporting the API
        downloadFallback();
      }
  };

  const startEditingAccount = (account: TradingAccount) => {
      setEditingAccountId(account.id);
      setEditForm({ ...account, deadline: account.deadline || DEFAULT_DEADLINE, maxDrawdownLimit: account.maxDrawdownLimit || 2500, isReal: account.isReal ?? false });
  };

  const saveEditedAccount = () => {
      if (editingAccountId && editForm) {
          // Ensure required fields are present
          const updated: TradingAccount = {
              ...editForm as TradingAccount,
              id: editingAccountId,
          };
          onUpdateAccount(updated);
          setEditingAccountId(null);
          setEditForm({});
      }
  };

  const SettingsTabButton = ({ id, label, icon }: { id: string, label: string, icon: React.ReactNode }) => (
      <button 
        onClick={() => setActiveTab(id as any)}
        className={`w-full flex items-center justify-center md:justify-start gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
            activeTab === id 
            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
            : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
        }`}
        title={label}
      >
          {icon}
          <span>{label}</span>
          {activeTab === id && <ChevronRight className="w-4 h-4 ml-auto opacity-80 hidden md:block" />}
      </button>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
       <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[85vh] md:h-[90vh] rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
          
          {/* SIDEBAR */}
          <div className="w-full md:w-64 bg-slate-50 dark:bg-slate-950 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 p-4 md:p-6 flex flex-row md:flex-col gap-4 shrink-0 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-3 md:mb-8 shrink-0">
                  <div className="p-2 bg-emerald-500 rounded-xl shadow-lg shadow-emerald-500/20 shrink-0">
                    <Settings className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg md:text-xl font-black text-slate-900 dark:text-white">Ajustes</h2>
                    <p className="text-xs text-slate-500 font-medium hidden md:block">Panel de Control</p>
                  </div>
                  <button onClick={onClose} className="md:hidden ml-auto p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white">
                      <X className="w-6 h-6" />
                  </button>
              </div>

              <div className="flex md:flex-col gap-2 flex-1">
                  <SettingsTabButton id="profile" label="Perfil" icon={<User className="w-5 h-5 md:w-4 md:h-4" />} />
                  <SettingsTabButton id="accounts" label="Cuentas" icon={<Wallet className="w-5 h-5 md:w-4 md:h-4" />} />
                  <SettingsTabButton id="notifications" label="Notificaciones" icon={<Bell className="w-5 h-5 md:w-4 md:h-4" />} />
                  <SettingsTabButton id="data" label="Datos" icon={<Database className="w-5 h-5 md:w-4 md:h-4" />} />
              </div>

              <div className="hidden md:block pt-6 border-t border-slate-200 dark:border-slate-800">
                  <button onClick={onClose} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors" title="Cerrar">
                      <X className="w-4 h-4" /> 
                      <span>Cerrar Panel</span>
                  </button>
              </div>
          </div>

          {/* CONTENT AREA */}
          <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 p-6 md:p-12 relative custom-scrollbar">
             <div className="max-w-3xl mx-auto">
                {activeTab === 'profile' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Perfil</h3>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Nombre</label>
                                <div className="relative">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <input 
                                        className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                        value={userProfile.name}
                                        onChange={e => onUpdateProfile({...userProfile, name: e.target.value})}
                                        placeholder="Tu nombre"
                                    />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Usuario</label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                        <input 
                                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                            value={userProfile.username || ''}
                                            onChange={e => onUpdateProfile({...userProfile, username: e.target.value})}
                                            placeholder="Usuario"
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Contraseña</label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                        <input 
                                            type="password"
                                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                            value={userProfile.password || ''}
                                            onChange={e => onUpdateProfile({...userProfile, password: e.target.value})}
                                            placeholder="••••••••"
                                            autoComplete="new-password"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Estilo</label>
                                    <input 
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                        value={userProfile.tradingStyle}
                                        onChange={e => onUpdateProfile({...userProfile, tradingStyle: e.target.value})}
                                        placeholder="ej. Day Trading"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Mercado</label>
                                    <input 
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                        value={userProfile.tradingType}
                                        onChange={e => onUpdateProfile({...userProfile, tradingType: e.target.value})}
                                        placeholder="ej. Futuros"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'notifications' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                              <Bell className="w-6 h-6 text-emerald-500" /> Notificaciones y Riesgo
                            </h3>
                        </div>
                        
                        {activeAccount ? (
                          <div className="space-y-6">
                             <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 flex items-start gap-3">
                                 <ShieldAlert className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                                 <div>
                                     <p className="text-sm font-bold text-blue-700 dark:text-blue-300">Configuración para: {activeAccount.name}</p>
                                     <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Estas alertas están activas en tiempo real mientras usas la aplicación. Te ayudarán a gestionar tu riesgo intradía.</p>
                                 </div>
                             </div>

                             <div className="bg-white dark:bg-slate-950 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                 <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                                     <Siren className="w-5 h-5 text-rose-500" />
                                     <h4 className="font-bold text-slate-700 dark:text-slate-200">Alertas de P/L Diario</h4>
                                 </div>

                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                     <div className="space-y-3">
                                         <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Límite de Pérdida Diaria</label>
                                         <div className="relative group">
                                             <input 
                                                 type="number" 
                                                 className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all" 
                                                 value={activeAccount.dailyLossLimit || ''} 
                                                 onChange={e => onUpdateAccount({...activeAccount, dailyLossLimit: parseFloat(e.target.value)})} 
                                                 placeholder="0.00" 
                                             />
                                             <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-rose-500 transition-colors" />
                                         </div>
                                         <p className="text-[11px] text-slate-500 leading-relaxed">
                                            Si tus pérdidas hoy superan este monto, recibirás una alerta crítica para detener tu operativa (Stop Trading).
                                         </p>
                                     </div>

                                     <div className="space-y-3">
                                         <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Meta de Ganancia Diaria</label>
                                         <div className="relative group">
                                             <input 
                                                 type="number" 
                                                 className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" 
                                                 value={activeAccount.dailyProfitTarget || ''} 
                                                 onChange={e => onUpdateAccount({...activeAccount, dailyProfitTarget: parseFloat(e.target.value)})} 
                                                 placeholder="0.00" 
                                             />
                                             <Target className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                                         </div>
                                         <p className="text-[11px] text-slate-500 leading-relaxed">
                                            Al alcanzar este objetivo de ganancia, se te notificará para que consideres cerrar tu sesión y asegurar profits.
                                         </p>
                                     </div>
                                 </div>
                             </div>
                          </div>
                        ) : (
                            <div className="text-center py-12 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                                <Wallet className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                                <p className="text-slate-500 font-medium">Selecciona una cuenta activa para configurar sus alertas.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'accounts' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Cuentas</h3>
                                <p className="text-slate-500 text-sm">Gestiona tus fondos.</p>
                            </div>
                            <button 
                                onClick={() => {
                                    const newId = crypto.randomUUID();
                                    const newAcc: TradingAccount = { id: newId, name: `Nueva Cuenta`, broker: '', initialBalance: 50000, goal: 3000, deadline: DEFAULT_DEADLINE, maxDrawdownLimit: 2500, currency: 'USD', isReal: false, createdAt: new Date().toISOString() };
                                    onAddAccount(newAcc);
                                    startEditingAccount(newAcc);
                                }}
                                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-600/20"
                            >
                                <Plus className="w-4 h-4" /> Nueva
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                             {accounts.map((acc: any) => (
                                 <div key={acc.id} className={`relative p-5 rounded-2xl border transition-all duration-300 group ${activeAccountId === acc.id ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-500 ring-1 ring-emerald-500' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                                     {editingAccountId === acc.id ? (
                                         <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300 relative z-10">
                                            {/* Name & Broker */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Nombre de la Cuenta</label>
                                                    <input className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} placeholder="Ej. Cuenta Fondeo" />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Plataforma / Broker</label>
                                                    <input className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white" value={editForm.broker || ''} onChange={e => setEditForm({...editForm, broker: e.target.value})} placeholder="Ej. NinjaTrader" />
                                                </div>
                                            </div>

                                            {/* Type Selection */}
                                            <div>
                                                 <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Tipo de Cuenta</label>
                                                 <div className="flex gap-2">
                                                     <button 
                                                        onClick={() => setEditForm({...editForm, isReal: false})}
                                                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${editForm.isReal === false ? 'bg-blue-500 text-white border-blue-500' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                                                     >
                                                         Prueba / Demo
                                                     </button>
                                                     <button 
                                                        onClick={() => setEditForm({...editForm, isReal: true})}
                                                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${editForm.isReal === true ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                                                     >
                                                         Real (Live)
                                                     </button>
                                                 </div>
                                            </div>

                                            {/* Capital & Drawdown */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Capital Inicial</label>
                                                    <input type="number" className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white" value={editForm.initialBalance || 0} onChange={e => setEditForm({...editForm, initialBalance: parseFloat(e.target.value)})} placeholder="Ej. 50000" />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Drawdown Permitido</label>
                                                    <input type="number" className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white" value={editForm.maxDrawdownLimit || 0} onChange={e => setEditForm({...editForm, maxDrawdownLimit: parseFloat(e.target.value)})} placeholder="Ej. 2500" />
                                                </div>
                                            </div>

                                            {/* Goal & Deadline */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Meta Global ($)</label>
                                                    <input type="number" className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white" value={editForm.goal || 0} onChange={e => setEditForm({...editForm, goal: parseFloat(e.target.value)})} placeholder="Ej. 3000" />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Fecha Límite</label>
                                                    <input type="date" className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white" value={editForm.deadline || ''} onChange={e => setEditForm({...editForm, deadline: e.target.value})} />
                                                </div>
                                            </div>

                                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700 mt-2">
                                                <button onClick={() => setEditingAccountId(null)} className="px-4 py-2 text-slate-500 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancelar</button>
                                                <button onClick={saveEditedAccount} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md">Guardar Cambios</button>
                                            </div>
                                         </div>
                                     ) : (
                                         <div className="flex flex-col h-full relative z-10">
                                            {/* Header Row: Name, Info, Actions */}
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="font-black text-slate-900 dark:text-white text-lg tracking-tight">{acc.name}</h4>
                                                        {activeAccountId === acc.id && (
                                                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase rounded-md tracking-wider">
                                                                <Check className="w-3 h-3" /> Activa
                                                            </span>
                                                        )}
                                                        <span className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase rounded-md tracking-wider ${acc.isReal ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'}`}>
                                                            {acc.isReal ? <BadgeCheck className="w-3 h-3" /> : <TestTube className="w-3 h-3" />}
                                                            {acc.isReal ? 'Real' : 'Prueba'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 font-medium">
                                                        {acc.broker && (
                                                            <span className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700/50 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-300">
                                                                {acc.broker}
                                                            </span>
                                                        )}
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-3 h-3" /> {new Date(acc.createdAt).toLocaleDateString(undefined, {month:'short', day:'numeric', year: '2-digit'})}
                                                        </span>
                                                    </div>
                                                </div>
                                                
                                                {/* Top Actions */}
                                                <div className="flex gap-1 relative z-20">
                                                    <button 
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); startEditingAccount(acc); }} 
                                                        className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors cursor-pointer" 
                                                        title="Editar"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    
                                                    {deletingAccountId === acc.id ? (
                                                        <div className="flex items-center gap-1 animate-in fade-in zoom-in duration-200">
                                                            <button 
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); onDeleteAccount(acc.id); setDeletingAccountId(null); }}
                                                                className="p-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 shadow-md cursor-pointer"
                                                                title="Confirmar Borrar"
                                                            >
                                                                <Check className="w-4 h-4" />
                                                            </button>
                                                            <button 
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); setDeletingAccountId(null); }}
                                                                className="p-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg cursor-pointer"
                                                                title="Cancelar"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); setDeletingAccountId(acc.id); }} 
                                                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors cursor-pointer" 
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Metrics Grid */}
                                            <div className="grid grid-cols-3 gap-2 mb-4 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                                                <div className="text-center p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5 flex justify-center items-center gap-1"><Wallet className="w-3 h-3" /> Capital</p>
                                                    <p className="font-black text-slate-700 dark:text-white text-sm truncate">${(acc.initialBalance / 1000).toFixed(0)}k</p>
                                                </div>
                                                <div className="text-center p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5 flex justify-center items-center gap-1"><ShieldAlert className="w-3 h-3" /> DD</p>
                                                    <p className="font-black text-rose-500 text-sm truncate">${acc.maxDrawdownLimit?.toLocaleString()}</p>
                                                </div>
                                                <div className="text-center p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5 flex justify-center items-center gap-1"><Target className="w-3 h-3" /> Meta</p>
                                                    <p className="font-black text-emerald-500 text-sm truncate">${acc.goal?.toLocaleString()}</p>
                                                </div>
                                            </div>

                                            {/* Bottom Action: Select */}
                                            <div className="mt-auto">
                                                {activeAccountId !== acc.id ? (
                                                    <button 
                                                        onClick={() => onSetActiveAccount(acc.id)} 
                                                        className="w-full py-2.5 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                                                    >
                                                        Usar esta Cuenta
                                                    </button>
                                                ) : (
                                                    <div className="w-full py-2.5 text-center text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/30 flex items-center justify-center gap-2 cursor-default">
                                                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                                                        Cuenta en Uso
                                                    </div>
                                                )}
                                            </div>
                                         </div>
                                     )}
                                 </div>
                             ))}
                        </div>
                    </div>
                )}

                {activeTab === 'data' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Datos</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                                <p className="text-sm font-bold text-blue-700 dark:text-blue-300 mb-2">💡 Importar o Exportar</p>
                                <p className="text-xs text-blue-600 dark:text-blue-400">Restaura tu historial o haz backup de todos tus datos.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button 
                                onClick={() => {
                                    console.log('Click en JSON');
                                    fileInputRef.current?.click();
                                }} 
                                className="flex flex-col items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer active:scale-95"
                            >
                                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400">
                                    <Database className="w-5 h-5" />
                                </div>
                                <div>
                                    <span className="block font-bold text-sm text-slate-900 dark:text-white">Importar Backup (JSON)</span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">Archivo .json guardado</span>
                                </div>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    accept=".json" 
                                    onChange={handleFileRead}
                                    onClick={(e) => {
                                        console.log('Input click');
                                        e.currentTarget.value = '';
                                    }}
                                </button>

                                <button 
                                    onClick={() => {
                                        console.log('Click en CSV');
                                        csvInputRef.current?.click();
                                    }} 
                                    className="flex flex-col items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer active:scale-95"
                                >
                                    <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                        <FileSpreadsheet className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <span className="block font-bold text-sm text-slate-900 dark:text-white">Importar NinjaTrader (CSV)</span>
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400">Exporta desde NinjaTrader</span>
                                    </div>
                                    <input 
                                        type="file" 
                                        ref={csvInputRef} 
                                        className="hidden" 
                                        accept=".csv" 
                                        onChange={handleCsvImport}
                                        onClick={(e) => {
                                            console.log('CSV input click');
                                            e.currentTarget.value = '';
                                        }}
                                    />
                                </button>
                            </div>

                            <button 
                                onClick={handleExport} 
                                className="w-full flex flex-col items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-all"
                            >
                                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
                                    <Download className="w-5 h-5" />
                                </div>
                                <div>
                                    <span className="block font-bold text-sm text-slate-900 dark:text-white">Exportar Backup Completo</span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">Descarga JSON con todos tus datos (trades, notas, perfil, etc.)</span>
                                </div>
                            </button>
                        </div>

                        <div className="pt-8 border-t border-slate-100 dark:border-slate-800">
                             {confirmDeleteAll ? (
                                 <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl animate-in fade-in zoom-in duration-200">
                                     <h4 className="font-bold text-rose-700 dark:text-rose-400 mb-2 flex items-center gap-2">
                                         <AlertTriangle className="w-5 h-5" /> ¿Estás absolutamente seguro?
                                     </h4>
                                     <p className="text-xs text-rose-600/80 dark:text-rose-400/80 mb-4 leading-relaxed">
                                         Esta acción borrará permanentemente todos tus trades, notas, cuentas y configuraciones. <br/>
                                         <strong>No se puede deshacer.</strong>
                                     </p>
                                     <div className="flex justify-end gap-3">
                                         <button 
                                             onClick={() => setConfirmDeleteAll(false)} 
                                             className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-500 font-bold text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-colors"
                                         >
                                             Cancelar
                                         </button>
                                         <button 
                                             onClick={() => { onDeleteAll(); setConfirmDeleteAll(false); }} 
                                             className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg shadow-md transition-colors"
                                         >
                                             Sí, Borrar Todo
                                         </button>
                                     </div>
                                 </div>
                             ) : (
                                 <div className="flex items-center justify-between p-4 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 rounded-xl">
                                     <div>
                                         <p className="font-bold text-rose-700 dark:text-rose-400 text-sm">Zona de Peligro</p>
                                         <p className="text-[10px] text-rose-600/70 dark:text-rose-400/60">Eliminar todos los datos de la aplicación</p>
                                     </div>
                                     <button 
                                         onClick={() => setConfirmDeleteAll(true)} 
                                         className="px-4 py-2 bg-white dark:bg-slate-800 text-rose-600 border border-rose-200 dark:border-rose-900/50 rounded-lg text-xs font-bold shadow-sm hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                                     >
                                         Borrar Todo
                                     </button>
                                 </div>
                             )}
                        </div>
                    </div>
                )}
             </div>
          </div>
       </div>
    </div>
  );
};

export default SettingsModal;
