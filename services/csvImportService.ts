import { Trade } from '../types';

export interface CSVRow {
  [key: string]: string | number;
}

export interface CSVImportResult {
  trades: Trade[];
  errors: string[];
  warnings: string[];
}

/**
 * Servicio para importar trades desde CSV de NinjaTrader
 * Soporta múltiples formatos de columnas
 */
export const csvImportService = {
  /**
   * Parsea un archivo CSV y retorna trades
   */
  async parseCSV(file: File): Promise<{ data: CSVRow[] | null; error: string | null }> {
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');

      if (lines.length < 2) {
        return {
          data: null,
          error: 'El archivo CSV está vacío o no tiene encabezados'
        };
      }

      const headers = lines[0].split(',').map(h => h.trim());
      const rows: CSVRow[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length === 0 || values.every(v => v === '')) continue;

        const row: CSVRow = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        rows.push(row);
      }

      return { data: rows, error: null };
    } catch (err) {
      return {
        data: null,
        error: `Error al parsear CSV: ${err instanceof Error ? err.message : 'desconocido'}`
      };
    }
  },

  /**
   * Detecta automáticamente qué columnas contienen Entry y Exit
   */
  detectColumns(headers: string[]): { entryCol?: string; exitCol?: string; timeCol?: string; quantityCol?: string; priceCol?: string; symbolCol?: string; directionCol?: string } {
    const headerLower = headers.map(h => h.toLowerCase());
    
    return {
      entryCol: headerLower.find(h => h.includes('entry') || h.includes('entrada') || h.includes('compra')),
      exitCol: headerLower.find(h => h.includes('exit') || h.includes('salida') || h.includes('venta')),
      timeCol: headerLower.find(h => h.includes('time') || h.includes('hora') || h.includes('date') || h.includes('fecha')),
      quantityCol: headerLower.find(h => h.includes('quantity') || h.includes('qty') || h.includes('cantidad')),
      priceCol: headerLower.find(h => h.includes('price') || h.includes('precio')),
      symbolCol: headerLower.find(h => h.includes('symbol') || h.includes('asset') || h.includes('instrumento')),
      directionCol: headerLower.find(h => h.includes('direction') || h.includes('side') || h.includes('tipo') || h.includes('long') || h.includes('short'))
    };
  },

  /**
   * Convierte filas CSV a Trades
   */
  convertToTrades(
    rows: CSVRow[],
    columns: { 
      entryCol?: string; 
      exitCol?: string; 
      timeCol?: string; 
      quantityCol?: string; 
      priceCol?: string; 
      symbolCol?: string; 
      directionCol?: string;
    }
  ): CSVImportResult {
    const trades: Trade[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    rows.forEach((row, index) => {
      try {
        // Obtener valores
        const entryPrice = parseFloat(String(row[columns.entryCol || ''] || 0));
        const exitPrice = parseFloat(String(row[columns.exitCol || ''] || 0));
        const quantity = parseFloat(String(row[columns.quantityCol || ''] || 1));
        const symbol = String(row[columns.symbolCol || ''] || 'Unknown').toUpperCase();
        const timeStr = String(row[columns.timeCol || ''] || new Date().toISOString());
        
        // Validar datos críticos
        if (isNaN(entryPrice) || isNaN(exitPrice)) {
          errors.push(`Fila ${index + 2}: Precios de entrada/salida inválidos`);
          return;
        }

        if (entryPrice === 0 || exitPrice === 0) {
          errors.push(`Fila ${index + 2}: Los precios no pueden ser cero`);
          return;
        }

        // Determinar dirección
        let direction: 'Long' | 'Short' = 'Long';
        const directionValue = String(row[columns.directionCol || ''] || '').toLowerCase();
        if (directionValue.includes('short') || directionValue.includes('venta') || directionValue === 'sell') {
          direction = 'Short';
        } else if (directionValue.includes('long') || directionValue.includes('compra') || directionValue === 'buy') {
          direction = 'Long';
        }

        // Calcular profit
        const profit = direction === 'Long' 
          ? (exitPrice - entryPrice) * quantity
          : (entryPrice - exitPrice) * quantity;

        // Parsear fecha
        let date: string;
        try {
          const parsedDate = new Date(timeStr);
          if (isNaN(parsedDate.getTime())) {
            date = new Date().toISOString();
            warnings.push(`Fila ${index + 2}: Fecha inválida, usando fecha actual`);
          } else {
            date = parsedDate.toISOString();
          }
        } catch {
          date = new Date().toISOString();
          warnings.push(`Fila ${index + 2}: Error al parsear fecha`);
        }

        // Crear trade
        const trade: Trade = {
          id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          asset: symbol,
          entryPrice,
          exitPrice,
          quantity,
          profit,
          direction,
          date,
          status: 'closed',
          emotions: [],
          screenshots: [],
          notes: `Importado desde CSV - ${symbol}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        trades.push(trade);
      } catch (err) {
        errors.push(`Fila ${index + 2}: ${err instanceof Error ? err.message : 'Error desconocido'}`);
      }
    });

    return { trades, errors, warnings };
  },

  /**
   * Importa un archivo CSV completo
   */
  async importCSV(file: File): Promise<CSVImportResult> {
    // Parsear CSV
    const { data, error } = await this.parseCSV(file);
    
    if (error || !data) {
      return {
        trades: [],
        errors: [error || 'Error desconocido'],
        warnings: []
      };
    }

    // Detectar columnas
    const headers = Object.keys(data[0] || {});
    const columns = this.detectColumns(headers);

    // Validar que tenemos al menos entry y exit
    if (!columns.entryCol || !columns.exitCol) {
      return {
        trades: [],
        errors: ['No se encontraron columnas de Entry/Exit en el CSV'],
        warnings: []
      };
    }

    // Convertir a trades
    return this.convertToTrades(data, columns);
  },

  /**
   * Exporta trades a formato CSV
   */
  exportToCSV(trades: Trade[], filename: string = 'trades.csv'): void {
    const headers = ['ID', 'Activo', 'Dirección', 'Precio Entrada', 'Precio Salida', 'Cantidad', 'Ganancia', 'Fecha'];
    const rows = trades.map(t => [
      t.id,
      t.asset,
      t.direction,
      t.entryPrice.toFixed(2),
      t.exitPrice.toFixed(2),
      t.quantity.toString(),
      t.profit.toFixed(2),
      new Date(t.date).toLocaleDateString()
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
};
