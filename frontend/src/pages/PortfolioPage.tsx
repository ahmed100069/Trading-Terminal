import { useEffect, useState } from "react";

import { MetricCard } from "../components/MetricCard";
import { Panel } from "../components/Panel";
import { TradesTable } from "../components/TradesTable";
import { fetchMarketOverview, fetchPaperPositions, fetchPaperTrades } from "../services/api";
import type { MarketOverview, PaperPosition, PaperTrade } from "../types/trading";
import { formatIndianDate, formatIndianDateTime, formatRupees } from "../utils/format";

interface PortfolioPageProps {
  onBack: () => void;
}

interface PortfolioLedgerRow {
  id: number;
  symbol: string;
  strategy: string;
  status: string;
  boughtOn: string;
  soldOn: string | null;
  entryQuantity: number;
  remainingQuantity: number;
  exitedQuantity: number;
  averageBuyPrice: number | null;
  averageSellPrice: number | null;
  currentPrice: number;
  entryValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  pnlPercent: number | null;
}

interface PortfolioFilters {
  symbol: string;
  strategy: string;
  status: "ALL" | "OPEN" | "CLOSED";
  profitability: "ALL" | "PROFIT" | "LOSS" | "FLAT";
}

const LIVE_REFRESH_MS = 8000;
const PORTFOLIO_FILTERS_STORAGE_KEY = "trading-platform-portfolio-filters";

function formatQuantity(quantity: number): string {
  return quantity.toFixed(6).replace(/\.?0+$/, "");
}

function formatShortDate(value: string | null): string {
  return value ? formatIndianDate(value) : "-";
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function loadPersistedPortfolioFilters(): PortfolioFilters {
  if (typeof window === "undefined") {
    return { symbol: "ALL", strategy: "ALL", status: "ALL", profitability: "ALL" };
  }

  try {
    const raw = window.localStorage.getItem(PORTFOLIO_FILTERS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<PortfolioFilters>) : {};
    return {
      symbol: parsed.symbol ?? "ALL",
      strategy: parsed.strategy ?? "ALL",
      status: parsed.status ?? "ALL",
      profitability: parsed.profitability ?? "ALL",
    };
  } catch {
    return { symbol: "ALL", strategy: "ALL", status: "ALL", profitability: "ALL" };
  }
}

function buildLedgerRows(positions: PaperPosition[], trades: PaperTrade[], livePrices: Record<string, number>): PortfolioLedgerRow[] {
  const tradesByPositionId = new Map<number, PaperTrade[]>();

  for (const trade of trades) {
    const existing = tradesByPositionId.get(trade.position_id) ?? [];
    existing.push(trade);
    tradesByPositionId.set(trade.position_id, existing);
  }

  return positions.map((position) => {
    const positionTrades = (tradesByPositionId.get(position.id) ?? []).slice().sort((left, right) => {
      const tradeDateDiff = new Date(left.trade_date).getTime() - new Date(right.trade_date).getTime();
      if (tradeDateDiff !== 0) {
        return tradeDateDiff;
      }

      return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    });
    const buyTrades = positionTrades.filter((trade) => trade.side === "BUY");
    const sellTrades = positionTrades.filter((trade) => trade.side === "SELL");
    const entryQuantity = buyTrades.reduce((sum, trade) => sum + trade.quantity, 0);
    const exitedQuantity = sellTrades.reduce((sum, trade) => sum + trade.quantity, 0);
    const remainingQuantity = Math.max(entryQuantity - exitedQuantity, 0);
    const buyValue = buyTrades.reduce((sum, trade) => sum + trade.quantity * trade.price, 0);
    const sellValue = sellTrades.reduce((sum, trade) => sum + trade.quantity * trade.price, 0);
    const averageBuyPrice = entryQuantity > 0 ? buyValue / entryQuantity : position.entry_price;
    const averageSellPrice = exitedQuantity > 0 ? sellValue / exitedQuantity : null;
    const currentPrice = position.status === "OPEN"
      ? (livePrices[position.symbol] ?? position.current_price)
      : (position.exit_price ?? averageSellPrice ?? position.current_price);
    const realizedPnl = sellTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
    const unrealizedPnl = position.status === "OPEN" && averageBuyPrice !== null ? (currentPrice - averageBuyPrice) * remainingQuantity : 0;
    const totalPnl = realizedPnl + unrealizedPnl;
    const costBasis = averageBuyPrice !== null ? averageBuyPrice * (exitedQuantity + remainingQuantity) : buyValue;
    const pnlPercent = costBasis > 0 ? (totalPnl / costBasis) * 100 : null;

    return {
      id: position.id,
      symbol: position.symbol,
      strategy: position.strategy_name,
      status: position.status,
      boughtOn: buyTrades[0]?.trade_date ?? position.entry_date,
      soldOn: sellTrades.length > 0 ? sellTrades[sellTrades.length - 1].trade_date : position.exit_date ?? null,
      entryQuantity,
      remainingQuantity,
      exitedQuantity,
      averageBuyPrice,
      averageSellPrice,
      currentPrice,
      entryValue: buyValue,
      realizedPnl,
      unrealizedPnl,
      totalPnl,
      pnlPercent,
    };
  }).sort((left, right) => new Date(right.boughtOn).getTime() - new Date(left.boughtOn).getTime());
}

export function PortfolioPage({ onBack }: PortfolioPageProps) {
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [priceTicks, setPriceTicks] = useState<Record<string, "up" | "down" | "flat">>({});
  const [filters, setFilters] = useState<PortfolioFilters>(loadPersistedPortfolioFilters);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);

  async function loadPortfolio(showLoader = false) {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [allPositions, allTrades] = await Promise.all([fetchPaperPositions(), fetchPaperTrades()]);
      setPositions(allPositions);
      setTrades(allTrades);
      setLastRefreshAt(new Date().toISOString());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load lifetime portfolio.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function refreshLivePrices(activeSymbols: string[]) {
    try {
      const overviews = await Promise.all(activeSymbols.map((symbol) => fetchMarketOverview(symbol).catch(() => null)));
      const nextPrices: Record<string, number> = {};
      overviews.forEach((overview: MarketOverview | null, index) => {
        if (overview) {
          nextPrices[activeSymbols[index]] = overview.last_price;
        }
      });

      setLivePrices((current) => {
        setPriceTicks((tickState) => {
          const nextTicks = { ...tickState };
          for (const [symbol, nextPrice] of Object.entries(nextPrices)) {
            const previousPrice = current[symbol];
            nextTicks[symbol] = previousPrice === undefined || previousPrice === nextPrice ? "flat" : nextPrice > previousPrice ? "up" : "down";
          }
          return nextTicks;
        });
        return { ...current, ...nextPrices };
      });
    } catch {
      // Keep the portfolio responsive even if one live refresh fails.
    }
  }

  useEffect(() => {
    let cancelled = false;
    void loadPortfolio(true);
    const intervalId = window.setInterval(() => {
      if (!cancelled) {
        void loadPortfolio(false);
      }
    }, LIVE_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PORTFOLIO_FILTERS_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    const openSymbols = Array.from(new Set(positions.filter((position) => position.status === "OPEN").map((position) => position.symbol)));
    if (openSymbols.length === 0) {
      return undefined;
    }

    let cancelled = false;
    void refreshLivePrices(openSymbols);
    const intervalId = window.setInterval(() => {
      if (!cancelled) {
        void refreshLivePrices(openSymbols);
      }
    }, LIVE_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [positions]);

  const allLedgerRows = buildLedgerRows(positions, trades, livePrices);
  const filteredLedgerRows = allLedgerRows.filter((row) => {
    if (filters.symbol !== "ALL" && row.symbol !== filters.symbol) {
      return false;
    }
    if (filters.strategy !== "ALL" && row.strategy !== filters.strategy) {
      return false;
    }
    if (filters.status !== "ALL" && row.status !== filters.status) {
      return false;
    }
    if (filters.profitability === "PROFIT" && row.totalPnl <= 0) {
      return false;
    }
    if (filters.profitability === "LOSS" && row.totalPnl >= 0) {
      return false;
    }
    if (filters.profitability === "FLAT" && Math.abs(row.totalPnl) > 0.005) {
      return false;
    }
    return true;
  });

  const filteredPositionIds = new Set(filteredLedgerRows.map((row) => row.id));
  const filteredTrades = trades
    .filter((trade) => filteredPositionIds.has(trade.position_id))
    .slice()
    .sort((left, right) => {
      const tradeDateDiff = new Date(right.trade_date).getTime() - new Date(left.trade_date).getTime();
      if (tradeDateDiff !== 0) {
        return tradeDateDiff;
      }

      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
  const totalBuyValue = filteredTrades.filter((trade) => trade.side === "BUY").reduce((sum, trade) => sum + trade.quantity * trade.price, 0);
  const totalSellValue = filteredTrades.filter((trade) => trade.side === "SELL").reduce((sum, trade) => sum + trade.quantity * trade.price, 0);
  const realizedPnl = filteredLedgerRows.reduce((sum, row) => sum + row.realizedPnl, 0);
  const unrealizedPnl = filteredLedgerRows.reduce((sum, row) => sum + row.unrealizedPnl, 0);
  const totalPnl = realizedPnl + unrealizedPnl;
  const closedRows = filteredLedgerRows.filter((row) => row.status === "CLOSED");
  const winningClosedRows = closedRows.filter((row) => row.realizedPnl > 0);
  const winRate = closedRows.length > 0 ? (winningClosedRows.length / closedRows.length) * 100 : 0;
  const bestTrade = closedRows.length > 0 ? closedRows.reduce((best, row) => (best.totalPnl > row.totalPnl ? best : row)) : null;
  const worstTrade = closedRows.length > 0 ? closedRows.reduce((worst, row) => (worst.totalPnl < row.totalPnl ? worst : row)) : null;
  const symbolOptions = Array.from(new Set(allLedgerRows.map((row) => row.symbol))).sort();
  const strategyOptions = Array.from(new Set(allLedgerRows.map((row) => row.strategy))).sort();

  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <section className="relative mb-6 overflow-hidden rounded-[2rem] border border-ruby-200 bg-[linear-gradient(135deg,rgba(19,34,56,0.94),rgba(143,83,51,0.88)_54%,rgba(211,137,47,0.85)_100%)] p-6 text-white shadow-soft backdrop-blur">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(255,233,182,0.24),transparent_26%)]" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-ruby-800/95">Lifetime Paper Portfolio</p>
            <h1 className="mt-3 font-display text-4xl text-white sm:text-[3.4rem]">Portfolio by Ahmed</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/74">
              Review your full paper-trading history with live open exposure, realized outcomes, and broker-style ledger details.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void loadPortfolio(false)}
              className="rounded-full border border-white/18 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white hover:text-night"
            >
              {refreshing ? "Refreshing..." : "Refresh Portfolio"}
            </button>
            <button
              onClick={onBack}
              className="rounded-full border border-white/18 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white hover:text-night"
            >
              Back To Terminal
            </button>
          </div>
        </div>
        <p className="relative mt-4 text-xs text-white/62">{lastRefreshAt ? `Last reconciled at ${formatIndianDateTime(lastRefreshAt)}` : "Waiting for the first refresh..."}</p>
      </section>

      {error ? <p className="mb-4 text-sm font-medium text-ruby-700">{error}</p> : null}

      <section className="mb-6">
        <Panel title="Filters" subtitle="Slice the lifetime portfolio by asset, strategy, position status, or profitability.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="text-sm text-ink/75">
              <span className="mb-2 block font-medium">Symbol</span>
              <select value={filters.symbol} onChange={(event) => setFilters((current) => ({ ...current, symbol: event.target.value }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-leaf">
                <option value="ALL">All Symbols</option>
                {symbolOptions.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
              </select>
            </label>
            <label className="text-sm text-ink/75">
              <span className="mb-2 block font-medium">Strategy</span>
              <select value={filters.strategy} onChange={(event) => setFilters((current) => ({ ...current, strategy: event.target.value }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-leaf">
                <option value="ALL">All Strategies</option>
                {strategyOptions.map((strategy) => <option key={strategy} value={strategy}>{strategy.replace(/_/g, " ").toUpperCase()}</option>)}
              </select>
            </label>
            <label className="text-sm text-ink/75">
              <span className="mb-2 block font-medium">Status</span>
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as PortfolioFilters["status"] }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-leaf">
                <option value="ALL">All Positions</option>
                <option value="OPEN">Open Only</option>
                <option value="CLOSED">Closed Only</option>
              </select>
            </label>
            <label className="text-sm text-ink/75">
              <span className="mb-2 block font-medium">P&amp;L Filter</span>
              <select value={filters.profitability} onChange={(event) => setFilters((current) => ({ ...current, profitability: event.target.value as PortfolioFilters["profitability"] }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-leaf">
                <option value="ALL">All Outcomes</option>
                <option value="PROFIT">Profitable Only</option>
                <option value="LOSS">Losing Only</option>
                <option value="FLAT">Flat Only</option>
              </select>
            </label>
            <button onClick={() => setFilters({ symbol: "ALL", strategy: "ALL", status: "ALL", profitability: "ALL" })} className="self-end rounded-full border border-ruby-100 bg-ruby-50/805 px-5 py-3 text-sm font-semibold text-ink transition hover:border-leaf hover:text-leaf">
              Clear Filters
            </button>
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Net P&L" value={formatRupees(totalPnl)} subtitle="Combined realized and live unrealized profit/loss for the filtered portfolio." tone={totalPnl >= 0 ? "positive" : "negative"} />
        <MetricCard title="Realized P&L" value={formatRupees(realizedPnl)} subtitle="Locked-in results from completed position cycles." tone={realizedPnl >= 0 ? "positive" : "negative"} />
        <MetricCard title="Open P&L" value={formatRupees(unrealizedPnl)} subtitle="Live mark-to-market result across open filtered positions." tone={unrealizedPnl >= 0 ? "positive" : "negative"} />
        <MetricCard title="Win Rate" value={`${winRate.toFixed(1)}%`} subtitle={`${winningClosedRows.length} winners across ${closedRows.length} closed positions.`} tone={winRate >= 50 ? "positive" : "neutral"} />
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Capital Deployed" value={formatRupees(totalBuyValue)} subtitle="Gross value of all filtered BUY trades." />
        <MetricCard title="Capital Recovered" value={formatRupees(totalSellValue)} subtitle="Gross value of all filtered SELL trades." />
        <MetricCard title="Best Trade" value={bestTrade ? `${bestTrade.symbol} ${formatRupees(bestTrade.totalPnl)}` : "-"} subtitle={bestTrade ? `Closed on ${formatShortDate(bestTrade.soldOn)}` : "No closed trade available yet."} tone={bestTrade && bestTrade.totalPnl >= 0 ? "positive" : "neutral"} />
        <MetricCard title="Worst Trade" value={worstTrade ? `${worstTrade.symbol} ${formatRupees(worstTrade.totalPnl)}` : "-"} subtitle={worstTrade ? `Closed on ${formatShortDate(worstTrade.soldOn)}` : "No closed trade available yet."} tone={worstTrade && worstTrade.totalPnl < 0 ? "negative" : "neutral"} />
      </section>

      <section className="mt-6">
        <Panel title="Portfolio Ledger" subtitle="Broker-style ledger with average cost, remaining quantity, live open pricing, realized sell accounting, and percent-wise P&amp;L for each trade.">
          {loading ? <p className="text-sm text-ink/70">Loading lifetime portfolio...</p> : filteredLedgerRows.length === 0 ? <p className="text-sm text-ink/70">No lifetime paper positions match the current filters.</p> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-ink/60">
                    <th className="pb-3 pr-4 font-medium">Symbol</th>
                    <th className="pb-3 pr-4 font-medium">Strategy</th>
                    <th className="pb-3 pr-4 font-medium">Bought</th>
                    <th className="pb-3 pr-4 font-medium">Sold</th>
                    <th className="pb-3 pr-4 font-medium">Qty Ledger</th>
                    <th className="pb-3 pr-4 font-medium">Avg Cost</th>
                    <th className="pb-3 pr-4 font-medium">LTP / Avg Exit</th>
                    <th className="pb-3 pr-4 font-medium">Realized</th>
                    <th className="pb-3 pr-4 font-medium">Open</th>
                    <th className="pb-3 pr-4 font-medium">P&amp;L %</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLedgerRows.map((row) => {
                    const tickDirection = priceTicks[row.symbol] ?? "flat";
                    const rowHighlight = row.status === "OPEN" ? tickDirection === "up" ? "bg-emerald-50/60" : tickDirection === "down" ? "bg-ruby-500/60" : "bg-blue-50/45" : "";
                    return (
                      <tr key={row.id} className={`border-b border-ink/5 text-ink/85 last:border-none transition-colors ${rowHighlight}`}>
                        <td className="py-3 pr-4 font-semibold">{row.symbol}</td>
                        <td className="py-3 pr-4 uppercase tracking-[0.12em] text-xs text-ink/60">{row.strategy.replace(/_/g, " ")}</td>
                        <td className="py-3 pr-4">{formatShortDate(row.boughtOn)}</td>
                        <td className="py-3 pr-4">{formatShortDate(row.soldOn)}</td>
                        <td className="py-3 pr-4">
                          <span className="font-semibold">{formatQuantity(row.entryQuantity)}</span><span className="ml-1 text-xs text-ink/45">bought</span><br />
                          <span className="font-semibold">{formatQuantity(row.remainingQuantity)}</span><span className="ml-1 text-xs text-ink/45">left</span>
                          {row.exitedQuantity > 0 ? <><br /><span className="font-semibold">{formatQuantity(row.exitedQuantity)}</span><span className="ml-1 text-xs text-ink/45">sold</span></> : null}
                        </td>
                        <td className="py-3 pr-4">{row.averageBuyPrice === null ? "-" : formatRupees(row.averageBuyPrice)}</td>
                        <td className="py-3 pr-4">
                          <span className={`font-semibold ${row.status === "OPEN" && tickDirection === "up" ? "text-emerald-700" : row.status === "OPEN" && tickDirection === "down" ? "text-ruby-700" : "text-ink"}`}>{formatRupees(row.currentPrice)}</span>
                          {row.averageSellPrice !== null ? <span className="mt-1 block text-xs text-ink/50">Avg exit {formatRupees(row.averageSellPrice)}</span> : null}
                        </td>
                        <td className={`py-3 pr-4 font-semibold ${row.realizedPnl >= 0 ? "text-emerald-700" : "text-ruby-700"}`}>{formatRupees(row.realizedPnl)}</td>
                        <td className={`py-3 pr-4 font-semibold ${row.unrealizedPnl >= 0 ? "text-emerald-700" : "text-ruby-700"}`}>{formatRupees(row.unrealizedPnl)}</td>
                        <td className={`py-3 pr-4 font-semibold ${row.pnlPercent !== null && row.pnlPercent >= 0 ? "text-emerald-700" : "text-ruby-700"}`}>
                          {formatPercent(row.pnlPercent)}
                          {row.entryValue > 0 ? <span className="mt-1 block text-xs font-medium text-ink/45">on {formatRupees(row.entryValue)}</span> : null}
                        </td>
                        <td className="py-3">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.status === "OPEN" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{row.status}</span>
                          {row.status === "OPEN" ? <span className="ml-2 rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold tracking-[0.15em] text-ink/55">LIVE</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>

      <section className="mt-6">
        <Panel title="Trade Tape" subtitle="Chronological paper-trading activity across your filtered lifetime portfolio.">
          {loading ? <p className="text-sm text-ink/70">Loading trade history...</p> : <TradesTable trades={filteredTrades} />}
        </Panel>
      </section>
    </main>
  );
}
