import type { ChartInspection } from "./LiveCandlestickChart";
import { formatIndianDateTime, formatRupees } from "../utils/format";

interface ChartInspectorPanelProps {
  inspection: ChartInspection | null;
}

export function ChartInspectorPanel({ inspection }: ChartInspectorPanelProps) {
  if (!inspection) {
    return <p className="text-sm text-ink/70">Move over the chart to inspect candle data and indicator values.</p>;
  }

  const candleChange = inspection.close - inspection.open;
  const candleChangeClass = candleChange >= 0 ? "text-emerald-700" : "text-ruby-700";

  return (
    <div className="grid gap-3 text-sm text-ink/75 sm:grid-cols-2">
      <div className="rounded-2xl bg-sand/65 p-4 sm:col-span-2">
        <p className="font-semibold text-ink">Crosshair Time</p>
        <p className="mt-1 text-base font-medium text-ink">{formatIndianDateTime(inspection.time)}</p>
      </div>
      <div className="rounded-2xl bg-white/70 p-4">
        <p className="font-semibold text-ink">Open</p>
        <p className="mt-1 text-lg font-display text-ink">{formatRupees(inspection.open, 2)}</p>
      </div>
      <div className="rounded-2xl bg-white/70 p-4">
        <p className="font-semibold text-ink">Close</p>
        <p className={`mt-1 text-lg font-display ${candleChangeClass}`}>{formatRupees(inspection.close, 2)}</p>
      </div>
      <div className="rounded-2xl bg-white/70 p-4">
        <p className="font-semibold text-ink">High</p>
        <p className="mt-1 text-lg font-display text-ink">{formatRupees(inspection.high, 2)}</p>
      </div>
      <div className="rounded-2xl bg-white/70 p-4">
        <p className="font-semibold text-ink">Low</p>
        <p className="mt-1 text-lg font-display text-ink">{formatRupees(inspection.low, 2)}</p>
      </div>
      <div className="rounded-2xl bg-white/70 p-4">
        <p className="font-semibold text-ink">Volume</p>
        <p className="mt-1 text-lg font-display text-ink">{inspection.volume.toFixed(2)}</p>
      </div>
      <div className="rounded-2xl bg-white/70 p-4">
        <p className="font-semibold text-ink">Candle Delta</p>
        <p className={`mt-1 text-lg font-display ${candleChangeClass}`}>{formatRupees(candleChange, 2)}</p>
      </div>
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <p className="font-semibold text-ink">SMA 20</p>
        <p className="mt-1 text-lg font-display text-blue-700">{inspection.sma20 === null ? "-" : formatRupees(inspection.sma20, 2)}</p>
      </div>
      <div className="rounded-2xl border border-ruby-200 bg-ruby-50 p-4">
        <p className="font-semibold text-ink">EMA 50</p>
        <p className="mt-1 text-lg font-display text-ruby-700">{inspection.ema50 === null ? "-" : formatRupees(inspection.ema50, 2)}</p>
      </div>
    </div>
  );
}
