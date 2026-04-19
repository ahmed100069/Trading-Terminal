import type { PaperTrade, TradeRecord } from "../types/trading";
import { formatIndianDate, formatRupees } from "../utils/format";

interface TradesTableProps {
  trades: Array<TradeRecord | PaperTrade>;
}

function hasCreatedAt(trade: TradeRecord | PaperTrade): trade is PaperTrade {
  return "created_at" in trade;
}

function hasSymbol(trade: TradeRecord | PaperTrade): trade is PaperTrade {
  return "symbol" in trade;
}

function formatQuantity(quantity: number): string {
  return quantity.toFixed(6).replace(/\.?0+$/, "");
}

export function TradesTable({ trades }: TradesTableProps) {
  if (trades.length === 0) {
    return <p className="text-sm text-ink/70">No trades recorded yet for the selected view.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left text-ink/60">
            <th className="pb-3 pr-4 font-medium">Date</th>
            <th className="pb-3 pr-4 font-medium">Symbol</th>
            <th className="pb-3 pr-4 font-medium">Side</th>
            <th className="pb-3 pr-4 font-medium">Qty</th>
            <th className="pb-3 pr-4 font-medium">Price</th>
            <th className="pb-3 pr-4 font-medium">P/L</th>
            <th className="pb-3 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, index) => {
            const pnl = trade.pnl ?? null;
            const pnlClass = pnl === null ? "text-ink/60" : pnl >= 0 ? "text-emerald-700" : "text-ruby-800";

            return (
              <tr key={hasCreatedAt(trade) ? trade.id : `${trade.trade_date}-${trade.side}-${index}`} className="border-b border-ink/5 text-ink/85 last:border-none">
                <td className="py-3 pr-4">{formatIndianDate(trade.trade_date)}</td>
                <td className="py-3 pr-4 font-semibold">{hasSymbol(trade) ? trade.symbol : "-"}</td>
                <td className="py-3 pr-4 font-semibold">{trade.side}</td>
                <td className="py-3 pr-4">{formatQuantity(trade.quantity)}</td>
                <td className="py-3 pr-4">{formatRupees(trade.price)}</td>
                <td className={`py-3 pr-4 font-semibold ${pnlClass}`}>{pnl === null ? "-" : formatRupees(pnl)}</td>
                <td className="py-3 text-ink/70">{trade.note ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
