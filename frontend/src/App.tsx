import { Suspense, lazy, useEffect, useState, type MouseEvent } from "react";

import { useAuth } from "./auth/AuthContext";
import { AccountMenu } from "./components/account/AccountMenu";
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from "./pages/auth/AuthPages";
import {
  applicationRoutePath,
  resolveApplicationRoute,
  TERMINAL_SECTIONS,
  TERMINAL_SECTION_LABELS,
  terminalSectionPath,
  type ApplicationRoute,
  type TerminalSection,
} from "./types/navigation";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then(({ DashboardPage: page }) => ({ default: page })));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage").then(({ PortfolioPage: page }) => ({ default: page })));

function App() {
  const { status, isSessionStale } = useAuth();
  const [route, setRoute] = useState<ApplicationRoute>(() => resolveApplicationRoute(window.location.pathname));

  useEffect(() => {
    const canonicalPath = applicationRoutePath(resolveApplicationRoute(window.location.pathname));
    if (window.location.pathname !== canonicalPath) {
      window.history.replaceState({ route }, "", canonicalPath);
    }
    document.title = "Trading Terminal";
    const handlePopState = () => setRoute(resolveApplicationRoute(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (window.location.pathname === "/" && route.kind === "public" && route.page === "login") {
      window.history.replaceState({ route }, "", "/login");
    }
  }, [route]);

  useEffect(() => {
    if (status === "loading") return;

    const staleLoggedOut = isSessionStale && status === "signed-in";
    const nextRoute: ApplicationRoute | null = staleLoggedOut
      ? { kind: "public", page: "login" }
      : route.kind === "app" && status !== "signed-in"
        ? { kind: "public", page: "login" }
        : route.kind === "public" && status === "signed-in" && route.page !== "reset-password"
          ? { kind: "app", section: "markets" }
          : null;

    if (nextRoute) {
      window.history.replaceState({ route: nextRoute }, "", applicationRoutePath(nextRoute));
      setRoute(nextRoute);
    }
  }, [route, status, isSessionStale]);

  function navigate(section: TerminalSection) {
    const nextPath = terminalSectionPath(section);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({ route: { kind: "app", section } }, "", nextPath);
    }
    setRoute({ kind: "app", section });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function handleNavigationLink(event: MouseEvent<HTMLAnchorElement>, section: TerminalSection) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(section);
  }

  function renderNavigation(isCompact = false) {
    return TERMINAL_SECTIONS.map((section) => {
      const active = route.kind === "app" && route.section === section;
      return (
        <a
          key={section}
          href={terminalSectionPath(section)}
          aria-current={active ? "page" : undefined}
          onClick={(event) => handleNavigationLink(event, section)}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            active
              ? "bg-leaf text-white shadow-[0_8px_20px_rgba(15,138,113,0.18)]"
              : "text-ink/65 hover:bg-white/75 hover:text-ink"
          } ${isCompact ? "shrink-0 whitespace-nowrap" : "w-full"}`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-white" : "bg-ink/20"}`} />
          {TERMINAL_SECTION_LABELS[section]}
        </a>
      );
    });
  }

  if (route.kind === "public") {
    switch (route.page) {
      case "login": return <LoginPage />;
      case "register": return <RegisterPage />;
      case "forgot-password": return <ForgotPasswordPage />;
      case "reset-password": return <ResetPasswordPage />;
    }
  }

  if (status !== "signed-in") {
    return status === "loading" ? (
      <main role="status" className="grid min-h-screen place-items-center text-sm text-ink/60">Checking your session...</main>
    ) : <LoginPage />;
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="hidden border-r border-ink/10 bg-white/45 p-4 backdrop-blur-xl lg:flex lg:flex-col">
        <a href={terminalSectionPath("overview")} onClick={(event) => handleNavigationLink(event, "overview")} className="mb-8 flex items-center gap-3 px-2 pt-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-sm font-bold tracking-wide text-white">TT</span>
          <span>
            <span className="block font-display text-lg text-ink">Trading Terminal</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/40">Market workspace</span>
          </span>
        </a>
        <nav aria-label="Primary navigation" className="space-y-1">{renderNavigation()}</nav>
        <div className="mt-auto rounded-xl border border-ink/8 bg-white/65 p-3 text-xs leading-5 text-ink/50">
          Market data and model availability are shown in their respective workspace sections.
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-ink/10 bg-[#f3f8f5]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-h-10 items-center justify-between gap-4">
            <a href={terminalSectionPath("overview")} onClick={(event) => handleNavigationLink(event, "overview")} className="font-display text-lg text-ink lg:hidden">Trading Terminal</a>
            <div className="hidden text-sm font-semibold text-ink lg:block">{route.kind === "app" ? TERMINAL_SECTION_LABELS[route.section] : "Trading Terminal"}</div>
            <div className="ml-auto flex items-center gap-3">
              <p className="hidden text-xs text-ink/45 sm:block">Paper trading · Market data varies by provider</p>
              <AccountMenu />
            </div>
          </div>
          <nav aria-label="Primary navigation" className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">{renderNavigation(true)}</nav>
        </header>

        <div className="min-w-0">
          <Suspense fallback={<main role="status" className="grid min-h-[50vh] place-items-center text-sm text-ink/60">Loading workspace…</main>}>
            {route.kind === "app" && route.section === "portfolio" ? (
              <PortfolioPage />
            ) : (
              <DashboardPage section={route.kind === "app" && route.section !== "portfolio" ? route.section : "overview"} onNavigate={navigate} />
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default App;
