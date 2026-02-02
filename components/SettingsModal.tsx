import React, { useState, useRef } from 'react';
import { Trade, TradingAccount, UserProfile, GlobalNote, ChatMessage, Playbook } from '../types';
import { User, Wallet, Database, Settings, X, ChevronRight, Download, FileSpreadsheet, Bell, Plus, Trash2 } from 'lucide-react';
import { parseNinjaTraderCSV } from '../services/csvParser';

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
}

const SettingsModal: React.FC<Props> = ({
  isOpen, onClose, userProfile, onUpdateProfile, trades, notes, onImport, onDeleteAll, accounts, activeAccountId, 
  onSetActiveAccount, onAddAccount, onUpdateAccount, onDeleteAccount, aiMessages, playbook
}) => {
  if (!isOpen) return null;
  
  const [activeTab, setActiveTab] = useState<'profile' | 'accounts' | 'data' | 'notifications'>('profile');
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (!file) return;
     const reader = new FileReader();
     reader.onload = (ev) => {
         try {
             const content = ev.target?.result as string;
             const parsed = JSON.parse(content);
             localStorage.setItem('trademind_backup', JSON.stringify(parsed));
             onImport(parsed);
             alert('✓ Datos importados. Recargando...');
             setTimeout(() => window.location.reload(), 1000);
         } catch (err) { 
             alert('❌ Error: Archivo JSON inválido'); 
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
             const newTrades = parseNinjaTraderCSV(content);
             if (newTrades.length > 0) {
               onImport({trades: newTrades});
               alert(`✓ ${newTrades.length} trades importados. Recargando...`);
               setTimeout(() => window.location.reload(), 1000);
             } else {
               alert("⚠ No se encontraron trades.");
             }
         } catch (err) { 
             alert('❌ Error CSV'); 
         }
     };
     reader.readAsText(file);
  };

  const handleExport = () => {
    const data = { trades, notes, userProfile, accounts, aiMessages, playbook, timestamp: new Date().toISOString() };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trademind_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SettingsTabButton = ({ id, label, icon }: { id: string; label: string; icon: React.ReactNode }) => (
    <button 
      onClick={() => setActiveTab(id as any)}
      className={`w-full flex items-center justify-center md:justify-start gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        activeTab === id 
          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
          : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {icon}
      <span className="hidden md:block">{label}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden border border-slate-200 dark:border-slate-800">
        
        <div className="w-full md:w-64 bg-slate-50 dark:bg-slate-950 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-emerald-500" />
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white">Ajustes</h2>
              <p className="text-xs text-slate-500">Panel de Control</p>
            </div>
            <button onClick={onClose} className="md:hidden ml-auto"><X className="w-6 h-6" /></button>
          </div>

          <div className="flex md:flex-col gap-2">
            <SettingsTabButton id="profile" label="Perfil" icon={<User className="w-5 h-5" />} />
            <SettingsTabButton id="accounts" label="Cuentas" icon={<Wallet className="w-5 h-5" />} />
            <SettingsTabButton id="notifications" label="Notificaciones" icon={<Bell className="w-5 h-5" />} />
            <SettingsTabButton id="data" label="Datos" icon={<Database className="w-5 h-5" />} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'profile' && <div><h3 className="text-2xl font-bold">Perfil</h3><p className="text-slate-500 mt-2">Configuración de perfil</p></div>}
          
          {activeTab === 'notifications' && <div><h3 className="text-2xl font-bold">Notificaciones</h3><p className="text-slate-500 mt-2">Configuración de notificaciones</p></div>}
          
          {activeTab === 'accounts' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">Cuentas</h3>
                  <p className="text-slate-500 mt-1">Gestiona tus cuentas de trading</p>
                </div>
                <button onClick={() => {
                  const newAcc: TradingAccount = {
                    id: Date.now().toString(),
                    name: `Cuenta ${accounts.length + 1}`,
                    broker: 'NinjaTrader',
                    balance: 10000,
                    drawdownLimit: 25,
                    status: 'active',
                    createdAt: new Date().toISOString(),
                  };
                  onAddAccount(newAcc);
                }} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg font-bold text-sm hover:bg-emerald-600 transition-all">
                  <Plus className="w-4 h-4" /> Nueva
                </button>
              </div>

              <div className="space-y-4">
                {accounts.map((acc) => (
                  <div key={acc.id} className={`p-4 border rounded-xl transition-all ${activeAccountId === acc.id ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="font-bold text-lg text-slate-900 dark:text-white">{acc.name}</h4>
                        <p className="text-xs text-slate-500">{acc.broker}</p>
                      </div>
                      <div className="flex gap-2">
                        {activeAccountId !== acc.id && (
                          <button 
                            onClick={() => onSetActiveAccount(acc.id)} 
                            className="px-3 py-1 text-xs rounded font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 transition-all"
                          >
                            Usar
                          </button>
                        )}
                        {activeAccountId !== acc.id && (
                          <button 
                            onClick={() => setDeletingAccountId(acc.id)} 
                            className="p-1 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {activeAccountId === acc.id && (
                          <span className="px-3 py-1 text-xs rounded font-bold bg-emerald-500 text-white">En uso</span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-xs text-slate-500">Capital</p>
                        <p className="font-bold text-slate-900 dark:text-white">${acc.balance.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Drawdown</p>
                        <p className="font-bold text-rose-500">{acc.drawdownLimit}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Estado</p>
                        <p className="font-bold capitalize text-emerald-500">{acc.status}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {deletingAccountId && (
                <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl animate-in">
                  <h4 className="font-bold text-rose-700 dark:text-rose-400 mb-2">¿Eliminar esta cuenta?</h4>
                  <p className="text-xs text-rose-600 dark:text-rose-400 mb-4">Se eliminarán todos los trades asociados a esta cuenta.</p>
                  <div className="flex gap-2 justify-end">
                    <button 
                      onClick={() => setDeletingAccountId(null)} 
                      className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-500 text-xs font-bold rounded-lg hover:bg-slate-50 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={() => { 
                        onDeleteAccount(deletingAccountId); 
                        setDeletingAccountId(null); 
                      }} 
                      className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 transition-all"
                    >
                      Sí, Eliminar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'data' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-bold">Datos</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">
                  <Database className="w-6 h-6 text-purple-600" />
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">Importar JSON</p>
                    <p className="text-xs text-slate-500">Backup anterior</p>
                  </div>
                  <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileRead} />
                </button>

                <button onClick={() => csvInputRef.current?.click()} className="flex flex-col items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">Importar CSV</p>
                    <p className="text-xs text-slate-500">NinjaTrader export</p>
                  </div>
                  <input type="file" ref={csvInputRef} className="hidden" accept=".csv" onChange={handleCsvImport} />
                </button>

                <button onClick={handleExport} className="md:col-span-2 flex flex-col items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all">
                  <Download className="w-6 h-6 text-blue-600" />
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">Exportar Backup</p>
                    <p className="text-xs text-slate-500">Descargar todos tus datos</p>
                  </div>
                </button>
              </div>

              <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
                {confirmDeleteAll ? (
                  <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl">
                    <h4 className="font-bold text-rose-700 dark:text-rose-400 mb-2">¿Estás seguro?</h4>
                    <p className="text-xs text-rose-600 dark:text-rose-400 mb-4">No se puede deshacer.</p>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setConfirmDeleteAll(false)} className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-500 text-xs font-bold rounded-lg">Cancelar</button>
                      <button onClick={() => { onDeleteAll(); setConfirmDeleteAll(false); }} className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg">Borrar</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteAll(true)} className="px-4 py-2 bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-lg hover:bg-rose-200 transition-all">Borrar Todo</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
