import { useEffect, useState } from "react";

import { DashboardPage } from "./pages/DashboardPage";
import { PortfolioPage } from "./pages/PortfolioPage";

const APP_VIEW_STORAGE_KEY = "trading-platform-active-view";

function App() {
  const [activeView, setActiveView] = useState<"dashboard" | "portfolio">(() => {
    if (typeof window === "undefined") {
      return "dashboard";
    }

    const savedView = window.localStorage.getItem(APP_VIEW_STORAGE_KEY);
    return savedView === "portfolio" ? "portfolio" : "dashboard";
  });

  useEffect(() => {
    window.localStorage.setItem(APP_VIEW_STORAGE_KEY, activeView);
  }, [activeView]);

  if (activeView === "portfolio") {
    return <PortfolioPage onBack={() => setActiveView("dashboard")} />;
  }

  return <DashboardPage onOpenPortfolio={() => setActiveView("portfolio")} />;
}

export default App;
