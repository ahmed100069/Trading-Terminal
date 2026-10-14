import { useState } from "react";

import { useAuth } from "../../auth/AuthContext";

export function AccountMenu() {
  const { status, user, service } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    if (!service) return;
    const result = await service.signOut();
    if (result.error) {
      setError(result.error);
      return;
    }
    window.location.assign("/login");
  }

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-ink/10 bg-white/70 px-3 py-2 text-sm font-medium text-ink/75 transition hover:border-leaf/35 hover:bg-white">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink/8 text-ink/55">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="10" cy="6.5" r="3" />
            <path d="M3.8 17c.6-3.1 2.7-4.8 6.2-4.8s5.6 1.7 6.2 4.8" strokeLinecap="round" />
          </svg>
        </span>
        <span className="hidden sm:inline">Account</span>
        <span aria-hidden="true" className="text-[10px] text-ink/40">▾</span>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-ink/10 bg-white p-2 shadow-[0_16px_42px_rgba(10,21,36,0.14)]">
        {status === "signed-in" ? (
          <>
            <p className="truncate px-3 py-2 text-xs text-ink/55">{user?.email}</p>
            <button type="button" onClick={() => void handleSignOut()} className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink hover:bg-sage">Sign out</button>
          </>
        ) : (
          <a href="/login" className="block rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-sage">Sign in</a>
        )}
        {error ? <p role="alert" className="px-3 py-2 text-xs text-red-700">{error}</p> : null}
      </div>
    </details>
  );
}
