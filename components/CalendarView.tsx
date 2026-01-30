
import React, { useState, useMemo } from 'react';
import { Trade } from '../types';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  trades: Trade[];
}

const DAYS_OF_WEEK = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const CalendarView: React.FC<Props> = ({ trades }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Agrupar trades por día con estadísticas detalladas
  const dailyStats = useMemo(() => {
    const map: Record<string, { profit: number; count: number; wins: number }> = {};
    trades.forEach(trade => {
      const dateKey = new Date(trade.date).toISOString().split('T')[0];
      if (!map[dateKey]) {
        map[dateKey] = { profit: 0, count: 0, wins: 0 };
      }
      map[dateKey].profit += trade.profit;
      map[dateKey].count += 1;
      if (trade.profit > 0) map[dateKey].wins += 1;
    });
    return map;
  }, [trades]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const monthName = currentDate.toLocaleString('es-ES', { month: 'long' });

  const renderDays = () => {
    const days = [];
    
    // Padding for first day of month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 md:h-28 bg-slate-100 dark:bg-slate-900/20 rounded-lg md:rounded-xl border border-transparent"></div>);
    }

    // Actual month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const dateKey = dateObj.toISOString().split('T')[0];
      const stats = dailyStats[dateKey];
      const isToday = new Date().toISOString().split('T')[0] === dateKey;

      const winRate = stats ? (stats.wins / stats.count) * 100 : 0;

      days.push(
        <div 
          key={d} 
          className={`h-24 md:h-28 p-1 md:p-2 rounded-lg md:rounded-xl border transition-all relative group flex flex-col ${
            isToday ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50'
          } hover:border-slate-300 dark:hover:border-slate-700`}
        >
          {/* Header: Day Number (Top Right) */}
          <div className="flex justify-end w-full mb-0.5 md:mb-1">
            <span className={`text-[9px] md:text-[10px] font-bold ${isToday ? 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded' : 'text-slate-400'}`}>
              {d}
            </span>
          </div>
          
          {/* Content: Stats */}
          <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
            {stats ? (
              <>
                <div className={`text-[11px] sm:text-xs md:text-base font-black tracking-tight leading-none ${
                  stats.profit > 0 ? 'text-emerald-500 dark:text-emerald-400' : stats.profit < 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-400'
                }`}>
                  {stats.profit > 0 ? '+' : ''}${Math.abs(stats.profit).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                
                <div className="hidden sm:block text-[10px] text-slate-500 font-medium leading-tight">
                  {stats.count} trade{stats.count !== 1 ? 's' : ''}
                </div>
                {/* Mobile Compact View for Trade Count */}
                <div className="sm:hidden text-[9px] text-slate-500 font-medium leading-tight">
                  {stats.count} trd
                </div>
                
                <div className="text-[9px] md:text-[10px] font-bold text-blue-500/80 dark:text-blue-400/80 leading-tight">
                   {winRate.toFixed(0)}% WR
                </div>
              </>
            ) : (
               <span className="text-[10px] text-slate-300 dark:text-slate-700">-</span>
            )}
          </div>

          {/* Bottom Bar Indicator */}
          {stats && (
            <div className={`absolute bottom-0 left-0 right-0 h-1 rounded-b-lg md:rounded-b-xl ${
              stats.profit > 0 ? 'bg-emerald-500/30' : stats.profit < 0 ? 'bg-rose-500/30' : 'bg-slate-500/10'
            }`}></div>
          )}
        </div>
      );
    }

    return days;
  };

  const totalMonthPL = useMemo(() => {
    let total = 0;
    Object.entries(dailyStats).forEach(([date, stats]) => {
      const d = new Date(date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        total += (stats as { profit: number }).profit;
      }
    });
    return total;
  }, [dailyStats, year, month]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white capitalize">{monthName} {year}</h2>
          <p className="text-slate-500 text-sm">Resumen mensual de rendimiento diario</p>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Balance Mensual</p>
            <p className={`text-xl font-black ${totalMonthPL >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
              {totalMonthPL >= 0 ? '+' : ''}${totalMonthPL.toLocaleString()}
            </p>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={prevMonth}
              className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-white rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button 
              onClick={nextMonth}
              className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-white rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 md:p-6 shadow-xl overflow-hidden">
        <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2 md:mb-4">
          {DAYS_OF_WEEK.map(day => (
            <div key={day} className="text-center py-2 text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {renderDays()}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 md:gap-6 justify-center text-[10px] md:text-xs text-slate-500 mt-4 px-4 text-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/50"></div>
          <span>Día Ganador</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-rose-500/20 border border-rose-500/50"></div>
          <span>Día Perdedor</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"></div>
          <span>Sin Actividad</span>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
