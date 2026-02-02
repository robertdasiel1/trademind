import { Trade, TradingAccount, Note, ChatMessage } from '../types';

export interface ImportedData {
  version?: number;
  timestamp?: string;
  userProfile?: {
    name: string;
    tradingType: string;
    tradingStyle: string;
  };
  accounts: TradingAccount[];
  trades: Trade[];
  notes: Note[];
  aiMessages?: ChatMessage[];
  playbook?: {
    fileName: string;
    fileData: string;
    uploadDate: string;
    summary: string;
  };
}

export const importService = {
  /**
   * Valida estructura JSON importado
   */
  validateJSON(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data) {
      errors.push('El archivo no contiene datos válidos');
      return { valid: false, errors };
    }

    // Validar que tenga las propiedades principales
    if (!Array.isArray(data.accounts)) {
      errors.push('Falta el campo "accounts" (debe ser un array)');
    }

    if (!Array.isArray(data.trades)) {
      errors.push('Falta el campo "trades" (debe ser un array)');
    }

    if (!Array.isArray(data.notes)) {
      errors.push('Falta el campo "notes" (debe ser un array)');
    }

    // Validar estructura de trades
    if (Array.isArray(data.trades)) {
      data.trades.forEach((trade: any, index: number) => {
        if (!trade.id) errors.push(`Trade #${index + 1}: Falta "id"`);
        if (trade.entryPrice === undefined) errors.push(`Trade #${index + 1}: Falta "entryPrice"`);
        if (trade.exitPrice === undefined) errors.push(`Trade #${index + 1}: Falta "exitPrice"`);
        if (!trade.direction) errors.push(`Trade #${index + 1}: Falta "direction"`);
      });
    }

    // Validar estructura de accounts
    if (Array.isArray(data.accounts)) {
      data.accounts.forEach((account: any, index: number) => {
        if (!account.id) errors.push(`Cuenta #${index + 1}: Falta "id"`);
        if (!account.name) errors.push(`Cuenta #${index + 1}: Falta "name"`);
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Parsea archivo JSON y retorna datos importados
   */
  async parseJSON(file: File): Promise<{ data: ImportedData | null; error: string | null }> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const validation = this.validateJSON(data);
      if (!validation.valid) {
        return {
          data: null,
          error: `Errores de validación:\n${validation.errors.join('\n')}`
        };
      }

      return { data, error: null };
    } catch (err) {
      if (err instanceof SyntaxError) {
        return {
          data: null,
          error: `Error al parsear JSON: ${err.message}`
        };
      }
      return {
        data: null,
        error: 'Error desconocido al procesar el archivo'
      };
    }
  },

  /**
   * Reemplaza todos los datos existentes con los importados
   */
  replaceAllData(importedData: ImportedData): void {
    try {
      const dataToStore = {
        version: importedData.version || 2,
        timestamp: new Date().toISOString(),
        userProfile: importedData.userProfile || {
          name: 'Trader',
          tradingType: '',
          tradingStyle: ''
        },
        accounts: importedData.accounts || [],
        trades: importedData.trades || [],
        notes: importedData.notes || [],
        aiMessages: importedData.aiMessages || [],
        playbook: importedData.playbook || null,
        achievedMilestones: [],
        activeAccountId: importedData.accounts?.[0]?.id || null
      };

      // Guardar en localStorage
      localStorage.setItem('tradingJournal', JSON.stringify(dataToStore));
    } catch (err) {
      throw new Error(`Error al guardar datos: ${err instanceof Error ? err.message : 'desconocido'}`);
    }
  },

  /**
   * Obtiene estadísticas del archivo importado
   */
  getImportStats(data: ImportedData) {
    return {
      totalAccounts: data.accounts?.length || 0,
      totalTrades: data.trades?.length || 0,
      totalNotes: data.notes?.length || 0,
      totalMessages: data.aiMessages?.length || 0,
      winTrades: data.trades?.filter(t => t.profit > 0).length || 0,
      lossTrades: data.trades?.filter(t => t.profit < 0).length || 0,
      totalProfit: data.trades?.reduce((sum, t) => sum + (t.profit || 0), 0) || 0
    };
  }
};
