import { Panel } from "./Panel";
import type { SystemHealth } from "../types/trading";

interface SystemHealthPanelProps {
  health: SystemHealth;
  streamStatus: string;
}

function statusTone(status: string): string {
  if (["LIVE", "READY", "NORMAL", "CONFIGURED"].includes(status)) return "border-leaf/20 bg-leaf/10 text-leaf-700";
  if (["WATCH", "NOT_CONFIGURED", "NOT_TRACKED", "CONNECTING", "NOT_APPLICABLE", "NOT_ACTIVE"].includes(status)) return "border-amber-300/60 bg-amber-50 text-amber-800";
  return "border-ruby/20 bg-ruby/10 text-ruby-700";
}

function StatusRow({ label, status, note }: { label: string; status: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/8 bg-white/65 px-3 py-3">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {note ? <p className="mt-0.5 text-xs text-ink/45">{note}</p> : null}
      </div>
      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${statusTone(status)}`}>
        {status.replace(/_/g, " ")}
      </span>
    </div>
  );
}

export function SystemHealthPanel({ health, streamStatus }: SystemHealthPanelProps) {
  const checkedAt = new Date(health.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <Panel title="System Health" subtitle="Observed status from this dashboard analysis cycle; unconfigured integrations are not reported as healthy.">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-2 sm:grid-cols-2">
          <StatusRow label="Market-data API" status={health.status} note="Market overview and prediction request" />
          <StatusRow label="AI model" status={health.model} note="Prediction generated for the selected symbol" />
          <StatusRow label="Database" status={health.database} note="Configured SQL database probe" />
          <StatusRow label="Redis" status={health.redis} note={health.redis === "NOT_CONFIGURED" ? "Optional integration is not configured" : "Configuration detected; connectivity is not probed"} />
          <StatusRow label="Chart WebSocket" status={streamStatus} note={streamStatus === "NOT_ACTIVE" ? "Open Markets to activate the chart stream" : "Connection state reported by the active chart"} />
          <StatusRow label="API WebSocket" status={health.binance_ws} note="No backend WebSocket handler is configured" />
        </div>
        <div className="grid content-start grid-cols-2 gap-3">
          <Metric label="Backend processing" value={`${health.latency_ms} ms`} />
          <Metric label="Prediction" value={`${health.prediction_latency_ms} ms`} />
          <Metric label="Quote age" value={health.data_delay_ms < 1000 ? `${health.data_delay_ms} ms` : `${(health.data_delay_ms / 1000).toFixed(1)} s`} />
        </div>
      </div>
      <p className="mt-4 text-right text-[11px] text-ink/45">Checked {checkedAt}</p>
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink/8 bg-white/65 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/45">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
