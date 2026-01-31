# Copilot Instructions for TradeMind

## Project Overview
**TradeMind** is a React + Vite AI-powered trading journal application that helps traders track performance, analyze trades with AI insights, and improve through structured reflection. Built with TypeScript, Tailwind CSS, and integrates Google Gemini AI for intelligent trade analysis.

## Architecture & Key Patterns

### Component Structure
- **App.tsx**: Main router component managing view state (dashboard, trades, calendar, notes, AI coach, settings)
- **components/**: Feature-specific React components with local state management
  - `Dashboard.tsx`: Summary view with statistics
  - `TradeForm.tsx`: Multi-step trade entry with screenshot uploads
  - `TradeList.tsx`: Searchable/filterable trade history
  - `AICoach.tsx`: Chat interface for Gemini AI analysis
  - `CalendarView.tsx`, `NotesView.tsx`, `SettingsModal.tsx`: Secondary views
- **services/geminiService.ts**: All AI integration - analysis, coaching, playbook generation

### Data Flow
1. Trades stored in component state (localStorage via window.localStorage in App.tsx)
2. Trades passed to `geminiService` functions for analysis with visual context (base64 screenshots)
3. AI responses displayed in AICoach component with markdown formatting
4. Notifications via NotificationToast component (reusable notification system)

### Key Types (types.ts)
- `Trade`: Core entity with entryPrice, exitPrice, profit, direction (Long/Short), screenshots array, emotions
- `TradingAccount`: Multi-account support (broker, balance, drawdown limits)
- `Playbook`: AI-generated trading strategies stored per user
- `ChatMessage`: Message history in AI coach chats

## Environment & Build

### Setup
```bash
npm install
# Create .env.local with: VITE_GEMINI_API_KEY=your_key
npm run dev      # Starts Vite dev server (localhost:5173)
npm run build    # Builds for production
npm run preview  # Preview production build
```

### Environment Configuration
- Uses Vite's `import.meta.env.VITE_*` pattern for environment variables
- API key loaded in `vite.config.ts` via `loadEnv()`
- **Important**: Prefix environment variables with `VITE_` to expose to client-side code

### Tech Stack
- **React 19.2**: UI framework
- **Vite 5.2**: Build tool with HMR
- **TypeScript 5.2**: Strict type checking
- **Tailwind CSS 3.4**: Utility-first styling with dark mode support
- **Recharts 3.6**: React chart library for performance visualization
- **Google GenAI SDK**: Gemini AI integration
- **html2canvas 1.4**: Screenshot capture for trade charts

## Development Patterns

### Gemini AI Integration
- **File**: `services/geminiService.ts` (299 lines - core AI logic)
- **Pattern**: Functions accept trade data + images as base64 strings
- **Key Functions**:
  - `getTradeAnalysis()`: One-shot analysis of recent trades with screenshots
  - `getCoachingTips()`: Multi-turn chat with persistent history
  - `generatePlaybook()`: Create trading strategies from trade history
- **Image Handling**: Screenshots converted to base64 and embedded in API requests
- **Language**: Responses in Spanish (configured in prompts)

### State Management
- **No Redux/Context API**: Uses React hooks (useState, useEffect, useMemo, useRef)
- **Local Storage**: Trades persisted via window.localStorage
- **Notifications**: Central NotificationToast component with queue system
- **Dark Mode**: Managed via `darkMode` state in App.tsx, applies `dark:` Tailwind classes

### UI/UX Conventions
- **Colors**: Emerald for primary actions, slate for secondary, red/orange for loss states
- **Icons**: lucide-react (18px default size)
- **Responsive**: Mobile-first with collapsible sidebar navigation in App.tsx
- **Forms**: Controlled components with validation before submission

## Common Tasks

### Adding a New View/Feature
1. Create component in `components/` folder (e.g., `NewFeature.tsx`)
2. Add navigation icon + state in App.tsx
3. Use NotificationToast for user feedback
4. Type data structures in types.ts if needed
5. Use Tailwind's dark: prefix for dark mode support

### Modifying AI Prompts
- Edit prompt templates in `geminiService.ts` functions
- Keep Spanish language for user-facing responses
- Use markdown formatting for complex responses
- Include context like total profit, account balance, recent trade data

### Styling
- Use Tailwind utility classes exclusively (no global CSS except index.css)
- Apply `dark:` variants for dark mode
- Common patterns: `px-3 py-3 rounded-xl transition-all duration-300`
- Follow shadow pattern: `shadow-emerald-500/30` for colored shadows

## Critical Dependencies & Limitations
- Gemini API key required (set in .env.local)
- Screenshots require user permission for screenshot capture
- No backend - all data client-side (suitable for personal trading journal)
- Capacitor config present (mobile app capability, but primary use is web)

## Notes for AI Assistants
- When modifying geminiService, test with actual Google Gemini API responses
- Screenshot handling uses base64 encoding - be careful with file size limits (~20MB per request)
- Multi-account support exists in data model but UI may need enhancement
- Preserve Spanish language in AI-generated trade analysis prompts
- Always include 3+ lines context when editing files with replace_string_in_file
