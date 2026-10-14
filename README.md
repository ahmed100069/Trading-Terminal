## Quick Start

### One-command startup
```powershell
cd c:\AI_TRADING_PLATFORM
.\start-platform.ps1
```

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Open
- Fixed frontend port: http://localhost:5173
- Fixed backend port: http://localhost:8000/docs

### Supabase authentication

Create `frontend/.env.local` with the project root URL and browser-safe publishable key:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The one-command startup script passes these values to the backend for session verification. In deployed environments, set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the backend and the `VITE_` variables on the frontend. Existing backends using the legacy `SUPABASE_ANON_KEY` name are supported as a fallback. Never use a Supabase secret or service-role key in the browser. Email confirmation must be completed before signing in when enabled.

# Trading Terminal

A multi-asset trading workspace for market charts, weekly strategy analysis, explainable AI outlooks, risk monitoring, alerts, system health, and paper-trading history. The React application uses persistent section navigation and a shared dashboard response as its market-analysis source.


## Architecture

### Backend
- `backend/main.py`: FastAPI app setup and router registration.
- `backend/app/services/market_data_service.py`: Kraken REST integration for crypto overview, candles, weekly bars, order book, recent trades, and watchlist data; Yahoo Finance for Indian equities.
- `backend/app/strategies/`: modular weekly strategies.
- `backend/app/backtesting/engine.py`: readable weekly simulation engine.
- `backend/app/services/paper_trading_service.py`: paper-trading sync, alerts, and SQLite persistence.
- `backend/app/api/`: thin API routes that call services.

### Frontend
- `frontend/src/App.tsx`: application shell, responsive navigation, and deep-link routes (`/overview`, `/markets`, `/ai`, `/risk`, `/alerts`, `/system`, `/portfolio`).
- `frontend/src/pages/DashboardPage.tsx`: shared market-analysis state rendered in focused Overview, Markets, AI, Risk, Alerts, and System sections.
- `frontend/src/pages/PortfolioPage.tsx`: paper-trading ledger and performance summary.
- `frontend/src/components/LiveCandlestickChart.tsx`: TradingView Lightweight Charts integration with live Binance WebSocket updates.
- `frontend/src/components/WatchlistPanel.tsx`: market selector.
- `frontend/src/components/MarketMicrostructurePanel.tsx`: opt-in, lazy-loaded crypto order book and recent public trades.
- `frontend/src/components/EquityCurveChart.tsx`: weekly strategy equity curve.
- `frontend/src/components/RiskAnalysisPanel.tsx` and `SystemHealthPanel.tsx`: focused risk and infrastructure views.

## Main Features

### Live market terminal
- Watchlist of major USD quoted crypto pairs plus Indian equities.
- Live candlestick chart with interval switching.
- Live price display.
- Optional order book and recent public trade details for crypto pairs.

### Weekly strategy layer
- Moving Average Crossover.
- RSI strategy.
- 12-week Momentum.

### Backtesting
- Weekly simulation using closed Kraken weekly candles for crypto and Yahoo Finance weekly bars for Indian equities.
- Total return.
- Win rate.
- Max drawdown.
- Trade history.

### Paper trading
- SQLite-backed simulated positions and trades.
- Fractional crypto quantity support.
- Console or email alerts.

## API Overview

- `GET /api/health`
- `GET /api/strategies`
- `GET /api/market/watchlist`
- `GET /api/market/{symbol}/overview`
- `GET /api/market/{symbol}/candles`
- `GET /api/market/{symbol}/depth`
- `GET /api/market/{symbol}/recent-trades`
- `GET /api/market/{symbol}/weekly-bars`
- `POST /api/backtests/run`
- `POST /api/paper-trading/sync`
- `GET /api/paper-trading/positions`
- `GET /api/paper-trading/trades`
- `GET /api/paper-trading/alerts`
- `GET /api/dashboard/summary` (includes AI outlook, risk proxies, and observed system health)

## Project Structure

```text
/backend
  main.py
  requirements.txt
  .env.example
  /app
    /api
    /backtesting
    /core
    /models
    /schemas
    /services
    /strategies
/frontend
  package.json
  .env.example
  /src
    /components
    /pages
    /services
    /types
```

## Tech Stack

- **Backend:** Python, FastAPI, Uvicorn
- **Database:** SQLite via SQLAlchemy
- **Data processing:** pandas
- **API client:** httpx
- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Market data:** Kraken REST for crypto analysis, Binance WebSocket for live charts, and Yahoo Finance for Indian equities
- **Architecture:** full-stack API + route-aware SPA with shared market-analysis data and service/strategy layers

## How To Run

### Backend
```powershell
cd c:\AI_TRADING_PLATFORM\backend
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn main:app --reload
```

### Frontend
```powershell
cd c:\AI_TRADING_PLATFORM\frontend
cmd /c npm install
cmd /c npm run dev
```

### Open in browser
- Frontend: `http://127.0.0.1:5173`
- Backend docs: `http://127.0.0.1:8000/docs`
- Fixed ports: frontend `5173`, backend `8000`

Use the one-command startup to avoid stale Vite processes and port drift:

```powershell
cd c:\AI_TRADING_PLATFORM
.\start-platform.ps1
```

### Manual backend
```powershell
cd c:\AI_TRADING_PLATFORM\backend
\.\.venv\Scripts\python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Manual frontend
```powershell
cd c:\AI_TRADING_PLATFORM\frontend
npm install
npm run dev
```

## Suggested Demo Flow

1. Open the terminal with `BTCUSDT` or switch to another pair from the watchlist.
2. Show the live candlestick chart and explain that Binance WebSocket updates keep the newest candle moving while Kraken supplies the backend analysis data.
3. Explain that strategies still use closed weekly candles for clean and stable signals.
4. Run a weekly backtest and discuss total return, win rate, max drawdown, and trade history.
5. Sync paper trading and show positions, alerts, and paper trade history.
6. Point out the clean separation between `services`, `strategies`, `backtesting`, and `api`.

## Why This Version Is Stronger

- It feels closer to a real trading terminal.
- It uses a live market feed rather than delayed stock-style data scraping.
- It still keeps the engineering simple and explainable.
- It demonstrates both system design and product thinking.
- It is impressive enough for internships while still being student-friendly.
