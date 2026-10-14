export const TERMINAL_SECTIONS = [
  "overview",
  "markets",
  "ai",
  "risk",
  "alerts",
  "system",
  "portfolio",
] as const;

export type TerminalSection = (typeof TERMINAL_SECTIONS)[number];
export const AUTH_ROUTES = ["login", "register", "forgot-password", "reset-password"] as const;
export type AuthRoute = (typeof AUTH_ROUTES)[number];

export type ApplicationRoute =
  | { kind: "public"; page: AuthRoute }
  | { kind: "app"; section: TerminalSection };

export const TERMINAL_SECTION_LABELS: Record<TerminalSection, string> = {
  overview: "Overview",
  markets: "Markets & Chart",
  ai: "AI Intelligence",
  risk: "Risk",
  alerts: "Alerts",
  system: "System",
  portfolio: "Portfolio",
};

export function sectionFromPath(pathname: string): TerminalSection {
  const pathParts = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  const candidate = pathParts[0] === "app" ? pathParts[1] : pathParts[0];
  return TERMINAL_SECTIONS.includes(candidate as TerminalSection)
    ? (candidate as TerminalSection)
    : "overview";
}

export function resolveApplicationRoute(pathname: string): ApplicationRoute {
  const normalizedPath = pathname ?? "/";
  const pathParts = normalizedPath.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);

  if (pathParts.length === 0) {
    return { kind: "public", page: "login" };
  }

  if (pathParts.length === 1 && AUTH_ROUTES.includes(pathParts[0] as AuthRoute)) {
    return { kind: "public", page: pathParts[0] as AuthRoute };
  }

  if (pathParts[0] === "app") {
    return { kind: "app", section: sectionFromPath(normalizedPath) };
  }

  return { kind: "public", page: "login" };
}

export function terminalSectionPath(section: TerminalSection): string {
  return `/app/${section}`;
}

export function applicationRoutePath(route: ApplicationRoute): string {
  return route.kind === "public" ? `/${route.page}` : terminalSectionPath(route.section);
}
