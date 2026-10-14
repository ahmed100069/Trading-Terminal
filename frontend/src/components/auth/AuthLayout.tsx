import type { ReactNode } from "react";

import { useAuth } from "../../auth/AuthContext";

interface AuthLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  const auth = useAuth();

  return (
    <main className="flex min-h-[100svh] items-center justify-center px-4 py-8 sm:px-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-ink/10 bg-white shadow-[0_24px_80px_rgba(10,21,36,0.12)] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-ink p-10 text-white lg:flex">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(15,138,113,0.38),transparent_38%),radial-gradient(circle_at_90%_90%,rgba(220,38,38,0.18),transparent_35%)]" />
          <a href="/app/overview" className="relative flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-white/10 font-bold tracking-wide">TT</span>
            <span>
              <span className="block font-display text-lg">Trading Terminal</span>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">Market workspace</span>
            </span>
          </a>
          <div className="relative max-w-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">A focused trading workspace</p>
            <h1 className="mt-4 font-display text-4xl leading-tight">Markets, strategy, and insight in one place.</h1>
            <p className="mt-4 text-sm leading-6 text-white/60">Sign-in and account flows are being prepared. Your existing local terminal remains available.</p>
          </div>
          <p className="relative text-xs text-white/40">Trading Terminal</p>
        </section>

        <section className="flex min-h-[min(760px,calc(100svh-4rem))] items-center justify-center p-5 sm:p-10">
          <div className="w-full max-w-md">
            <a href="/app/overview" className="mb-8 flex items-center gap-3 lg:hidden">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-sm font-bold text-white">TT</span>
              <span className="font-display text-lg text-ink">Trading Terminal</span>
            </a>
            <div className="mb-7">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-leaf">Trading Terminal</p>
              <h2 className="mt-2 font-display text-3xl text-ink">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">{description}</p>
            </div>

            {children}

            {auth.status === "unconfigured" ? (
              <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-xs leading-5 text-amber-900">
                Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to your frontend environment to enable registrations and logins.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
