import type { AssetSearchResult, WatchlistItem } from "../types/trading";
import { formatRupees } from "../utils/format";

interface WatchlistPanelProps {
  items: WatchlistItem[];
  activeSymbol: string;
  searchQuery: string;
  searchResults: AssetSearchResult[];
  searchLoading: boolean;
  onSearchQueryChange: (value: string) => void;
  onSelect: (symbol: string) => void;
}

export function WatchlistPanel({
  items,
  activeSymbol,
  searchQuery,
  searchResults,
  searchLoading,
  onSearchQueryChange,
  onSelect,
}: WatchlistPanelProps) {
  const showSearchSection = searchQuery.trim().length >= 2;

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Search Assets</label>
        <input
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value.toUpperCase())}
          placeholder="Try BTC, RELIANCE, TCS, 500325..."
          className="w-full rounded-2xl border border-ink/10 bg-white/75 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-leaf"
        />
        <p className="mt-2 text-xs text-ink/45">Search Binance crypto plus Indian equities from NSE and BSE.</p>
      </div>

      {showSearchSection ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Search Results</p>
            {searchLoading ? <p className="text-xs text-ink/45">Searching...</p> : null}
          </div>

          {!searchLoading && searchResults.length === 0 ? (
            <p className="rounded-2xl border border-ink/10 bg-white/55 px-4 py-3 text-sm text-ink/70">
              No crypto or NSE/BSE assets matched that search.
            </p>
          ) : null}

          {searchResults.map((item) => {
            const isActive = item.symbol === activeSymbol;

            return (
              <button
                key={item.symbol}
                onClick={() => onSelect(item.symbol)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  isActive ? "border-leaf bg-leaf/10" : "border-ink/10 bg-white/55 hover:border-leaf/40"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{item.symbol}</p>
                    <p className="mt-1 text-xs tracking-[0.04em] text-ink/50">{item.display_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-ink">{item.market}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">{item.asset_class}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Watchlist</p>

        {items.length === 0 ? <p className="text-sm text-ink/70">Watchlist data is not available yet.</p> : null}

        {items.map((item) => {
          const isActive = item.symbol === activeSymbol;
          const isPositive = item.price_change_percent >= 0;

          return (
            <button
              key={item.symbol}
              onClick={() => onSelect(item.symbol)}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                isActive ? "border-leaf bg-leaf/10" : "border-ink/10 bg-white/55 hover:border-leaf/40"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{item.symbol}</p>
                  <p className="mt-1 text-xs tracking-[0.04em] text-ink/50">{item.display_name ?? item.market}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-ink">{formatRupees(item.last_price)}</p>
                  <p className={`mt-1 text-sm font-medium ${isPositive ? "text-emerald-700" : "text-ruby-700"}`}>
                    {isPositive ? "+" : ""}
                    {item.price_change_percent.toFixed(2)}%
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-ink/40">{item.market}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
