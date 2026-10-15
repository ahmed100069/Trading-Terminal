import type {
  AssetSearchResult,
  Candle,
  DashboardQuery,
  DashboardResponse,
  ManualPaperTradeRequest,
  ManualPaperTradeResponse,
  MarketInterval,
  MarketOverview,
  MarketSession,
  OrderBook,
  PaperTradingRequest,
  PaperTradingResponse,
  PaperPosition,
  PaperTrade,
  RecentTrade,
  WatchlistItem,
} from "../types/trading";
import { getSupabaseAccessToken } from "../lib/supabase";

// Production requests go through Vercel's /api rewrite to the Render backend.
// Local development keeps using the local FastAPI server unless explicitly overridden.
const API_BASE_URL = import.meta.env.PROD
  ? "/api"
  : (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api");

// Keep the initial dashboard fan-out from looking like a burst to the API host.
// A single queue is shared by every service call in this browser tab.
const API_REQUEST_SPACING_MS = 300;
const API_429_RETRY_DELAYS_MS = [800, 1_600, 3_200];
let apiRequestQueue: Promise<void> = Promise.resolve();
let nextApiRequestAt = 0;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function scheduleApiRequest<T>(operation: () => Promise<T>): Promise<T> {
  const scheduled = apiRequestQueue.then(async () => {
    const spacing = Math.max(0, nextApiRequestAt - Date.now());
    if (spacing > 0) await wait(spacing);
    nextApiRequestAt = Date.now() + API_REQUEST_SPACING_MS;
    return operation();
  });
  apiRequestQueue = scheduled.then(() => undefined, () => undefined);
  return scheduled;
}

async function fetchWithRateLimitRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await scheduleApiRequest(() => fetch(url, init));
    if (response.status !== 429 || attempt >= API_429_RETRY_DELAYS_MS.length) return response;

    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
    const retryAfterDate = retryAfterHeader ? Date.parse(retryAfterHeader) : Number.NaN;
    const retryAfterMs = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1_000
      : Number.isFinite(retryAfterDate)
        ? retryAfterDate - Date.now()
        : Number.NaN;
    const delay = Number.isFinite(retryAfterMs) && retryAfterMs > 0
      ? Math.min(retryAfterMs, 30_000)
      : API_429_RETRY_DELAYS_MS[attempt];
    await wait(delay);
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const accessToken = await getSupabaseAccessToken();
  const response = await fetchWithRateLimitRetry(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    if (response.status === 429) {
      throw new Error(errorPayload?.detail ?? "The market service is temporarily busy. Requests were retried; please try again shortly.");
    }
    throw new Error(errorPayload?.detail ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
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

export function fetchMarketSession(symbol: string): Promise<MarketSession> {
  return request<MarketSession>(`/market/${symbol}/session`);
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
