import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function Panel({ title, subtitle, children }: PanelProps) {
  return (
    <section className="relative overflow-hidden rounded-xl2 border border-leaf/30 bg-sage/80 p-6 shadow-soft backdrop-blur">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,138,113,0.3),transparent_30%),linear-gradient(180deg,rgba(240,253,244,0.4),transparent_55%)]" />
      <div className="relative mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="mb-3 h-1.5 w-14 rounded-full bg-gradient-to-r from-leaf via-ruby to-crimson" />
          <h2 className="font-display text-xl text-ink">{title}</h2>
          {subtitle ? <p className="mt-1 max-w-2xl text-sm text-ink/68">{subtitle}</p> : null}
        </div>
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}
