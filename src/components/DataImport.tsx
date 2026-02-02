import React, { useState, useRef } from 'react';
import { Upload, AlertCircle, CheckCircle, Trash2, Eye, Download, Loader2, FileJson, Sheet } from 'lucide-react';
import { importService, ImportedData } from '../services/importService';
import { csvImportService } from '../services/csvImportService';

interface DataImportProps {
  onImportSuccess?: () => void;
  onImportError?: (error: string) => void;
  currentData?: any;
}

export const DataImport: React.FC<DataImportProps> = ({ onImportSuccess, onImportError, currentData }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importType, setImportType] = useState<'json' | 'csv' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      setFile(null);
      setPreview(null);
      setError(null);
      setImportType(null);
      return;
    }

    const isJson = selectedFile.name.endsWith('.json');
    const isCsv = selectedFile.name.endsWith('.csv');

    if (!isJson && !isCsv) {
      setError('Solo se aceptan archivos .json o .csv');
      setFile(null);
      setImportType(null);
      return;
    }

    setFile(selectedFile);
    setImportType(isJson ? 'json' : 'csv');
    setError(null);
    setSuccess(false);
    previewFile(selectedFile, isJson ? 'json' : 'csv');
  };

  const previewFile = async (selectedFile: File, type: 'json' | 'csv') => {
    setIsLoading(true);
    
    if (type === 'json') {
      const { data, error } = await importService.parseJSON(selectedFile);
      if (error) {
        setError(error);
        setPreview(null);
      } else if (data) {
        setPreview(data);
        setError(null);
      }
    } else {
      const result = await csvImportService.importCSV(selectedFile);
      
      if (result.errors.length > 0) {
        setError(`Errores encontrados:\n${result.errors.join('\n')}`);
      }

      if (result.warnings.length > 0) {
        setError(prev => prev ? `${prev}\n\nAdvertencias:\n${result.warnings.join('\n')}` : `Advertencias:\n${result.warnings.join('\n')}`);
      }

      setPreview({
        trades: result.trades,
        csvResult: result
      });
    }
    
    setIsLoading(false);
  };

  const handleImport = async () => {
    if (!file || !preview) {
      setError('No hay archivo válido para importar');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (importType === 'json') {
        importService.replaceAllData(preview);
      } else if (importType === 'csv') {
        // Importar trades del CSV
        const trades = preview.trades || [];
        const data = {
          trades,
          accounts: currentData?.accounts || [],
          notes: currentData?.notes || [],
          userProfile: currentData?.userProfile || {},
          playbook: currentData?.playbook || null,
          aiMessages: currentData?.aiMessages || [],
          achievedMilestones: currentData?.achievedMilestones || []
        };
        importService.replaceAllData(data);
      }

      setSuccess(true);
      setShowConfirmation(false);
      
      setTimeout(() => {
        window.location.reload();
      }, 2000);

      onImportSuccess?.();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      setError(errorMsg);
      onImportError?.(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const stats = preview ? (importType === 'json' ? importService.getImportStats(preview) : {
    totalAccounts: currentData?.accounts?.length || 0,
    totalTrades: preview.trades?.length || 0,
    totalNotes: currentData?.notes?.length || 0,
    totalMessages: currentData?.aiMessages?.length || 0,
    winTrades: preview.trades?.filter((t: any) => t.profit > 0).length || 0,
    lossTrades: preview.trades?.filter((t: any) => t.profit < 0).length || 0,
    totalProfit: preview.trades?.reduce((sum: number, t: any) => sum + (t.profit || 0), 0) || 0
  }) : null;

  return (
    <div className="w-full space-y-4">
      {/* Type Selector */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={() => {
            setImportType(null);
            setFile(null);
            setPreview(null);
            setError(null);
            if (fileInputRef.current) fileInputRef.current.accept = '.json';
          }}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
            importType === 'json'
              ? 'bg-emerald-500 text-white shadow-lg'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <FileJson className="w-5 h-5" />
          JSON
        </button>
        <button
          onClick={() => {
            setImportType(null);
            setFile(null);
            setPreview(null);
            setError(null);
            if (fileInputRef.current) fileInputRef.current.accept = '.csv';
          }}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
            importType === 'csv'
              ? 'bg-emerald-500 text-white shadow-lg'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Sheet className="w-5 h-5" />
          CSV
        </button>
      </div>

      {/* File Drop Zone */}
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="relative border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-6 hover:border-emerald-500 dark:hover:border-emerald-400 transition-colors cursor-pointer group"
      >
        <div className="flex flex-col items-center justify-center">
          <Upload className="w-10 h-10 text-slate-400 dark:text-slate-500 mb-2 group-hover:text-emerald-500 transition-colors" />
          <p className="text-center text-slate-600 dark:text-slate-400 text-sm font-medium">
            {file ? file.name : importType ? `Selecciona archivo ${importType.toUpperCase()}` : 'Selecciona JSON o CSV primero'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {importType === 'json' && 'Backup de TradeMind'}
            {importType === 'csv' && 'Trades de NinjaTrader u otro broker'}
            {!importType && 'Elige un tipo de archivo arriba'}
          </p>
        </div>

        {file && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFile(null);
              setPreview(null);
              setError(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="absolute top-2 right-2 p-1 text-slate-500 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-700 dark:text-red-400 whitespace-pre-wrap">{error}</div>
        </div>
      )}

      {/* Success Alert */}
      {success && (
        <div className="flex gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-700 dark:text-emerald-400">
            ¡Importación exitosa! La página se actualizará en breve...
          </div>
        </div>
      )}

      {/* Stats Preview */}
      {stats && (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Contenido del archivo</h3>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              <Eye className="w-3 h-3" />
              {showPreview ? 'Ocultar' : 'Ver JSON'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-slate-600 dark:text-slate-400">Cuentas</p>
              <p className="font-bold text-slate-900 dark:text-white">{stats.totalAccounts}</p>
            </div>
            <div>
              <p className="text-slate-600 dark:text-slate-400">Trades</p>
              <p className="font-bold text-slate-900 dark:text-white">{stats.totalTrades}</p>
            </div>
            <div>
              <p className="text-slate-600 dark:text-slate-400">Notas</p>
              <p className="font-bold text-slate-900 dark:text-white">{stats.totalNotes}</p>
            </div>
            <div>
              <p className="text-slate-600 dark:text-slate-400">Ganancia</p>
              <p className={`font-bold ${stats.totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                ${stats.totalProfit.toFixed(0)}
              </p>
            </div>
            <div>
              <p className="text-slate-600 dark:text-slate-400">Wins</p>
              <p className="font-bold text-emerald-600 dark:text-emerald-400">{stats.winTrades}</p>
            </div>
            <div>
              <p className="text-slate-600 dark:text-slate-400">Losses</p>
              <p className="font-bold text-red-600 dark:text-red-400">{stats.lossTrades}</p>
            </div>
          </div>

          {showPreview && preview && (
            <div className="mt-3 bg-slate-200 dark:bg-slate-900 p-3 rounded text-xs overflow-x-auto max-h-48 overflow-y-auto">
              <pre className="text-slate-800 dark:text-slate-200 font-mono text-[10px]">
                {JSON.stringify(
                  {
                    cuentas: stats.totalAccounts,
                    trades: stats.totalTrades,
                    notas: stats.totalNotes
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Warning */}
      {preview && !showConfirmation && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300">
          ⚠️ <strong>Atención:</strong> Se reemplazarán TODOS los datos actuales.
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        {!showConfirmation ? (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || success}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              <Upload className="w-4 h-4" />
              {isLoading ? 'Procesando...' : 'Importar JSON'}
            </button>
            {currentData && (
              <button
                onClick={() => {
                  const dataStr = JSON.stringify(currentData, null, 2);
                  const blob = new Blob([dataStr], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `trading_journal_backup_${new Date().toISOString().split('T')[0]}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm"
              >
                <Download className="w-4 h-4" />
                Descargar backup
              </button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => setShowConfirmation(false)}
              disabled={isLoading}
              className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={isLoading}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Reemplazando...
                </>
              ) : (
                'Confirmar reemplazo'
              )}
            </button>
          </>
        )}
      </div>

      {/* Proceed Button */}
      {preview && !showConfirmation && (
        <button
          onClick={() => setShowConfirmation(true)}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 text-sm"
        >
          Proceder con importación
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={importType === 'json' ? '.json' : importType === 'csv' ? '.csv' : '.json,.csv'}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};
