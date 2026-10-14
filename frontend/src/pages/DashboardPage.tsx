import { useEffect, useState } from "react";

import { AIPredictionPanel } from "../components/AIPredictionPanel";
import { AlertsList } from "../components/AlertsList";
import { ChartInspectorPanel } from "../components/ChartInspectorPanel";
import { EquityCurveChart } from "../components/EquityCurveChart";
import { LiveCandlestickChart, type ChartInspection, type ChartStreamStatus } from "../components/LiveCandlestickChart";
import { MarketMicrostructurePanel } from "../components/MarketMicrostructurePanel";
import { Panel } from "../components/Panel";
import { RiskAnalysisPanel } from "../components/RiskAnalysisPanel";
import { SystemHealthPanel } from "../components/SystemHealthPanel";
import { WatchlistPanel } from "../components/WatchlistPanel";
import { formatIndianDateTime, formatMarketPrice, formatRupees } from "../utils/format";
import {
  executeManualPaperTrade,
  fetchAssetSearch,
  fetchCandles,
  fetchDashboardSummary,
  fetchMarketOverview,
  fetchMarketSession,
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
  MarketSession,
  WatchlistItem,
} from "../types/trading";
import type { TerminalSection } from "../types/navigation";

const CHART_INTERVALS: MarketInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
const AI_REFRESH_MS = 300000;
const AI_SYNC_ENTRY_THRESHOLD = 80;
const PRACTICE_STRESS_MOVE_PCT = 2;
const DASHBOARD_SETTINGS_STORAGE_KEY = "trading-platform-dashboard-settings";

function estimatePracticeLoss(quantity: number, price: number): number {
  return Math.round(Math.max(quantity, 0) * Math.max(price, 0) * PRACTICE_STRESS_MOVE_PCT) / 100;
}

function formatPracticeAmount(symbol: string, amount: number): string {
  if (symbol.endsWith(".NS") || symbol.endsWith(".BO")) return formatRupees(amount);
  const quoteCurrency = ["USDT", "USDC", "BTC", "ETH"].find((currency) => symbol.endsWith(currency)) ?? "quote units";
  return `${quoteCurrency} ${amount.toFixed(2)}`;
}

function buildPracticeTradeReview(symbol: string, pnl: number, riskBudget: number, positionStatus: string): string {
  const exitDescription = positionStatus === "CLOSED" ? "You closed the practice position" : "You reduced the practice position";
  if (pnl < 0) {
    const loss = Math.abs(pnl);
    const budgetResult = loss > riskBudget ? "This is above" : "This is within";
    return `${exitDescription} with a simulated loss of ${formatPracticeAmount(symbol, loss)}. ${budgetResult} your ${formatPracticeAmount(symbol, riskBudget)} practice budget. Remember: the 2% scenario is an estimate, not a guaranteed loss limit.`;
  }
  if (pnl > 0) {
    return `${exitDescription} with a simulated gain of ${formatPracticeAmount(symbol, pnl)}. Review whether you followed your plan too; one profitable result alone does not prove a strategy works.`;
  }
  return `${exitDescription} close to break-even. Review whether you followed your plan before deciding what to practice next.`;
}

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
  maxPracticeLoss: string;
}

function loadPersistedDashboardSettings(): PersistedDashboardSettings {
  if (typeof window === "undefined") {
    return {
      filters: initialFilters,
      chartInterval: "1m",
      tradeQuantity: "0.01",
      syncQuantityOverride: "",
      maxPracticeLoss: "500",
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
        maxPracticeLoss: "500",
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
      maxPracticeLoss: parsed.maxPracticeLoss ?? "500",
    };
  } catch {
    return {
      filters: initialFilters,
      chartInterval: "1m",
      tradeQuantity: "0.01",
      syncQuantityOverride: "",
      maxPracticeLoss: "500",
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
  section: Exclude<TerminalSection, "portfolio">;
  onNavigate: (section: TerminalSection) => void;
}

export function DashboardPage({ section, onNavigate }: DashboardPageProps) {
  const persistedSettings = loadPersistedDashboardSettings();
  const [filters, setFilters] = useState<DashboardQuery>(persistedSettings.filters);
  const [chartInterval, setChartInterval] = useState<MarketInterval>(persistedSettings.chartInterval);
  const [summary, setSummary] = useState<DashboardResponse | null>(null);
  const [marketSession, setMarketSession] = useState<MarketSession | null>(null);
  const [marketSessionError, setMarketSessionError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [chartInspection, setChartInspection] = useState<ChartInspection | null>(null);
  const [chartStreamStatus, setChartStreamStatus] = useState<ChartStreamStatus>("CONNECTING");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AssetSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [tradeQuantity, setTradeQuantity] = useState(persistedSettings.tradeQuantity);
  const [syncQuantityOverride, setSyncQuantityOverride] = useState(persistedSettings.syncQuantityOverride);
  const [maxPracticeLoss, setMaxPracticeLoss] = useState(persistedSettings.maxPracticeLoss);
  const [tradeReview, setTradeReview] = useState<string | null>(null);
  const [tradeNote, setTradeNote] = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
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
    const timeoutIds = actionFeed.map((entry) => {
      const elapsed = Date.now() - Date.parse(entry.createdAt);
      const remaining = Math.max(0, 10_000 - elapsed);
      return window.setTimeout(() => {
        setActionFeed((current) => current.filter((item) => item.id !== entry.id));
      }, remaining);
    });

    return () => timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, [actionFeed]);

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => setMessage(null), 10_000);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [dashboard, watchlistItems] = await Promise.all([
          fetchDashboardSummary(persistedSettings.filters),
          fetchWatchlist().catch(() => {
            setError("Watchlist data is temporarily unavailable; market analysis remains available.");
            return [];
          }),
        ]);

        setSummary(dashboard);
        setWatchlist(watchlistItems);
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
        maxPracticeLoss,
      } satisfies PersistedDashboardSettings),
    );
  }, [filters, chartInterval, tradeQuantity, syncQuantityOverride, maxPracticeLoss]);

  useEffect(() => {
    let cancelled = false;
    setMarketSession(null);
    setMarketSessionError(null);

    fetchMarketSession(filters.symbol)
      .then((session) => {
        if (!cancelled) setMarketSession(session);
      })
      .catch((sessionError: unknown) => {
        if (!cancelled) {
          setMarketSessionError(sessionError instanceof Error ? sessionError.message : "Market session is unavailable.");
        }
      });

    return () => { cancelled = true; };
  }, [filters.symbol]);

  useEffect(() => {
    if (!summary || !filters.symbol.includes(".")) {
      return undefined;
    }

    const refreshEquityQuote = () => void refreshMarketOverview(filters.symbol);
    const intervalId = window.setInterval(refreshEquityQuote, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [filters.symbol, Boolean(summary)]);

  useEffect(() => {
    if (section !== "markets") {
      setChartStreamStatus("NOT_ACTIVE");
      return undefined;
    }

    let cancelled = false;
    setCandles([]);
    setChartLoading(true);
    fetchCandles(filters.symbol, chartInterval, 320)
      .then((chartCandles) => {
        if (!cancelled) setCandles(chartCandles);
      })
      .catch((chartError: unknown) => {
        if (!cancelled) setError(chartError instanceof Error ? chartError.message : "Unable to load chart candles.");
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });

    return () => { cancelled = true; };
  }, [section, filters.symbol, chartInterval]);

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
      void refreshAnalysis(filters).catch(() => {
        setError("Latest analysis refresh failed. The last successful snapshot is still displayed.");
      });
    }, AI_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [filters, Boolean(summary)]);
  const displayedPrice = livePrice ?? summary?.market.last_price ?? 0;

  async function refreshMarketOverview(symbol: string) {
    try {
      const overview = await fetchMarketOverview(symbol);

      setSummary((currentSummary) =>
        currentSummary
          ? {
              ...currentSummary,
              market: overview,
            }
          : currentSummary,
      );
      setLivePrice(overview.last_price);
    } catch {
      // Keep the UI responsive even if one live refresh fails.
    }
  }

  async function refreshAnalysis(nextFilters: DashboardQuery) {
    const dashboard = await fetchDashboardSummary(nextFilters);
    const watchlistItems = await fetchWatchlist().catch(() => null);
    setSummary(dashboard);
    if (watchlistItems) {
      setWatchlist(watchlistItems);
      setError(null);
    } else {
      setError("Watchlist refresh failed; showing the last available list and current analysis.");
    }
  }

  async function refreshDashboard(nextFilters: DashboardQuery) {
    setError(null);
    const dashboard = await fetchDashboardSummary(nextFilters);

    setSummary(dashboard);
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
      await refreshDashboard(nextFilters);
      pushActionFeed(`Loaded ${symbol} into the terminal.`, "info");
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Unable to switch symbols.");
      pushActionFeed(selectionError instanceof Error ? selectionError.message : "Unable to switch symbols.", "error");
    } finally {
      setActionLoading(false);
    }
  }

  function handleChangeChartInterval(interval: MarketInterval) {
    setChartInterval(interval);
  }

  async function handleManualPaperTrade(action: ManualTradeAction) {
    const parsedQuantity = Number(tradeQuantity);
    if (action !== "CLOSE" && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)) {
      setError("Enter a valid quantity before placing a paper trade.");
      pushActionFeed("Enter a valid quantity before placing a paper trade.", "error");
      return;
    }

    const riskBudget = Number(maxPracticeLoss);
    if (!Number.isFinite(riskBudget) || riskBudget <= 0) {
      setError("Enter a practice loss budget greater than zero.");
      return;
    }

    let buyScenarioEstimate: number | null = null;
    if (action === "BUY") {
      const existingPosition = summary?.positions.find(
        (position) => position.symbol === filters.symbol && position.strategy_name === filters.strategy && position.status === "OPEN",
      );
      const existingQuantity = existingPosition?.quantity ?? 0;
      const projectedQuantity = existingQuantity + parsedQuantity;
      const projectedCost = existingQuantity * (existingPosition?.entry_price ?? 0) + parsedQuantity * displayedPrice;
      const averageEntryPrice = projectedQuantity > 0 ? projectedCost / projectedQuantity : displayedPrice;
      buyScenarioEstimate = estimatePracticeLoss(projectedQuantity, averageEntryPrice);

      if (buyScenarioEstimate > riskBudget) {
        const warning = `This practice buy is blocked: a ${PRACTICE_STRESS_MOVE_PCT}% price drop could mean about ${formatPracticeAmount(filters.symbol, buyScenarioEstimate)} loss, above your ${formatPracticeAmount(filters.symbol, riskBudget)} limit. Reduce the amount or change your limit.`;
        setError(warning);
        pushActionFeed(warning, "error");
        return;
      }
    }

    const confirmationMessage = [
      action === "CLOSE" ? `Close the full paper position for ${filters.symbol}?` : `${action} ${parsedQuantity} of ${filters.symbol} in paper trading?`,
      `Strategy: ${filters.strategy}`,
      buyScenarioEstimate === null
        ? null
        : `2% price-drop scenario: about ${formatPracticeAmount(filters.symbol, buyScenarioEstimate)} simulated loss. Your practice limit is ${formatPracticeAmount(filters.symbol, riskBudget)}.`,
      "This is a scenario estimate, not a stop-loss or a guarantee of maximum loss.",
      tradeNote.trim() ? `Note: ${tradeNote.trim()}` : "Note: none",
    ].filter(Boolean).join("\n");

    if (!window.confirm(confirmationMessage)) {
      pushActionFeed(`Cancelled manual ${action} for ${filters.symbol}.`, "info");
      return;
    }

    setActionLoading(true);
    setMessage(null);
    setError(null);
    setTradeReview(null);

    try {
      const response = await executeManualPaperTrade({
        symbol: filters.symbol,
        strategy: filters.strategy,
        action,
        quantity: action === "CLOSE" ? undefined : parsedQuantity,
        risk_budget_amount: riskBudget,
        note: tradeNote.trim() || undefined,
      });
      await refreshDashboard(filters);
      setMessage(response.action_summary);
      pushActionFeed(response.action_summary, "success");
      if (response.trade.side === "SELL" && response.trade.pnl !== null && response.trade.pnl !== undefined) {
        setTradeReview(buildPracticeTradeReview(
          filters.symbol,
          response.trade.pnl,
          response.position?.risk_budget_amount ?? riskBudget,
          response.position?.status ?? "OPEN",
        ));
      }
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

    const riskBudget = Number(maxPracticeLoss);
    if (!Number.isFinite(riskBudget) || riskBudget <= 0) {
      setError("Enter a practice loss budget greater than zero.");
      return;
    }

    const wouldOpenPosition = Boolean(
      summary && !currentPosition && (
        summary.backtest.latest_signal === "BUY" ||
        (summary.ai_outlook.direction === "bullish" && summary.ai_outlook.confidence_pct >= AI_SYNC_ENTRY_THRESHOLD)
      ),
    );
    const syncPrice = livePrice ?? summary?.market.last_price ?? 0;
    const syncQuantity = parsedSyncQuantity ?? (syncPrice > 0 ? filters.cash_per_trade / syncPrice : 0);
    const syncScenarioEstimate = wouldOpenPosition ? estimatePracticeLoss(syncQuantity, syncPrice) : null;
    if (syncScenarioEstimate !== null && syncScenarioEstimate > riskBudget) {
      const warning = `Sync is blocked: the suggested practice buy has a 2% price-drop scenario of about ${formatPracticeAmount(filters.symbol, syncScenarioEstimate)}, above your ${formatPracticeAmount(filters.symbol, riskBudget)} limit. Reduce the strategy amount or change your limit.`;
      setError(warning);
      pushActionFeed(warning, "error");
      return;
    }

    const syncDecisionPreview = summary
      ? buildSyncDecisionPreview(summary, filters.symbol, filters.strategy, parsedSyncQuantity, livePrice ?? summary.market.last_price, filters.cash_per_trade)
      : "Checking live sync rules...";
    const riskPreview = syncScenarioEstimate === null
      ? ""
      : `\n2% price-drop scenario: about ${formatPracticeAmount(filters.symbol, syncScenarioEstimate)} simulated loss. Your practice limit is ${formatPracticeAmount(filters.symbol, riskBudget)}.`;
    if (!window.confirm(`Sync paper trading for ${filters.symbol}?\n\n${syncDecisionPreview}${riskPreview}\n\nThis is a scenario estimate, not a stop-loss or a guarantee of maximum loss.`)) {
      pushActionFeed(`Cancelled sync for ${filters.symbol}.`, "info");
      return;
    }

    setActionLoading(true);
    setMessage(null);
    setError(null);
    setTradeReview(null);

    try {
      const previousTradeIds = new Set((summary?.trades ?? []).map((trade) => trade.id));
      const response = await syncPaperTrading({
        symbols: [filters.symbol],
        strategy: filters.strategy,
        initial_cash: filters.initial_cash,
        cash_per_trade: filters.cash_per_trade,
        quantity: parsedSyncQuantity,
        risk_budget_amount: riskBudget,
        ai_entry_threshold_pct: AI_SYNC_ENTRY_THRESHOLD,
        lookback_weeks: filters.weeks,
      });
      await refreshDashboard(filters);
      const syncMessage = response.executed_actions.join(" | ");
      setMessage(syncMessage);
      pushActionFeed(syncMessage, "success");
      const newExitTrade = response.trades.find(
        (trade) => trade.symbol === filters.symbol && trade.side === "SELL" && !previousTradeIds.has(trade.id) && trade.pnl !== null && trade.pnl !== undefined,
      );
      if (newExitTrade?.pnl !== null && newExitTrade?.pnl !== undefined) {
        const exitedPosition = response.positions.find((position) => position.id === newExitTrade.position_id);
        setTradeReview(buildPracticeTradeReview(
          filters.symbol,
          newExitTrade.pnl,
          exitedPosition?.risk_budget_amount ?? riskBudget,
          exitedPosition?.status ?? "CLOSED",
        ));
      }
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
  const requiresExchangeSession = filters.symbol.endsWith(".NS") || filters.symbol.endsWith(".BO");
  const exchangeTradeUnavailable = requiresExchangeSession && marketSession?.is_open !== true;
  const tradeActionsDisabled = loading || actionLoading || exchangeTradeUnavailable;
  const manualQuantityNumber = Number(tradeQuantity);
  const projectedQuantity = (currentPosition?.quantity ?? 0) + (Number.isFinite(manualQuantityNumber) ? manualQuantityNumber : 0);
  const projectedCost = (currentPosition?.quantity ?? 0) * (currentPosition?.entry_price ?? 0) + (Number.isFinite(manualQuantityNumber) ? manualQuantityNumber : 0) * displayedPrice;
  const projectedAveragePrice = projectedQuantity > 0 ? projectedCost / projectedQuantity : displayedPrice;
  const manualScenarioEstimate = estimatePracticeLoss(projectedQuantity, projectedAveragePrice);
  const riskBudgetNumber = Number(maxPracticeLoss);
  const todayOpportunityCandidates = (watchlist.length ? [...watchlist] : [])
    .sort((a, b) => Math.abs(b.price_change_percent) - Math.abs(a.price_change_percent))
    .slice(0, 4)
    .map((item) => {
      const changeValue = Number(item.price_change_percent ?? 0);
      const signalBias = changeValue >= 0 ? "Bullish" : "Cautious";
      const rationale = changeValue >= 0
        ? "Momentum is constructive and the move remains supported."
        : "Trend is softer, so wait for confirmation before sizing up.";
      return {
        symbol: item.symbol,
        market: item.market,
        price: item.last_price,
        change: changeValue,
        bias: signalBias,
        rationale,
      };
    });

  if (section !== "markets") {
    const sectionTitle: Record<Exclude<TerminalSection, "markets" | "portfolio">, string> = {
      overview: "Overview",
      ai: "AI Intelligence",
      risk: "Risk",
      alerts: "Alerts",
      system: "System",
    };
    const sectionDescriptions: Record<Exclude<TerminalSection, "markets" | "portfolio">, string> = {
      overview: "A concise read on the selected market, model, and items that may need attention.",
      ai: "The trained weekly model, its explanation, and historical validation for the selected asset.",
      risk: "Market-risk and anomaly heuristics, quote conditions, and model-reported risk factors.",
      alerts: "Persisted paper-trading and strategy events for the selected asset.",
      system: "Observed API, model, database, and browser chart connection health.",
    };
    const activeSection = section as Exclude<TerminalSection, "markets" | "portfolio">;

    return (
      <main className="mx-auto min-h-[calc(100vh-72px)] max-w-[1480px] px-4 py-7 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-leaf">Trading Terminal</p>
            <h1 className="mt-2 font-display text-3xl text-ink">{sectionTitle[activeSection]}</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink/60">{sectionDescriptions[activeSection]}</p>
          </div>
          <div className="rounded-xl border border-ink/10 bg-white/65 px-4 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">Selected market</p>
            <p className="mt-1 text-sm font-semibold text-ink">{filters.symbol}</p>
          </div>
        </div>

        {error ? <p role="alert" className="mb-4 rounded-xl border border-ruby/20 bg-ruby/5 px-4 py-3 text-sm text-ruby-700">{error}</p> : null}
        {message ? <p role="status" className="mb-4 rounded-xl border border-leaf/20 bg-leaf/5 px-4 py-3 text-sm text-leaf-700">{message}</p> : null}

        {activeSection === "overview" ? (
          summary ? (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <button onClick={() => onNavigate("markets")} className="rounded-2xl border border-ink/10 bg-white/75 p-5 text-left shadow-soft transition hover:border-leaf/45">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">{summary.market.market} · {filters.symbol}</p>
                  <p className="mt-3 font-display text-3xl text-ink">{formatMarketPrice(livePrice ?? summary.market.last_price, filters.symbol)}</p>
                  <p className={`mt-2 text-sm font-semibold ${summary.market.price_change_percent >= 0 ? "text-leaf-700" : "text-ruby-700"}`}>
                    {summary.market.price_change_percent >= 0 ? "+" : ""}{summary.market.price_change_percent.toFixed(2)}% · Open market view
                  </p>
                </button>
                <button onClick={() => onNavigate("ai")} className="rounded-2xl border border-ink/10 bg-white/75 p-5 text-left shadow-soft transition hover:border-leaf/45">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">AI outlook · {summary.ai_outlook.horizon}</p>
                  <p className="mt-3 font-display text-3xl capitalize text-ink">{summary.ai_outlook.direction}</p>
                  <p className="mt-2 text-sm text-ink/60">{summary.ai_outlook.confidence_pct.toFixed(1)}% confidence · View analysis</p>
                </button>
                <button onClick={() => onNavigate("risk")} className="rounded-2xl border border-ink/10 bg-white/75 p-5 text-left shadow-soft transition hover:border-leaf/45">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">Risk proxy</p>
                  <p className="mt-3 font-display text-3xl text-ink">{summary.monitoring.market_snapshot.risk_level}</p>
                  <p className="mt-2 text-sm text-ink/60">Anomaly: {summary.monitoring.market_snapshot.anomaly_status} · View risk</p>
                </button>
                <button onClick={() => onNavigate("system")} className="rounded-2xl border border-ink/10 bg-white/75 p-5 text-left shadow-soft transition hover:border-leaf/45">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">System status</p>
                  <p className="mt-3 font-display text-3xl text-ink">{summary.monitoring.system_health.health_status}</p>
                  <p className="mt-2 text-sm text-ink/60">Backend {summary.monitoring.system_health.latency_ms} ms · View system</p>
                </button>
              </section>
              <section className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
                <Panel title="Today's Opportunity Watchlist" subtitle="Stocks the system is currently favoring based on the active market read and directional bias.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {todayOpportunityCandidates.length ? todayOpportunityCandidates.map((candidate) => (
                      <button
                        key={candidate.symbol}
                        type="button"
                        onClick={() => void handleSelectWatchlistSymbol(candidate.symbol)}
                        className="rounded-2xl border border-ink/10 bg-white/70 p-4 text-left transition hover:border-leaf/45 hover:bg-sage/60"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-ink">{candidate.symbol}</span>
                          <span className={`text-xs font-semibold ${candidate.change >= 0 ? "text-leaf-700" : "text-ruby-700"}`}>
                            {candidate.change >= 0 ? "+" : ""}{candidate.change.toFixed(2)}%
                          </span>
                        </div>
                        <p className="mt-2 text-xs uppercase tracking-[0.14em] text-ink/45">{candidate.market}</p>
                        <p className="mt-3 text-2xl font-display text-ink">{formatRupees(candidate.price)}</p>
                        <p className="mt-2 text-sm font-medium text-ink/70">{candidate.bias}</p>
                        <p className="mt-1 text-xs leading-5 text-ink/55">{candidate.rationale}</p>
                      </button>
                    )) : (
                      <p className="text-sm text-ink/60">No opportunity list is available yet. Try refreshing market data.</p>
                    )}
                  </div>
                </Panel>
                <Panel title="Weekly strategy" subtitle={`${summary.backtest.strategy_label} · historical backtest, not a live execution instruction`}>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <SummaryMetric label="Latest signal" value={summary.backtest.latest_signal} />
                    <SummaryMetric label="Historical return" value={`${summary.backtest.metrics.total_return_pct >= 0 ? "+" : ""}${summary.backtest.metrics.total_return_pct.toFixed(1)}%`} />
                    <SummaryMetric label="Max drawdown" value={`${summary.backtest.metrics.max_drawdown_pct.toFixed(1)}%`} />
                  </div>
                  <button onClick={() => onNavigate("ai")} className="mt-3 text-xs font-semibold text-leaf-700 hover:underline">Open strategy and AI analysis →</button>
                </Panel>
              </section>
            </>
          ) : <DataState loading={loading} error={error} />
        ) : null}

        {activeSection === "ai" ? (
          summary ? (
            <div className="space-y-5">
              <Panel title="AI Market Outlook" subtitle="Explainable prediction built from historical price and volume features for the stated horizon.">
                <AIPredictionPanel outlook={summary.ai_outlook} />
              </Panel>
              <Panel title="Weekly Strategy Backtest" subtitle={`${summary.backtest.strategy_label} · historical simulation from closed weekly bars`}>
                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryMetric label="Latest signal" value={summary.backtest.latest_signal} />
                  <SummaryMetric label="Total return" value={`${summary.backtest.metrics.total_return_pct.toFixed(2)}%`} />
                  <SummaryMetric label="Win rate" value={`${summary.backtest.metrics.win_rate_pct.toFixed(1)}%`} />
                  <SummaryMetric label="Trades" value={String(summary.backtest.metrics.trade_count)} />
                </div>
                {summary.backtest.equity_curve.length ? <EquityCurveChart data={summary.backtest.equity_curve} /> : <p className="text-sm text-ink/55">No backtest equity history is available.</p>}
              </Panel>
            </div>
          ) : <DataState loading={loading} error={error} />
        ) : null}

        {activeSection === "risk" ? (summary ? <RiskAnalysisPanel market={summary.market} outlook={summary.ai_outlook} monitoring={summary.monitoring} /> : <DataState loading={loading} error={error} />) : null}
        {activeSection === "alerts" ? (
          <Panel title="Recent Alerts" subtitle="Persisted strategy and paper-trading events from the backend.">
            {summary ? <AlertsList alerts={summary.alerts} /> : <DataState loading={loading} error={error} />}
          </Panel>
        ) : null}
        {activeSection === "system" ? (summary ? <SystemHealthPanel health={summary.monitoring.system_health} streamStatus={chartStreamStatus} /> : <DataState loading={loading} error={error} />) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      {actionFeed.slice(0, 3).length > 0 ? (
        <div role="region" aria-label="Notifications" aria-live="polite" className="fixed right-4 top-4 z-[100] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3">
          {actionFeed.slice(0, 3).map((entry) => (
            <div
              key={entry.id}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-soft backdrop-blur ${
                entry.tone === "success"
                  ? "border-leaf/50 bg-sage/95 text-leaf"
                  : entry.tone === "error"
                    ? "border-ruby/50 bg-red-50/95 text-ruby"
                    : "border-ink/10 bg-sage/95 text-ink"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{entry.message}</p>
                <p className="mt-1 text-xs opacity-70">{formatIndianDateTime(entry.createdAt)}</p>
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                title="Dismiss notification"
                onClick={() => setActionFeed((current) => current.filter((item) => item.id !== entry.id))}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg leading-none opacity-70 transition hover:bg-black/5 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Markets &amp; Practice Trades</h1>
          <p className="mt-1 text-sm text-ink/55">Choose a stock or crypto, check its price, then try a trade with simulated money.</p>
        </div>
        <button onClick={() => onNavigate("portfolio")} className="rounded-xl border border-ink/10 bg-white/75 px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-leaf/45">
          Open Portfolio
        </button>
      </div>

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
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ink/50">Latest Price</p>
                <p role={marketSessionError ? "alert" : "status"} className={`mt-1 text-xs font-medium ${marketSession?.is_open === false ? "text-ruby-700" : marketSessionError ? "text-ruby-700" : "text-leaf-700"}`}>
                  {marketSession
                    ? marketSession.is_open
                      ? `${marketSession.market} open${marketSession.asset_class === "crypto" ? " · 24/7" : ""}`
                      : `${marketSession.market} closed${marketSession.next_open ? ` · Opens ${formatIndianDateTime(marketSession.next_open)}` : ""}`
                    : marketSessionError
                      ? "Market session unavailable; equity trades are disabled."
                      : "Checking market hours…"}
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <p className="font-display text-4xl text-ink">{formatMarketPrice(displayedPrice, filters.symbol)}</p>
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

            {candles.length > 0 ? (
              <LiveCandlestickChart
                symbol={filters.symbol}
                interval={chartInterval}
                candles={candles}
                onLivePrice={setLivePrice}
                onInspectChange={setChartInspection}
                onStreamStatus={setChartStreamStatus}
              />
            ) : (
              <div role={chartLoading ? "status" : "alert"} className="grid h-[470px] place-items-center rounded-2xl border border-ink/8 bg-white/45 px-5 text-center text-sm text-ink/55">
                {chartLoading ? "Loading chart history…" : error ? `Chart data unavailable: ${error}` : "No chart candles are available for this symbol and interval."}
              </div>
            )}

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
              <p>Each candle shows how the price moved during the selected time. Hover over the chart to inspect it.</p>
            </div>
          </Panel>

          <MarketMicrostructurePanel symbol={filters.symbol} />

          <Panel title="Practice a Trade" subtitle="Practice only: this app does not send orders to a broker or use real money.">
            <div className="space-y-4">
              {tradeReview ? (
                <div role="status" className="flex items-start gap-3 rounded-xl border border-leaf/25 bg-white/80 p-4 text-sm text-ink/75">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">Practice trade review</p>
                    <p className="mt-1 leading-5">{tradeReview}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss trade review"
                    onClick={() => setTradeReview(null)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg leading-none opacity-70 hover:bg-black/5 hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ) : null}

              <div className="rounded-2xl border border-ink/10 bg-sand/50 p-4 text-sm text-ink/70">
                <p className="font-semibold text-ink">What you are practicing with</p>
                <p className="mt-2">Asset: {filters.symbol}</p>
                <p>Market: {summary?.market.market ?? "Loading market…"}</p>
                <p>Practice rule: {filters.strategy.replace(/_/g, " ")}</p>
                <p className="mt-2 text-xs leading-5 text-ink/55">The price comes from the market feed. Your practice order is recorded only in this app.</p>
              </div>

              <div className="rounded-2xl border border-leaf/15 bg-sage/70 p-4 text-sm text-ink/70">
                <p className="font-semibold text-ink">Sync Trading</p>
                <p className="mt-2">
                  Strategy rule: <span className="font-semibold text-ink">{weeklySignal === "BUY" ? "Buy signal" : weeklySignal === "CASH" ? "No position signal" : weeklySignal}</span>
                </p>
                <p>
                  Computer estimate (not a promise):{" "}
                  <span className="font-semibold text-ink">
                    {aiOutlookLabel}
                  </span>
                </p>
                <p>
                  If you choose “Sync Trading”: <span className="font-semibold text-ink">{syncActionPreview}</span>
                </p>
                <p className="mt-2 text-xs text-ink/55">
                  This checks the weekly strategy and computer estimate. It may suggest a practice buy, hold, or close. You review the suggestion before it runs.
                </p>
              </div>

              <label className="block text-sm text-ink/75">
                <span className="mb-2 block font-medium">My practice loss limit ({filters.symbol.endsWith(".NS") || filters.symbol.endsWith(".BO") ? "INR" : "USDT"})</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={maxPracticeLoss}
                  onChange={(event) => setMaxPracticeLoss(event.target.value)}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-leaf"
                />
                <span className="mt-2 block text-xs leading-5 text-ink/55">
                  For the amount above, a {PRACTICE_STRESS_MOVE_PCT}% price drop would mean about {formatPracticeAmount(filters.symbol, manualScenarioEstimate)} simulated loss.
                  {Number.isFinite(riskBudgetNumber) && manualScenarioEstimate > riskBudgetNumber
                    ? " This is above your limit; reduce the amount before buying."
                    : " This scenario is not a stop-loss or a guarantee of maximum loss."}
                </span>
              </label>

              <label className="block text-sm text-ink/75">
                <span className="mb-2 block font-medium">How many shares or coins?</span>
                <input
                  value={tradeQuantity}
                  onChange={(event) => setTradeQuantity(event.target.value)}
                  className="w-full rounded-2xl border border-ink/10 bg-sage px-4 py-3 outline-none transition focus:border-leaf"
                  placeholder="0.01"
                />
                <span className="mt-2 block text-xs leading-5 text-ink/50">Choose an amount for Buy or Sell. For example, 1 means one share or one coin. This is only a practice order.</span>
              </label>

              <label className="block text-sm text-ink/75">
                <span className="mb-2 block font-medium">Amount for automatic practice idea (optional)</span>
                <input
                  value={syncQuantityOverride}
                  onChange={(event) => setSyncQuantityOverride(event.target.value)}
                  className="w-full rounded-2xl border border-ink/10 bg-sage px-4 py-3 outline-none transition focus:border-leaf"
                  placeholder="Optional: 0.01"
                  inputMode="decimal"
                />
                <span className="mt-2 block text-xs text-ink/50">
                  Leave empty to let the app estimate an amount from your practice settings, or enter the number of shares or coins to use if it suggests a buy.
                </span>
              </label>

              <label className="block text-sm text-ink/75">
                <span className="mb-2 block font-medium">Note</span>
                <textarea
                  value={tradeNote}
                  onChange={(event) => setTradeNote(event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-ink/10 bg-sage px-4 py-3 outline-none transition focus:border-leaf"
                  placeholder="Optional: why are you trying this trade?"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => void handleManualPaperTrade("BUY")}
                  disabled={tradeActionsDisabled}
                  className="rounded-full bg-[linear-gradient(135deg,#0f8a71,#12a48a)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(15,138,113,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Buy
                </button>
                <button
                  onClick={() => void handleManualPaperTrade("SELL")}
                  disabled={tradeActionsDisabled}
                  className="rounded-full border border-ruby/30 bg-[linear-gradient(135deg,rgba(254,242,242,0.96),rgba(254,226,226,0.92))] px-4 py-3 text-sm font-semibold text-ruby transition hover:-translate-y-0.5 hover:border-ruby/55 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Sell
                </button>
                <button
                  onClick={() => void handleManualPaperTrade("CLOSE")}
                  disabled={tradeActionsDisabled}
                  className="rounded-full border border-ink/12 bg-sage/92 px-4 py-3 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-leaf hover:text-leaf disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Close Position
                </button>
                <button
                  onClick={() => void handleSyncPaperTrading()}
                  disabled={tradeActionsDisabled}
                  className="rounded-full bg-[linear-gradient(135deg,#dc2626,#ef4444)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(220,38,38,0.26)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Sync Trading
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

        </div>
      </section>

      {!summary ? <DataState loading={loading} error={error} /> : null}
    </main>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink/8 bg-white/70 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/45">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

function DataState({ loading, error }: { loading: boolean; error: string | null }) {
  return (
    <div role={error ? "alert" : "status"} className="rounded-2xl border border-ink/10 bg-white/70 p-6 text-sm text-ink/65">
      {loading ? "Loading market and analysis data…" : error ? `Data unavailable: ${error}` : "No dashboard data is available yet."}
    </div>
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
