
import React, { useState, useRef, useEffect } from 'react';
import { Trade, TradingAccount, UserProfile, GlobalNote, ChatMessage, Playbook } from '../types';
import { User, Wallet, Database, Settings, X, ChevronRight, ShieldCheck, Ban, Power, Bell } from 'lucide-react';
import { DataImport } from './DataImport';

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
  currentUserRole?: string;
  currentData?: any;
}

const SettingsModal: React.FC<Props> = ({
  isOpen, onClose, userProfile, onUpdateProfile, trades, notes, onImport, onDeleteAll, accounts, activeAccountId, onSetActiveAccount,
  onAddAccount, onUpdateAccount, onDeleteAccount, aiMessages, playbook, achievedMilestones, currentUserRole, currentData
}) => {
  if (!isOpen) return null;
  
  const [activeTab, setActiveTab] = useState<'profile' | 'accounts' | 'data' | 'notifications' | 'admin'>('profile');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersList, setUsersList] = useState<any[]>([]);

  useEffect(() => {
      if (activeTab === 'admin' && currentUserRole === 'admin') {
          fetchUsers();
      }
  }, [activeTab, currentUserRole]);

  const fetchUsers = async () => {
      setLoadingUsers(true);
      try {
          const res = await fetch('/api/admin/users');
          if (res.ok) {
              const data = await res.json();
              setUsersList(data.users || []);
          }
      } catch (e) {
          console.error("Failed to fetch users");
      } finally {
          setLoadingUsers(false);
      }
  };

  const toggleUserStatus = async (id: string, currentStatus: number) => {
      try {
          const res = await fetch(`/api/admin/users/${id}/toggle-active`, { method: 'POST' });
          if (res.ok) {
              const data = await res.json();
              setUsersList(prev => prev.map(u => u.id === id ? { ...u, is_active: data.new_status } : u));
          } else {
             const txt = await res.text();
             alert("Error: " + txt);
          }
      } catch (e) {
          alert("Error de conexión");
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
                  <button onClick={onClose} className="md:hidden ml-auto p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-6 h-6" /></button>
              </div>

              <div className="flex md:flex-col gap-2 flex-1">
                  <SettingsTabButton id="profile" label="Perfil" icon={<User className="w-5 h-5 md:w-4 md:h-4" />} />
                  <SettingsTabButton id="accounts" label="Cuentas" icon={<Wallet className="w-5 h-5 md:w-4 md:h-4" />} />
                  <SettingsTabButton id="notifications" label="Notificaciones" icon={<Bell className="w-5 h-5 md:w-4 md:h-4" />} />
                  <SettingsTabButton id="data" label="Datos" icon={<Database className="w-5 h-5 md:w-4 md:h-4" />} />
                  {currentUserRole === 'admin' && (
                      <SettingsTabButton id="admin" label="Admin Users" icon={<ShieldCheck className="w-5 h-5 md:w-4 md:h-4" />} />
                  )}
              </div>
          </div>

          {/* CONTENT AREA */}
          <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 p-6 md:p-12 relative custom-scrollbar">
             <div className="max-w-3xl mx-auto">
                {activeTab === 'profile' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white pb-6 border-b border-slate-100 dark:border-slate-800">Perfil</h3>
                        <p className="text-slate-500 italic">La configuración de perfil ahora es gestionada por el administrador.</p>
                    </div>
                )}

                {activeTab === 'accounts' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white pb-6 border-b border-slate-100 dark:border-slate-800">Cuentas</h3>
                        <p className="text-slate-500 italic">La gestión de cuentas está disponible en esta sección.</p>
                    </div>
                )}

                {activeTab === 'notifications' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white pb-6 border-b border-slate-100 dark:border-slate-800">Notificaciones</h3>
                        <p className="text-slate-500 italic">La configuración de notificaciones está disponible en esta sección.</p>
                    </div>
                )}

                {activeTab === 'data' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white pb-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                            <Database className="w-6 h-6 text-emerald-500" /> Importar/Exportar Datos
                        </h3>
                        <DataImport 
                            currentData={currentData}
                            onImportSuccess={() => {
                                onClose();
                            }}
                            onImportError={(error) => {
                                console.error('Error de importación:', error);
                            }}
                        />
                    </div>
                )}

                {activeTab === 'admin' && currentUserRole === 'admin' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <ShieldCheck className="w-6 h-6 text-emerald-500" /> Administración de Usuarios
                            </h3>
                        </div>

                        {loadingUsers ? (
                            <div className="text-center py-10 text-slate-500">Cargando usuarios...</div>
                        ) : (
                            <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-500 uppercase">
                                        <tr>
                                            <th className="px-6 py-4">Usuario</th>
                                            <th className="px-6 py-4">Rol</th>
                                            <th className="px-6 py-4">Estado</th>
                                            <th className="px-6 py-4 text-right">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {usersList.map(user => (
                                            <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                                <td className="px-6 py-4">
                                                    <span className="font-bold text-slate-700 dark:text-slate-200">{user.username}</span>
                                                    <div className="text-[10px] text-slate-400">{user.id}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`text-xs font-bold px-2 py-1 rounded-md uppercase ${user.role === 'admin' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                                                        {user.role}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {user.is_active ? (
                                                        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                                                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div> Activo
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1.5 text-xs font-bold text-rose-500">
                                                            <Ban className="w-3 h-3" /> Bloqueado
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {user.role !== 'admin' && (
                                                        <button 
                                                            onClick={() => toggleUserStatus(user.id, user.is_active)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                                                user.is_active 
                                                                ? 'bg-rose-100 text-rose-600 hover:bg-rose-200 dark:bg-rose-900/20 dark:text-rose-400' 
                                                                : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400'
                                                            }`}
                                                        >
                                                            {user.is_active ? 'Bloquear' : 'Activar'}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
             </div>
          </div>
       </div>
    </div>
  );
};

export default SettingsModal;
