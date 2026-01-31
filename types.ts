
export enum TradeDirection {
  LONG = 'Long',
  SHORT = 'Short'
}

export enum TradeStatus {
  WIN = 'Win',
  LOSS = 'Loss',
  BREAK_EVEN = 'Break Even'
}

export enum TradeSession {
  NY = 'NY',
  LONDON = 'Londres',
  ASIA = 'Asia'
}

export interface Trade {
  id: string;
  accountId?: string; // New field for multi-account support
  date: string; // Entry Date
  exitDate?: string; // Exit Date
  asset: string;
  direction: TradeDirection;
  session: TradeSession;
  rating: number; // 1 to 3 stars
  entryPrice: number;
  exitPrice: number;
  size: number;
  profit: number;
  status: TradeStatus;
  notes: string;
  emotions: string;
  screenshots: string[]; // Array of Base64 strings
}

export interface GoalStats {
  target: number;
  currentTotal: number;
  daysRemaining: number;
  winRate: number;
  averageProfit: number;
}

export interface GlobalNote {
  id: string;
  title: string;
  content: string;
  date: string;
  updatedAt?: string; // Track last edit time
  tags: string[];
  screenshots?: string[]; // Array of images
  screenshot?: string; // Legacy support
  folder?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isVisualAnalysis?: boolean;
}

export interface UserProfile {
  name: string;
  avatar?: string; // Base64 string
  tradingType: string; // Futuros, Opciones, Acciones, etc.
  tradingStyle: string; // Scalping, Day Trading, Swing, etc.
  username?: string;
  password?: string;
}

export interface TradingAccount {
  id: string;
  name: string;
  broker: string; // 'NinjaTrader', 'Thinkorswim', 'Interactive Brokers', etc.
  initialBalance: number;
  goal: number;
  deadline?: string; // 'YYYY-MM-DD'
  maxDrawdownLimit: number;
  currency: string;
  isReal: boolean; // TRUE = Live (Commissions apply), FALSE = Demo/Test
  createdAt: string;
  // Risk Management
  dailyLossLimit?: number;
  dailyProfitTarget?: number;
}

export interface Playbook {
  fileName: string;
  fileData: string; // Base64 PDF
  uploadDate: string;
  summary?: string; // AI generated summary of the rules
}
