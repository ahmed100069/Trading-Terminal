import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { AIOutlook, OutlookDirection } from "../types/trading";
import { formatIndianDate, formatIndianDateTime } from "../utils/format";

function toneClasses(direction: OutlookDirection): string {
  if (direction === "bullish") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (direction === "bearish") {
    return "border-ruby-200 bg-ruby-50 text-ruby-700";
  }
  return "border-ink/10 bg-white text-ink/70";
}

function barClasses(direction: OutlookDirection): string {
  if (direction === "bullish") {
    return "bg-emerald-500";
  }
  if (direction === "bearish") {
    return "bg-ruby-500";
  }
  return "bg-ink/45";
}

function freshnessClasses(status: string): string {
  if (status.toLowerCase() === "live") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status.toLowerCase() === "delayed") {
    return "border-ruby-200 bg-ruby-50 text-ruby-700";
  }
  return "border-ink/10 bg-white text-ink/70";
}

interface AIPredictionPanelProps {
  outlook: AIOutlook;
}

export function AIPredictionPanel({ outlook }: AIPredictionPanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-ink/10 bg-sand/45 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/45">{outlook.model_name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${toneClasses(outlook.direction)}`}>
                {outlook.direction}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${freshnessClasses(outlook.freshness_status)}`}>
                {outlook.freshness_status}
              </span>
              <span className="text-xs font-medium text-ink/55">Horizon: {outlook.horizon}</span>
            </div>
            <p className="mt-3 text-xs text-ink/50">Updated {formatIndianDateTime(outlook.generated_at)}</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-4 py-3 lg:min-w-[170px] lg:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Confidence</p>
            <p className="mt-1 font-display text-3xl text-ink">{outlook.confidence_pct.toFixed(1)}%</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Upside Probability</p>
            <p className="mt-2 font-display text-2xl text-ink">{outlook.upside_probability_pct.toFixed(1)}%</p>
          </div>
          <div className="rounded-2xl bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Holdout Accuracy</p>
            <p className="mt-2 font-display text-2xl text-ink">{outlook.metrics.validation_accuracy_pct.toFixed(1)}%</p>
          </div>
          <div className="rounded-2xl bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Walk-Forward Accuracy</p>
            <p className="mt-2 font-display text-2xl text-ink">{outlook.metrics.walk_forward_accuracy_pct.toFixed(1)}%</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Interpretation</p>
          <p className="mt-2 text-sm leading-6 text-ink/70">{outlook.summary}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-ink/10 bg-white/75 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Per-Asset Model Metrics</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl bg-sand/45 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">Training Samples</p>
            <p className="mt-2 font-display text-2xl text-ink">{outlook.metrics.training_samples}</p>
          </div>
          <div className="rounded-2xl bg-sand/45 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">Walk-Forward Windows</p>
            <p className="mt-2 font-display text-2xl text-ink">{outlook.metrics.walk_forward_windows}</p>
          </div>
          <div className="rounded-2xl bg-sand/45 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">Walk-Forward Precision</p>
            <p className="mt-2 font-display text-2xl text-ink">{outlook.metrics.walk_forward_precision_pct.toFixed(1)}%</p>
          </div>
          <div className="rounded-2xl bg-sand/45 p-4 sm:col-span-2 xl:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">Avg Bullish Return</p>
            <p className="mt-2 font-display text-2xl text-ink">{outlook.metrics.average_bullish_return_pct.toFixed(2)}%</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-ink/10 bg-white/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Feature Importance</p>
          <div className="mt-3 space-y-3">
            {outlook.feature_importance.map((item) => (
              <div key={item.feature}>
                <div className="flex items-center justify-between gap-3 text-sm text-ink/70">
                  <span>{item.label}</span>
                  <span className="font-semibold text-ink">{item.importance_pct.toFixed(1)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand">
                  <div className="h-full rounded-full bg-ink" style={{ width: `${item.importance_pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-ink/10 bg-white/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Validation Snapshot</p>
          <div className="mt-3 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outlook.validation_windows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(23,32,51,0.08)" vertical={false} />
                <XAxis dataKey="window_label" tick={{ fill: "#6b7280", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 12 }} axisLine={false} tickLine={false} width={36} domain={[0, 100]} />
                <Tooltip cursor={{ fill: "rgba(23,32,51,0.04)" }} />
                <Bar dataKey="accuracy_pct" fill="#172033" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-ink/50">Each bar shows one rolling walk-forward validation window.</p>
        </div>
      </div>

      <div className="rounded-3xl border border-ink/10 bg-white/75 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Recent Prediction History</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-ink/55">
                <th className="pb-3 pr-4 font-medium">Week</th>
                <th className="pb-3 pr-4 font-medium">Prob Up</th>
                <th className="pb-3 pr-4 font-medium">Actual</th>
                <th className="pb-3 font-medium">Return</th>
              </tr>
            </thead>
            <tbody>
              {outlook.prediction_history.map((point) => (
                <tr key={point.point_date} className="border-b border-ink/5 text-ink/80 last:border-none">
                  <td className="py-3 pr-4">{formatIndianDate(point.point_date)}</td>
                  <td className="py-3 pr-4 font-semibold text-ink">{point.probability_up_pct.toFixed(1)}%</td>
                  <td className="py-3 pr-4">{point.actual_up === null || point.actual_up === undefined ? "Pending" : point.actual_up ? "Up" : "Down"}</td>
                  <td className="py-3">{point.realized_return_pct == null ? "-" : `${point.realized_return_pct.toFixed(2)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {outlook.components.map((component) => (
          <div key={component.name} className="rounded-2xl border border-ink/10 bg-white/75 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{component.label}</p>
                <p className="mt-1 text-sm leading-6 text-ink/65">{component.explanation}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${toneClasses(component.signal)}`}>
                {component.signal}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand">
              <div className={`h-full rounded-full ${barClasses(component.signal)}`} style={{ width: `${component.score}%` }} />
            </div>
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-ink/45">Score {component.score.toFixed(1)} / 100</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-ink/10 bg-white/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Key Drivers</p>
          <div className="mt-3 space-y-2">
            {outlook.key_drivers.map((driver) => (
              <p key={driver} className="rounded-2xl bg-sand/50 px-3 py-2 text-sm leading-6 text-ink/70">
                {driver}
              </p>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-ruby-100 bg-ruby-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ruby-700">Risk Notes</p>
          <div className="mt-3 space-y-2">
            {outlook.risks.map((risk) => (
              <p key={risk} className="text-sm leading-6 text-ruby-800/90">
                {risk}
              </p>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-ruby-800/80">{outlook.disclaimer}</p>
        </div>
      </div>
    </div>
  );
}
