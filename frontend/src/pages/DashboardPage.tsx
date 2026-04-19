import { useEffect, useState } from "react";

import { AIPredictionPanel } from "../components/AIPredictionPanel";
import { AlertsList } from "../components/AlertsList";
import { ChartInspectorPanel } from "../components/ChartInspectorPanel";
import { LiveCandlestickChart, type ChartInspection } from "../components/LiveCandlestickChart";
import { Panel } from "../components/Panel";
import { PositionsTable } from "../components/PositionsTable";
import { TradesTable } from "../components/TradesTable";
import { WatchlistPanel } from "../components/WatchlistPanel";
import { formatIndianDateTime, formatRupees } from "../utils/format";
import {
  executeManualPaperTrade,
  fetchAssetSearch,
  fetchCandles,
  fetchDashboardSummary,
  fetchMarketOverview,
  fetchWatchlist,
  syncPaperTrading,
} from "../services/api";
import type {
  AssetSearchResult,
  Candle,
  DashboardQuery,
  DashboardResponse,
  ManualTradeAction,
  MarketInterval,
  WatchlistItem,
} from "../types/trading";

const CHART_INTERVALS: MarketInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
const AI_REFRESH_MS = 60000;
const AI_SYNC_ENTRY_THRESHOLD = 80;
const DASHBOARD_SETTINGS_STORAGE_KEY = "trading-platform-dashboard-settings";

interface ActionFeedEntry {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
  createdAt: string;
}

interface PersistedDashboardSettings {
  filters: DashboardQuery;
  chartInterval: MarketInterval;
  tradeQuantity: string;
  syncQuantityOverride: string;
}

function loadPersistedDashboardSettings(): PersistedDashboardSettings {
  if (typeof window === "undefined") {
    return {
      filters: initialFilters,
      chartInterval: "1m",
      tradeQuantity: "0.01",
      syncQuantityOverride: "",
    };
  }

  try {
    const raw = window.localStorage.getItem(DASHBOARD_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {
        filters: initialFilters,
        chartInterval: "1m",
        tradeQuantity: "0.01",
        syncQuantityOverride: "",
      };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedDashboardSettings>;
    return {
      filters: {
        ...initialFilters,
        ...(parsed.filters ?? {}),
      },
      chartInterval: parsed.chartInterval ?? "1m",
      tradeQuantity: parsed.tradeQuantity ?? "0.01",
      syncQuantityOverride: parsed.syncQuantityOverride ?? "",
    };
  } catch {
    return {
      filters: initialFilters,
      chartInterval: "1m",
      tradeQuantity: "0.01",
      syncQuantityOverride: "",
    };
  }
}

const initialFilters: DashboardQuery = {
  symbol: "BTCUSDT",
  strategy: "momentum",
  weeks: 156,
  initial_cash: 10000,
  cash_per_trade: 2500,
};

interface DashboardPageProps {
  onOpenPortfolio: () => void;
}

export function DashboardPage({ onOpenPortfolio }: DashboardPageProps) {
  const persistedSettings = loadPersistedDashboardSettings();
  const [filters, setFilters] = useState<DashboardQuery>(persistedSettings.filters);
  const [chartInterval, setChartInterval] = useState<MarketInterval>(persistedSettings.chartInterval);
  const [summary, setSummary] = useState<DashboardResponse | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [chartInspection, setChartInspection] = useState<ChartInspection | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AssetSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [tradeQuantity, setTradeQuantity] = useState(persistedSettings.tradeQuantity);
  const [syncQuantityOverride, setSyncQuantityOverride] = useState(persistedSettings.syncQuantityOverride);
  const [tradeNote, setTradeNote] = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionFeed, setActionFeed] = useState<ActionFeedEntry[]>([]);

  function pushActionFeed(messageText: string, tone: ActionFeedEntry["tone"]) {
    setActionFeed((current) => [
      {
        id: Date.now() + current.length,
        message: messageText,
        tone,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ].slice(0, 10));
  }

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [dashboard, watchlistItems, chartCandles] = await Promise.all([
          fetchDashboardSummary(persistedSettings.filters),
          fetchWatchlist(),
          fetchCandles(persistedSettings.filters.symbol, persistedSettings.chartInterval, 320),
        ]);

        setSummary(dashboard);
        setWatchlist(watchlistItems);
        setCandles(chartCandles);
        setLivePrice(dashboard.market.last_price);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load terminal data.");
        pushActionFeed(loadError instanceof Error ? loadError.message : "Failed to load terminal data.", "error");
      } finally {
        setLoading(false);
      }
    }

    void loadInitialData();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      DASHBOARD_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        filters,
        chartInterval,
        tradeQuantity,
        syncQuantityOverride,
      } satisfies PersistedDashboardSettings),
    );
  }, [filters, chartInterval, tradeQuantity, syncQuantityOverride]);

  useEffect(() => {
    if (!summary) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refreshLivePanels(filters.symbol);
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [filters.symbol, summary]);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSearchLoading(true);
      fetchAssetSearch(trimmedQuery, 8)
        .then((results) => {
          setSearchResults(results);
        })
        .catch(() => {
          setSearchResults([]);
        })
        .finally(() => {
          setSearchLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery]);


  useEffect(() => {
    if (!summary) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refreshDashboard(filters, chartInterval).catch(() => {
        // Keep the chart session running even if one AI refresh fails.
      });
    }, AI_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [chartInterval, filters, summary]);
  const displayedPrice = livePrice ?? summary?.market.last_price ?? 0;

  async function refreshLivePanels(symbol: string) {
    try {
      const [overview, watchlistItems] = await Promise.all([fetchMarketOverview(symbol), fetchWatchlist()]);

      setSummary((currentSummary) =>
        currentSummary
          ? {
              ...currentSummary,
              market: overview,
            }
          : currentSummary,
      );
      setWatchlist(watchlistItems);
      setLivePrice(overview.last_price);
    } catch {
      // Keep the UI responsive even if one live refresh fails.
    }
  }

  async function refreshChart(symbol: string, interval: MarketInterval) {
    const chartCandles = await fetchCandles(symbol, interval, 320);
    setCandles(chartCandles);
  }

  async function refreshDashboard(nextFilters: DashboardQuery, nextInterval = chartInterval) {
    setError(null);
    const [dashboard, chartCandles, watchlistItems] = await Promise.all([
      fetchDashboardSummary(nextFilters),
      fetchCandles(nextFilters.symbol, nextInterval, 320),
      fetchWatchlist(),
    ]);

    setSummary(dashboard);
    setCandles(chartCandles);
    setWatchlist(watchlistItems);
    setLivePrice(dashboard.market.last_price);
  }

  async function handleSelectWatchlistSymbol(symbol: string) {
    const nextFilters = {
      ...filters,
      symbol,
    };

    setFilters(nextFilters);
    setSearchQuery("");
    setSearchResults([]);
    setActionLoading(true);
    setMessage(null);
    setError(null);

    try {
      await refreshDashboard(nextFilters, chartInterval);
      setMessage(`Loaded ${symbol} into the terminal.`);
      pushActionFeed(`Loaded ${symbol} into the terminal.`, "info");
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Unable to switch symbols.");
      pushActionFeed(selectionError instanceof Error ? selectionError.message : "Unable to switch symbols.", "error");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleChangeChartInterval(interval: MarketInterval) {
    setChartInterval(interval);
    try {
      await refreshChart(filters.symbol, interval);
    } catch (chartError) {
      setError(chartError instanceof Error ? chartError.message : "Unable to refresh chart interval.");
    }
  }

  async function handleManualPaperTrade(action: ManualTradeAction) {
    const parsedQuantity = Number(tradeQuantity);
    if (action !== "CLOSE" && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)) {
      setError("Enter a valid quantity before placing a paper trade.");
      pushActionFeed("Enter a valid quantity before placing a paper trade.", "error");
      return;
    }

    const confirmationMessage = [
      action === "CLOSE" ? `Close the full paper position for ${filters.symbol}?` : `${action} ${parsedQuantity} of ${filters.symbol} in paper trading?`,
      `Strategy: ${filters.strategy}`,
      tradeNote.trim() ? `Note: ${tradeNote.trim()}` : "Note: none",
    ].join("\n");

    if (!window.confirm(confirmationMessage)) {
      pushActionFeed(`Cancelled manual ${action} for ${filters.symbol}.`, "info");
      return;
    }

    setActionLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await executeManualPaperTrade({
        symbol: filters.symbol,
        strategy: filters.strategy,
        action,
        quantity: action === "CLOSE" ? undefined : parsedQuantity,
        note: tradeNote.trim() || undefined,
      });
      await refreshDashboard(filters, chartInterval);
      setMessage(response.action_summary);
      pushActionFeed(response.action_summary, "success");
      if (action !== "SELL") {
        setTradeNote("");
      }
    } catch (tradeError) {
      setError(tradeError instanceof Error ? tradeError.message : "Paper trade failed.");
      pushActionFeed(tradeError instanceof Error ? tradeError.message : "Paper trade failed.", "error");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSyncPaperTrading() {
    const parsedSyncQuantity = syncQuantityOverride.trim() ? Number(syncQuantityOverride) : undefined;
    if (syncQuantityOverride.trim() && (!Number.isFinite(parsedSyncQuantity) || Number(parsedSyncQuantity) <= 0)) {
      setError("Enter a valid sync quantity or leave it blank to size the order from cash per trade.");
      pushActionFeed("Enter a valid strategy quantity before syncing.", "error");
      return;
    }

    const syncDecisionPreview = summary
      ? buildSyncDecisionPreview(summary, filters.symbol, filters.strategy, parsedSyncQuantity, livePrice ?? summary.market.last_price, filters.cash_per_trade)
      : "Checking live sync rules...";
    if (!window.confirm(`Sync paper trading for ${filters.symbol}?\n\n${syncDecisionPreview}`)) {
      pushActionFeed(`Cancelled sync for ${filters.symbol}.`, "info");
      return;
    }

    setActionLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await syncPaperTrading({
        symbols: [filters.symbol],
        strategy: filters.strategy,
        initial_cash: filters.initial_cash,
        cash_per_trade: filters.cash_per_trade,
        quantity: parsedSyncQuantity,
        ai_entry_threshold_pct: AI_SYNC_ENTRY_THRESHOLD,
        lookback_weeks: filters.weeks,
      });
      await refreshDashboard(filters, chartInterval);
      const syncMessage = response.executed_actions.join(" | ");
      setMessage(syncMessage);
      pushActionFeed(syncMessage, "success");
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Paper trading sync failed.");
      pushActionFeed(syncError instanceof Error ? syncError.message : "Paper trading sync failed.", "error");
    } finally {
      setActionLoading(false);
    }
  }

  const currentPosition = summary?.positions.find(
    (position) => position.symbol === filters.symbol && position.strategy_name === filters.strategy && position.status === "OPEN",
  ) ?? null;
  const previewQuantity = syncQuantityOverride.trim() ? Number(syncQuantityOverride) : ((livePrice ?? summary?.market.last_price ?? 0) > 0 ? filters.cash_per_trade / (livePrice ?? summary?.market.last_price ?? 1) : 0);
  const weeklySignal = summary?.backtest.latest_signal ?? "Loading";
  const aiOutlookLabel = summary ? `${summary.ai_outlook.direction} ${summary.ai_outlook.confidence_pct.toFixed(1)}%` : "Loading";
  const syncActionPreview = summary ? describeSyncAction(summary, filters.symbol, filters.strategy, previewQuantity, currentPosition) : "Loading execution preview...";

  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      {actionFeed.slice(0, 3).length > 0 ? (
        <div className="fixed right-4 top-4 z-20 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3">
          {actionFeed.slice(0, 3).map((entry) => (
            <div
              key={entry.id}
              className={`rounded-2xl border px-4 py-3 shadow-soft backdrop-blur ${
                entry.tone === "success"
                  ? "border-leaf/50 bg-sage/95 text-leaf"
                  : entry.tone === "error"
                    ? "border-ruby/50 bg-red-50/95 text-ruby"
                    : "border-ink/10 bg-sage/95 text-ink"
              }`}
            >
              <p className="text-sm font-semibold">{entry.message}</p>
              <p className="mt-1 text-xs opacity-70">{formatIndianDateTime(entry.createdAt)}</p>
            </div>
          ))}
        </div>
      ) : null}

      <section className="relative mb-6 overflow-hidden rounded-[2rem] border border-white/60 bg-[linear-gradient(135deg,rgba(11,21,36,0.94),rgba(19,34,56,0.88)_46%,rgba(15,138,113,0.84)_100%)] p-6 text-white shadow-soft backdrop-blur">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,138,113,0.3),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(220,38,38,0.2),transparent_22%)]" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-leaf/90">Multi-Asset Strategy Terminal</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="font-display text-4xl text-white sm:text-[3.4rem]">
                TradingView by Ahmed
              </h1>
              <button
                onClick={onOpenPortfolio}
                className="rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white hover:text-night"
              >
                Portfolio
              </button>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/74">
              A sharper trading cockpit with live prices, explainable signals, paper execution, and a portfolio ledger that feels closer to a real terminal.
            </p>
          </div>
          <div className="relative grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-leaf/90">Live Source</p>
              <p className="mt-2 font-display text-2xl text-white">{summary?.market.market ?? "Binance + NSE/BSE"}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ruby/90">Decision Layer</p>
              <p className="mt-2 font-display text-2xl text-white">AI + Weekly Signals</p>
            </div>
          </div>
        </div>
      </section>

      {error ? <p className="mb-4 text-sm font-medium text-ruby-700">{error}</p> : null}
      {message ? <p className="mb-4 text-sm font-medium text-leaf-700">{message}</p> : null}

      <section className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_330px]">
        <Panel title="Watchlist" subtitle="Search crypto, NSE stocks, or BSE stocks and switch the whole terminal.">
          <WatchlistPanel
            items={watchlist}
            activeSymbol={filters.symbol}
            searchQuery={searchQuery}
            searchResults={searchResults}
            searchLoading={searchLoading}
            onSearchQueryChange={setSearchQuery}
            onSelect={(symbol) => void handleSelectWatchlistSymbol(symbol)}
          />
        </Panel>

        <div className="space-y-6">
          <Panel title={`${filters.symbol} Chart`} subtitle={`Candles are loaded from ${summary?.market.market ?? "the active market feed"} for the selected asset.`}>
            <div className="mb-5 flex flex-col gap-4 rounded-3xl border border-ink/10 bg-sand/55 p-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ink/50">Live Price</p>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <p className="font-display text-4xl text-ink">{formatRupees(displayedPrice)}</p>
                  <p className={`pb-1 text-base font-semibold ${summary && summary.market.price_change_percent >= 0 ? "text-leaf-700" : "text-ruby-700"}`}>
                    {summary && summary.market.price_change_percent >= 0 ? "+" : ""}
                    {summary?.market.price_change_percent.toFixed(2) ?? "0.00"}%
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {CHART_INTERVALS.map((interval) => (
                  <button
                    key={interval}
                    onClick={() => void handleChangeChartInterval(interval)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      chartInterval === interval ? "bg-ink text-white" : "bg-sage text-ink hover:bg-sage/80"
                    }`}
                  >
                    {interval}
                  </button>
                ))}
              </div>
            </div>

            <LiveCandlestickChart
              symbol={filters.symbol}
              interval={chartInterval}
              candles={candles}
              onLivePrice={setLivePrice}
              onInspectChange={setChartInspection}
            />

            <div className="mt-4 flex flex-col gap-3 rounded-3xl border border-ink/10 bg-sand/35 px-4 py-3 text-xs text-ink/55 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold uppercase tracking-[0.18em] text-ink/45">Overlay Legend</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-sage/80 px-3 py-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-ink" />
                  Candles
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  SMA 20
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-ruby-50 px-3 py-1 text-ruby-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-ruby-500" />
                  EMA 50
                </span>
              </div>
              <p>Use the crosshair to inspect each candle while the AI layer scores the active setup.</p>
            </div>
          </Panel>

          <Panel title="Paper Trading Actions" subtitle="Manual paper trades plus strategy sync for the current symbol.">
            <div className="space-y-4">
              <div className="rounded-2xl border border-ink/10 bg-sand/50 p-4 text-sm text-ink/70">
                <p className="font-semibold text-ink">Active Setup</p>
                <p className="mt-2">Symbol: {filters.symbol}</p>
                <p>Weekly strategy: {filters.strategy}</p>
                <p>Market: {summary?.market.market ?? "Active feed"}</p>
              </div>

              <div className="rounded-2xl border border-leaf/15 bg-sage/70 p-4 text-sm text-ink/70">
                <p className="font-semibold text-ink">Sync Decision</p>
                <p className="mt-2">
                  Execution signal: <span className="font-semibold text-ink">{weeklySignal}</span>
                </p>
                <p>
                  AI outlook:{" "}
                  <span className="font-semibold text-ink">
                    {aiOutlookLabel}
                  </span>
                </p>
                <p>
                  Action if you press sync: <span className="font-semibold text-ink">{syncActionPreview}</span>
                </p>
                <p className="mt-2 text-xs text-ink/55">
                  Sync uses this rule: buy when the weekly strategy is BUY/HOLD or when AI is bullish above {AI_SYNC_ENTRY_THRESHOLD}% confidence.
                  Close the open position when the weekly strategy turns CASH.
                </p>
              </div>

              <label className="block text-sm text-ink/75">
                <span className="mb-2 block font-medium">Manual Trade Quantity</span>
                <input
                  value={tradeQuantity}
                  onChange={(event) => setTradeQuantity(event.target.value)}
                  className="w-full rounded-2xl border border-ink/10 bg-sage px-4 py-3 outline-none transition focus:border-leaf"
                  placeholder="0.01"
                />
                <span className="mt-2 block text-xs text-ink/50">Used only for manual Buy and Sell actions.</span>
              </label>

              <label className="block text-sm text-ink/75">
                <span className="mb-2 block font-medium">Strategy Quantity</span>
                <input
                  value={syncQuantityOverride}
                  onChange={(event) => setSyncQuantityOverride(event.target.value)}
                  className="w-full rounded-2xl border border-ink/10 bg-sage px-4 py-3 outline-none transition focus:border-leaf"
                  placeholder="Optional: 0.01"
                  inputMode="decimal"
                />
                <span className="mt-2 block text-xs text-ink/50">
                  Optional. If you fill this in, Sync Strategy will place the paper order using this quantity when the strategy turns bullish.
                </span>
              </label>

              <label className="block text-sm text-ink/75">
                <span className="mb-2 block font-medium">Note</span>
                <textarea
                  value={tradeNote}
                  onChange={(event) => setTradeNote(event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-ink/10 bg-sage px-4 py-3 outline-none transition focus:border-leaf"
                  placeholder="Optional note for this paper trade"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => void handleManualPaperTrade("BUY")}
                  disabled={loading || actionLoading}
                  className="rounded-full bg-[linear-gradient(135deg,#0f8a71,#12a48a)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(15,138,113,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Buy
                </button>
                <button
                  onClick={() => void handleManualPaperTrade("SELL")}
                  disabled={loading || actionLoading}
                  className="rounded-full border border-ruby/30 bg-[linear-gradient(135deg,rgba(254,242,242,0.96),rgba(254,226,226,0.92))] px-4 py-3 text-sm font-semibold text-ruby transition hover:-translate-y-0.5 hover:border-ruby/55 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Sell
                </button>
                <button
                  onClick={() => void handleManualPaperTrade("CLOSE")}
                  disabled={loading || actionLoading}
                  className="rounded-full border border-ink/12 bg-sage/92 px-4 py-3 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-leaf hover:text-leaf disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Close Position
                </button>
                <button
                  onClick={() => void handleSyncPaperTrading()}
                  disabled={loading || actionLoading}
                  className="rounded-full bg-[linear-gradient(135deg,#dc2626,#ef4444)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(220,38,38,0.26)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Sync Strategy
                </button>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Chart Inspector" subtitle="Crosshair values, candle structure, and live indicator overlays.">
            <ChartInspectorPanel inspection={chartInspection} />
          </Panel>

          <Panel title="Market Pulse" subtitle="The right rail gives a fast read on the current symbol.">
            {summary ? (
              <div className="grid gap-3 text-sm text-ink/75 sm:grid-cols-2 xl:grid-cols-2">
                <div className="rounded-2xl bg-sage/70 p-4">
                  <p className="font-semibold text-ink">Bid</p>
                  <p className="mt-1 text-lg font-display text-ink">{formatRupees(summary.market.bid_price)}</p>
                </div>
                <div className="rounded-2xl bg-sage/70 p-4">
                  <p className="font-semibold text-ink">Ask</p>
                  <p className="mt-1 text-lg font-display text-ink">{formatRupees(summary.market.ask_price)}</p>
                </div>
                <div className="rounded-2xl bg-sage/70 p-4">
                  <p className="font-semibold text-ink">Session High</p>
                  <p className="mt-1 text-lg font-display text-ink">{formatRupees(summary.market.high_price)}</p>
                </div>
                <div className="rounded-2xl bg-sage/70 p-4">
                  <p className="font-semibold text-ink">Session Low</p>
                  <p className="mt-1 text-lg font-display text-ink">{formatRupees(summary.market.low_price)}</p>
                </div>
                <div className="rounded-2xl bg-sage/70 p-4">
                  <p className="font-semibold text-ink">Base Volume</p>
                  <p className="mt-1 text-lg font-display text-ink">{summary.market.volume.toFixed(2)}</p>
                </div>
                <div className="rounded-2xl bg-sage/70 p-4">
                  <p className="font-semibold text-ink">Quote Volume</p>
                  <p className="mt-1 text-lg font-display text-ink">{formatRupees(summary.market.quote_volume, 0)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink/70">Market stats are loading.</p>
            )}
          </Panel>

          <Panel title="Action Feed" subtitle="Recent confirmations, sync results, and paper-trading events.">
            {actionFeed.length === 0 ? (
              <p className="text-sm text-ink/70">Your recent trade confirmations and sync results will appear here.</p>
            ) : (
              <div className="space-y-3">
                {actionFeed.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-ink/10 bg-sage/70 p-4">
                    <p className="text-sm font-semibold text-ink">{entry.message}</p>
                    <p className="mt-1 text-xs text-ink/50">{formatIndianDateTime(entry.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

        </div>
      </section>

      {summary ? (
        <>
          <section className="mt-6">
            <Panel title="AI Market Outlook" subtitle="Explainable prediction built from technicals, sentiment proxy, whale-style flow, and risk regime.">
              <AIPredictionPanel outlook={summary.ai_outlook} />
            </Panel>
          </section>

          <section className="mt-6">
            <Panel title="Paper Positions" subtitle="Positions stored after paper-trading actions and sync runs.">
              <PositionsTable positions={summary.positions} />
            </Panel>
          </section>

          <section className="mt-6">
            <Panel title="Paper Trade History" subtitle="Trade records generated by manual paper trades and sync.">
              <TradesTable trades={summary.trades} />
            </Panel>
          </section>

          <section className="mt-6">
            <Panel title="Alerts" subtitle="Weekly signal notifications and paper-trading activity.">
              <AlertsList alerts={summary.alerts} />
            </Panel>
          </section>
        </>
      ) : (
        <section className="mt-6 rounded-xl2 border border-leaf/30 bg-sage/75 p-8 text-sm text-ink/70 shadow-soft">
          {loading ? "Loading terminal..." : "No dashboard data is available yet."}
        </section>
      )}
    </main>
  );
}

function buildSyncDecisionPreview(
  summary: DashboardResponse,
  symbol: string,
  strategy: DashboardQuery["strategy"],
  quantity: number | undefined,
  price: number,
  cashPerTrade: number,
): string {
  const openPosition = summary.positions.find((position) => position.symbol === symbol && position.strategy_name === strategy && position.status === "OPEN");
  const suggestedQuantity = quantity && Number.isFinite(quantity) ? quantity : price > 0 ? cashPerTrade / price : 0;
  const action = describeSyncAction(summary, symbol, strategy, suggestedQuantity, openPosition ?? null);
  return [
    `Execution Signal: ${summary.backtest.latest_signal}`,
    `AI Outlook: ${summary.ai_outlook.direction} ${summary.ai_outlook.confidence_pct.toFixed(1)}%`,
    `Action If You Press Sync: ${action}`,
  ].join("\n");
}

function describeSyncAction(
  summary: DashboardResponse,
  symbol: string,
  strategy: DashboardQuery["strategy"],
  quantity: number,
  currentPosition: DashboardResponse["positions"][number] | null,
): string {
  const aiAllowsEntry = summary.ai_outlook.direction === "bullish" && summary.ai_outlook.confidence_pct >= AI_SYNC_ENTRY_THRESHOLD;
  const normalizedQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity.toFixed(4).replace(/\.?0+$/, "") : "calculated size";

  if (summary.backtest.latest_signal === "CASH" && currentPosition) {
    return `Close the open ${symbol} position because the weekly strategy turned CASH`;
  }

  if (!currentPosition && (summary.backtest.latest_signal === "BUY" || aiAllowsEntry)) {
    if (summary.backtest.latest_signal === "BUY" && aiAllowsEntry) {
      return `Buy ${normalizedQuantity} of ${symbol} because both execution and AI are bullish`;
    }
    if (summary.backtest.latest_signal === "BUY") {
      return `Buy ${normalizedQuantity} of ${symbol} because the execution signal is BUY`;
    }
    return `Buy ${normalizedQuantity} of ${symbol} because AI bullish confidence is above ${AI_SYNC_ENTRY_THRESHOLD}%`;
  }

  if (currentPosition) {
    return `Hold the current ${symbol} position. No new sync order will be placed`;
  }

  return `No new paper trade. The current rules do not allow a sync entry yet`;
}
