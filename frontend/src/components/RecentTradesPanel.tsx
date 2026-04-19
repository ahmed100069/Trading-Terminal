import type { RecentTrade } from "../types/trading";
import { formatIndianTime, formatRupees } from "../utils/format";

interface RecentTradesPanelProps {
  trades: RecentTrade[];
}

export function RecentTradesPanel({ trades }: RecentTradesPanelProps) {
  if (trades.length === 0) {
    return <p className="text-sm text-ink/70">No recent trades are available right now.</p>;
  }

  return (
    <div className="space-y-2">
      {trades.map((trade) => (
        <div key={trade.id} className="grid grid-cols-[1.1fr_0.9fr_1fr] gap-3 rounded-2xl bg-white/60 px-4 py-3 text-sm text-ink/75">
          <div>
            <p className={`font-semibold ${trade.is_buyer_maker ? "text-ruby-700" : "text-emerald-700"}`}>
              {formatRupees(trade.price, 2)}
            </p>
            <p className="mt-1 text-xs text-ink/45">{formatIndianTime(trade.trade_time)}</p>
          </div>
          <p className="text-right font-medium text-ink">{trade.quantity.toFixed(6).replace(/\.?0+$/, "")}</p>
          <p className="text-right text-ink/55">{formatRupees(trade.quote_quantity, 2)}</p>
        </div>
      ))}
    </div>
  );
}
