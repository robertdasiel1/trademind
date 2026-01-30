
import React, { useEffect } from 'react';
import { Trophy, Zap, X, CheckCircle2, Flame, Siren, Ban } from 'lucide-react';

export type NotificationType = 'milestone' | 'streak' | 'info' | 'success' | 'risk';

export interface NotificationData {
  title: string;
  message: string;
  type: NotificationType;
}

interface Props {
  data: NotificationData | null;
  onClose: () => void;
}

const NotificationToast: React.FC<Props> = ({ data, onClose }) => {
  useEffect(() => {
    if (data) {
      // Risk notifications stay longer (10 seconds)
      const duration = data.type === 'risk' ? 10000 : 5000;
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [data, onClose]);

  if (!data) return null;

  const getIcon = () => {
    switch (data.type) {
      case 'milestone': return <Trophy className="w-6 h-6 text-yellow-500 animate-bounce-subtle" />;
      case 'streak': return <Flame className="w-6 h-6 text-orange-500 animate-pulse" />;
      case 'success': return <CheckCircle2 className="w-6 h-6 text-emerald-500" />;
      case 'risk': return <Siren className="w-6 h-6 text-white animate-pulse" />;
      default: return <Zap className="w-6 h-6 text-blue-500" />;
    }
  };

  const getStyles = () => {
    switch (data.type) {
      case 'milestone': return 'bg-white dark:bg-slate-900 border-yellow-500/30 shadow-[0_0_30px_rgba(234,179,8,0.2)]';
      case 'streak': return 'bg-white dark:bg-slate-900 border-orange-500/30 shadow-[0_0_30px_rgba(249,115,22,0.2)]';
      case 'success': return 'bg-white dark:bg-slate-900 border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)]';
      case 'risk': return 'bg-rose-600 border-rose-700 text-white shadow-[0_0_50px_rgba(225,29,72,0.6)]';
      default: return 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-xl';
    }
  };

  const getTextColor = () => {
      if (data.type === 'risk') return 'text-white';
      return 'text-slate-900 dark:text-white';
  };

  const getSubTextColor = () => {
      if (data.type === 'risk') return 'text-rose-100 font-medium';
      return 'text-slate-600 dark:text-slate-400';
  };

  const getIconBg = () => {
      if (data.type === 'risk') return 'bg-rose-500 border-rose-400';
      return 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
  };

  return (
    <div className="fixed top-4 right-4 z-[100] animate-in slide-in-from-right-full duration-500 fade-in">
      <div className={`flex items-start gap-4 p-4 rounded-2xl border ${getStyles()} max-w-sm backdrop-blur-md`}>
        <div className={`shrink-0 p-2 rounded-xl border ${getIconBg()}`}>
          {getIcon()}
        </div>
        <div className="flex-1 pt-1">
          <h4 className={`text-sm font-bold mb-1 leading-none ${getTextColor()}`}>{data.title}</h4>
          <p className={`text-xs leading-relaxed ${getSubTextColor()}`}>{data.message}</p>
        </div>
        <button 
          onClick={onClose}
          className={`shrink-0 p-1 transition-colors ${data.type === 'risk' ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default NotificationToast;
