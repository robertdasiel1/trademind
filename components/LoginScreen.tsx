
import React, { useState } from 'react';
import { UserProfile } from '../types';
import { BrainCircuit, Lock, User, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

interface Props {
  userProfile: UserProfile;
  onLoginSuccess: () => void;
  onUpdateProfile: (p: UserProfile) => void;
}

const LoginScreen: React.FC<Props> = ({ onLoginSuccess, onUpdateProfile }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const data = await response.json();
            onUpdateProfile({ 
                name: data.user.username,
                tradingType: 'Futuros', 
                tradingStyle: 'Day Trading', 
                username: data.user.username 
            });
            onLoginSuccess();
        } else {
            const errorText = await response.text();
            if (response.status === 403) {
                setError("Tu cuenta ha sido deshabilitada. Contacta al soporte.");
            } else if (response.status === 401) {
                setError("Credenciales incorrectas");
            } else if (response.status === 429) {
                setError("Demasiados intentos. Espera 1 minuto.");
            } else {
                setError("Error en el servidor: " + errorText);
            }
        }
    } catch (err) {
        setError("Error de conexión. Verifica tu internet.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-[#020617] flex flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.3)] mb-4">
            <BrainCircuit className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Trade<span className="text-emerald-500">Mind</span></h1>
      </div>

      <div className="w-full max-w-[400px] animate-in zoom-in-95 duration-500 delay-150">
        <h2 className="text-2xl font-bold text-white text-center mb-8">Bienvenido</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors"><User className="w-5 h-5" /></div>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-[#0f172a] border border-slate-800 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium" placeholder="Usuario" autoFocus autoComplete="username" />
          </div>

          <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors"><Lock className="w-5 h-5" /></div>
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-[#0f172a] border border-slate-800 rounded-xl py-3.5 pl-12 pr-12 text-white placeholder-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium" placeholder="Contraseña" autoComplete="current-password" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors cursor-pointer focus:outline-none">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-rose-500 text-sm font-bold bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 animate-in slide-in-from-top-2"><AlertCircle className="w-4 h-4" />{error}</div>
          )}

          <button type="submit" disabled={loading || !username || !password} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl shadow-[0_0_20px_rgba(5,150,105,0.4)] hover:shadow-[0_0_30px_rgba(5,150,105,0.6)] transition-all active:scale-[0.98] mt-6">
            {loading ? <div className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /><span>Verificando...</span></div> : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;
