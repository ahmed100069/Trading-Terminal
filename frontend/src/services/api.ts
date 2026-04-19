import type {
  AssetSearchResult,
  BacktestResponse,
  Candle,
  DashboardQuery,
  DashboardResponse,
  ManualPaperTradeRequest,
  ManualPaperTradeResponse,
  MarketInterval,
  MarketOverview,
  OrderBook,
  PaperTradingRequest,
  PaperTradingResponse,
  PaperPosition,
  PaperTrade,
  RecentTrade,
  StrategyDefinition,
  WatchlistItem,
} from "../types/trading";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    throw new Error(errorPayload?.detail ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchStrategies(): Promise<StrategyDefinition[]> {
  return request<StrategyDefinition[]>("/strategies");
}

export function fetchDashboardSummary(query: DashboardQuery): Promise<DashboardResponse> {
  const params = new URLSearchParams({
    symbol: query.symbol,
    strategy: query.strategy,
    weeks: String(query.weeks),
    initial_cash: String(query.initial_cash),
    cash_per_trade: String(query.cash_per_trade),
  });

  return request<DashboardResponse>(`/dashboard/summary?${params.toString()}`);
}

export function fetchCandles(symbol: string, interval: MarketInterval, limit = 300): Promise<Candle[]> {
  const params = new URLSearchParams({
    interval,
    limit: String(limit),
  });

  return request<Candle[]>(`/market/${symbol}/candles?${params.toString()}`);
}

export function fetchMarketOverview(symbol: string): Promise<MarketOverview> {
  return request<MarketOverview>(`/market/${symbol}/overview`);
}

export function fetchOrderBook(symbol: string, limit = 12): Promise<OrderBook> {
  const params = new URLSearchParams({ limit: String(limit) });
  return request<OrderBook>(`/market/${symbol}/depth?${params.toString()}`);
}

export function fetchRecentTrades(symbol: string, limit = 25): Promise<RecentTrade[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return request<RecentTrade[]>(`/market/${symbol}/recent-trades?${params.toString()}`);
}

export function fetchWatchlist(symbols?: string[]): Promise<WatchlistItem[]> {
  const params = new URLSearchParams();
  if (symbols && symbols.length > 0) {
    params.set("symbols", symbols.join(","));
  }

  const path = params.toString() ? `/market/watchlist?${params.toString()}` : "/market/watchlist";
  return request<WatchlistItem[]>(path);
}

export function fetchAssetSearch(query: string, limit = 8): Promise<AssetSearchResult[]> {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
  });

  return request<AssetSearchResult[]>(`/market/search?${params.toString()}`);
}

export function runBacktest(payload: DashboardQuery): Promise<BacktestResponse> {
  return request<BacktestResponse>("/backtests/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function syncPaperTrading(payload: PaperTradingRequest): Promise<PaperTradingResponse> {
  return request<PaperTradingResponse>("/paper-trading/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchPaperPositions(symbol?: string, strategy?: string): Promise<PaperPosition[]> {
  const params = new URLSearchParams();
  if (symbol) {
    params.set("symbol", symbol);
  }
  if (strategy) {
    params.set("strategy", strategy);
  }

  const path = params.toString() ? `/paper-trading/positions?${params.toString()}` : "/paper-trading/positions";
  return request<PaperPosition[]>(path);
}

export function fetchPaperTrades(symbol?: string, strategy?: string): Promise<PaperTrade[]> {
  const params = new URLSearchParams();
  if (symbol) {
    params.set("symbol", symbol);
  }
  if (strategy) {
    params.set("strategy", strategy);
  }

  const path = params.toString() ? `/paper-trading/trades?${params.toString()}` : "/paper-trading/trades";
  return request<PaperTrade[]>(path);
}

export function executeManualPaperTrade(payload: ManualPaperTradeRequest): Promise<ManualPaperTradeResponse> {
  return request<ManualPaperTradeResponse>("/paper-trading/manual", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
