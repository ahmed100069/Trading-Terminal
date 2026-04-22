## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install && npm run dev
```

### Open
- App: http://localhost:5173
- API Docs: http://localhost:8000/docs

# Crypto Strategy Terminal

A student-friendly trading platform that now behaves more like a lightweight TradingView-style terminal. It combines live Binance spot market data for the charting experience with simple weekly strategies, backtesting, paper trading, alerts, and a clean React dashboard.


## Architecture

### Backend
- `backend/main.py`: FastAPI app setup and router registration.
- `backend/app/services/market_data_service.py`: Binance REST integration for overview, candles, weekly bars, order book, recent trades, and watchlist data.
- `backend/app/strategies/`: modular weekly strategies.
- `backend/app/backtesting/engine.py`: readable weekly simulation engine.
- `backend/app/services/paper_trading_service.py`: paper-trading sync, alerts, and SQLite persistence.
- `backend/app/api/`: thin API routes that call services.

### Frontend
- `frontend/src/pages/DashboardPage.tsx`: main terminal layout.
- `frontend/src/components/LiveCandlestickChart.tsx`: TradingView Lightweight Charts integration with live Binance WebSocket updates.
- `frontend/src/components/WatchlistPanel.tsx`: market selector.
- `frontend/src/components/OrderBookPanel.tsx`: top-of-book display.
- `frontend/src/components/RecentTradesPanel.tsx`: recent public trade tape.
- `frontend/src/components/EquityCurveChart.tsx`: weekly strategy equity curve.

## Main Features

### Live market terminal
- Watchlist of major Binance spot pairs.
- Live candlestick chart with interval switching.
- Live price display.
- Order book panel.
- Recent trades panel.

### Weekly strategy layer
- Moving Average Crossover.
- RSI strategy.
- 12-week Momentum.

### Backtesting
- Weekly simulation using closed Binance weekly candles.
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
- `GET /api/dashboard/summary`

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
- **Market data:** Binance REST / WebSocket and Yahoo Finance for Indian equities
- **Architecture:** full-stack API + SPA dashboard with clean service and strategy layers

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

## Suggested Demo Flow

1. Open the terminal with `BTCUSDT` or switch to another pair from the watchlist.
2. Show the live candlestick chart and explain that Binance WebSocket updates keep the newest candle moving.
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
