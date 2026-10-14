import { Panel } from "./Panel";
import type { AIOutlook, MarketOverview, MonitoringResponse } from "../types/trading";

interface RiskAnalysisPanelProps {
  market: MarketOverview;
  outlook: AIOutlook;
  monitoring: MonitoringResponse;
}

function scoreTone(score: number): string {
  if (score >= 0.7) return "text-ruby-700";
  if (score >= 0.4) return "text-amber-700";
  return "text-leaf-700";
}

function ScoreCard({ title, score, label }: { title: string; score: number; label: string }) {
  const percentage = Math.max(0, Math.min(100, score * 100));
  return (
    <div className="rounded-2xl border border-ink/8 bg-white/70 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/50">{title}</p>
        <span className={`text-xs font-bold uppercase ${scoreTone(score)}`}>{label}</span>
      </div>
      <p className="mt-2 font-display text-3xl text-ink">{percentage.toFixed(0)}<span className="ml-1 text-sm text-ink/45">/ 100</span></p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/8">
        <div className="h-full rounded-full bg-gradient-to-r from-leaf via-amber-500 to-ruby" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export function RiskAnalysisPanel({ market, outlook, monitoring }: RiskAnalysisPanelProps) {
  const { market_snapshot: snapshot } = monitoring;
  const spreadPct = market.last_price > 0 ? ((market.ask_price - market.bid_price) / market.last_price) * 100 : null;
  const riskFactors = outlook.risks;

  return (
    <div className="space-y-5">
      <Panel title="Risk & Anomaly" subtitle="Heuristic indicators derived from market movement, model output, and available quote data; not execution advice.">
        <div className="grid gap-3 sm:grid-cols-2">
          <ScoreCard title="Market risk proxy" score={snapshot.risk_score} label={snapshot.risk_level} />
          <ScoreCard title="Anomaly watch" score={snapshot.anomaly_score} label={snapshot.anomaly_status} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <RiskMetric label="24h price change" value={`${market.price_change_percent >= 0 ? "+" : ""}${market.price_change_percent.toFixed(2)}%`} />
          <RiskMetric label="Bid / ask spread" value={spreadPct === null ? "Unavailable" : `${spreadPct.toFixed(3)}%`} />
          <RiskMetric label="Quote volume" value={market.quote_volume > 0 ? market.quote_volume.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "Unavailable"} />
        </div>
      </Panel>
      <Panel title="Risk Factors" subtitle="Model-reported cautions for the selected symbol and horizon.">
        {riskFactors.length === 0 ? (
          <p className="text-sm text-ink/60">No risk factors were reported for this analysis.</p>
        ) : (
          <ul className="space-y-2">
            {riskFactors.map((factor) => <li key={factor} className="rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-sm leading-6 text-amber-950">{factor}</li>)}
          </ul>
        )}
        <p className="mt-4 text-xs leading-5 text-ink/50">Scores are monitoring heuristics, and risk factors are model-generated. Neither is a guarantee or a substitute for independent risk controls.</p>
      </Panel>
    </div>
  );
}

function RiskMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-sand/65 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/45">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
