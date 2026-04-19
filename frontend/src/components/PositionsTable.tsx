import type { PaperPosition } from "../types/trading";
import { formatRupees } from "../utils/format";

interface PositionsTableProps {
  positions: PaperPosition[];
}

function formatQuantity(quantity: number): string {
  return quantity.toFixed(6).replace(/\.?0+$/, "");
}

export function PositionsTable({ positions }: PositionsTableProps) {
  if (positions.length === 0) {
    return <p className="text-sm text-ink/70">No paper positions yet. Run a sync to create one.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left text-ink/60">
            <th className="pb-3 pr-4 font-medium">Symbol</th>
            <th className="pb-3 pr-4 font-medium">Status</th>
            <th className="pb-3 pr-4 font-medium">Remaining Qty</th>
            <th className="pb-3 pr-4 font-medium">Avg Cost</th>
            <th className="pb-3 pr-4 font-medium">Current</th>
            <th className="pb-3 pr-4 font-medium">P/L</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => {
            const pnl = position.status === "OPEN" ? position.unrealized_pnl : (position.realized_pnl ?? 0);
            const pnlClass = pnl >= 0 ? "text-emerald-700" : "text-ruby-700";

            return (
              <tr key={position.id} className="border-b border-ink/5 text-ink/85 last:border-none">
                <td className="py-3 pr-4 font-semibold">{position.symbol}</td>
                <td className="py-3 pr-4">{position.status}</td>
                <td className="py-3 pr-4">{formatQuantity(position.quantity)}</td>
                <td className="py-3 pr-4">{formatRupees(position.entry_price)}</td>
                <td className="py-3 pr-4">{formatRupees(position.current_price)}</td>
                <td className={`py-3 pr-4 font-semibold ${pnlClass}`}>{formatRupees(pnl)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
