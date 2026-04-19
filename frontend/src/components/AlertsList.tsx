import type { AlertEvent } from "../types/trading";
import { formatIndianDateTime } from "../utils/format";

interface AlertsListProps {
  alerts: AlertEvent[];
}

export function AlertsList({ alerts }: AlertsListProps) {
  if (alerts.length === 0) {
    return <p className="text-sm text-ink/70">No alerts yet. Sync paper trading to generate signal notifications.</p>;
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <article key={alert.id} className="rounded-2xl border border-ink/10 bg-white/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-ink">{alert.symbol} · {alert.strategy_name}</p>
            <span className="rounded-full bg-leaf/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-leaf">
              {alert.channel}
            </span>
          </div>
          <p className="mt-2 text-sm text-ink/75">{alert.message}</p>
          <p className="mt-2 text-xs text-ink/45">{formatIndianDateTime(alert.created_at)}</p>
        </article>
      ))}
    </div>
  );
}
