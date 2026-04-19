import type { OrderBook } from "../types/trading";

interface OrderBookPanelProps {
  orderBook: OrderBook | null;
}

export function OrderBookPanel({ orderBook }: OrderBookPanelProps) {
  if (!orderBook) {
    return <p className="text-sm text-ink/70">Order book data is loading.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 text-sm">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ruby-700">Asks</p>
        <div className="space-y-2">
          {[...orderBook.asks].reverse().map((level) => (
            <div key={`ask-${level.price}`} className="grid grid-cols-2 gap-3 rounded-xl bg-ruby-50 px-3 py-2">
              <span className="font-medium text-ruby-800">{level.price.toFixed(4)}</span>
              <span className="text-right text-ink/70">{level.quantity.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Bids</p>
        <div className="space-y-2">
          {orderBook.bids.map((level) => (
            <div key={`bid-${level.price}`} className="grid grid-cols-2 gap-3 rounded-xl bg-emerald-50 px-3 py-2">
              <span className="font-medium text-emerald-800">{level.price.toFixed(4)}</span>
              <span className="text-right text-ink/70">{level.quantity.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
