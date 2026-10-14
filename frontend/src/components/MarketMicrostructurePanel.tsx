import { useEffect, useRef, useState } from "react";

import { OrderBookPanel } from "./OrderBookPanel";
import { Panel } from "./Panel";
import { RecentTradesPanel } from "./RecentTradesPanel";
import { fetchOrderBook, fetchRecentTrades } from "../services/api";
import type { OrderBook, RecentTrade } from "../types/trading";

interface MarketMicrostructurePanelProps {
  symbol: string;
}

export function MarketMicrostructurePanel({ symbol }: MarketMicrostructurePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedSymbolRef = useRef<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const isCrypto = !symbol.includes(".");

  useEffect(() => {
    requestedSymbolRef.current = null;
    setOrderBook(null);
    setRecentTrades([]);
    setError(null);
  }, [symbol]);

  useEffect(() => {
    if (!expanded || !isCrypto || requestedSymbolRef.current === symbol) return;

    let cancelled = false;
    requestedSymbolRef.current = symbol;
    setLoading(true);
    setError(null);
    Promise.all([fetchOrderBook(symbol).catch(() => null), fetchRecentTrades(symbol).catch(() => null)])
      .then(([book, trades]) => {
        if (cancelled) return;
        setOrderBook(book);
        setRecentTrades(trades ?? []);
        if (!book && !trades) setError("Market depth and recent trades are unavailable from the provider right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    }, [expanded, isCrypto, retryCount, symbol]);

  return (
    <Panel title="Market Depth & Recent Trades" subtitle="Optional detail loaded from the market provider when expanded.">
      <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-semibold text-leaf-700">{expanded ? "Hide market activity" : "Load market activity"}</summary>
        <div className="mt-4">
          {!isCrypto ? (
            <p className="rounded-xl border border-ink/10 bg-white/65 p-4 text-sm text-ink/60">Order book and recent trade endpoints are not available for this equity provider.</p>
          ) : loading ? (
            <p role="status" className="text-sm text-ink/55">Loading market depth and recent trades…</p>
          ) : error ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-ruby-700">
              <p>{error}</p>
              <button onClick={() => { requestedSymbolRef.current = null; setRetryCount((count) => count + 1); }} className="rounded-lg border border-ruby/20 px-3 py-1.5 font-semibold hover:bg-ruby/5">Retry</button>
            </div>
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <button onClick={() => { requestedSymbolRef.current = null; setRetryCount((count) => count + 1); }} className="rounded-lg border border-ink/10 bg-white/70 px-3 py-1.5 text-xs font-semibold text-ink/65 hover:border-leaf/40">Refresh market activity</button>
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink/55">Order book</h3>
                  {orderBook ? <OrderBookPanel orderBook={orderBook} /> : <p className="text-sm text-ink/55">No order book data returned.</p>}
                </div>
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink/55">Recent public trades</h3>
                  <RecentTradesPanel trades={recentTrades} />
                </div>
              </div>
            </>
          )}
        </div>
      </details>
    </Panel>
  );
}
