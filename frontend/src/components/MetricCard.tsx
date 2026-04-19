interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  tone?: "neutral" | "positive" | "negative";
}

const toneClasses = {
  neutral: "border-leaf/30 bg-[linear-gradient(135deg,rgba(240,253,244,0.96),rgba(220,252,231,0.84))]",
  positive: "border-leaf/50 bg-[linear-gradient(135deg,rgba(240,253,244,0.98),rgba(187,247,208,0.92))]",
  negative: "border-ruby/50 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(254,226,226,0.92))]",
};

export function MetricCard({ title, value, subtitle, tone = "neutral" }: MetricCardProps) {
  return (
    <article
      className={`relative overflow-hidden rounded-xl2 border p-5 shadow-soft ${toneClasses[tone]}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-leaf via-ruby to-crimson" />
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-ink/55">{title}</p>
      <p className="mt-4 font-display text-3xl text-ink">{value}</p>
      <p className="mt-3 text-sm leading-6 text-ink/72">{subtitle}</p>
    </article>
  );
}
