import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { SupabaseAuthService } from "./supabaseAuthService";
import type { AuthService, AuthStatus, AuthUser } from "./types";

const SESSION_STALE_MS = 30 * 60 * 1000;
const LAST_ACTIVITY_KEY = "trading-terminal:last-active";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  service: AuthService | null;
  isSessionStale: boolean;
}

const AUTH_NOT_CONFIGURED: AuthContextValue = {
  status: "unconfigured",
  user: null,
  service: null,
  isSessionStale: false,
};

export function isSessionStale(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const lastActive = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY) ?? "0");
  if (!lastActive) {
    return false;
  }

  return Date.now() - lastActive > SESSION_STALE_MS;
}

const AuthContext = createContext<AuthContextValue>(AUTH_NOT_CONFIGURED);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isSupabaseConfigured ? "loading" : "unconfigured");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [service, setService] = useState<AuthService | null>(isSupabaseConfigured ? new SupabaseAuthService() : null);
  const [isSessionStaleValue, setIsSessionStaleValue] = useState(false);

  const markSessionActive = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setStatus("unconfigured");
      setUser(null);
      setService(null);
      setIsSessionStaleValue(false);
      return undefined;
    }

    const authService = new SupabaseAuthService();
    setService(authService);
    let active = true;

    const syncUser = async () => {
      const currentUser = await authService.getCurrentUser();
      if (!active) {
        return;
      }
      const stale = isSessionStale();
      if (stale) {
        setUser(null);
        setStatus("signed-out");
        setIsSessionStaleValue(true);
        return;
      }

      setUser(currentUser);
      setStatus(currentUser ? "signed-in" : "signed-out");
      setIsSessionStaleValue(false);
      if (currentUser) {
        markSessionActive();
      }
    };

    void syncUser();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ? {
        id: session.user.id,
        email: session.user.email ?? "",
        displayName: session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? null,
      } : null;

      if (active) {
        if (nextUser) {
          markSessionActive();
          setUser(nextUser);
          setStatus("signed-in");
          setIsSessionStaleValue(false);
        } else {
          setUser(null);
          setStatus("signed-out");
          setIsSessionStaleValue(false);
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(LAST_ACTIVITY_KEY);
          }
        }
      }
    });

    const activityEvents = ["click", "keydown", "pointerdown", "touchstart", "mousemove"] as const;
    const handleActivity = () => {
      if (status === "signed-in") {
        markSessionActive();
        setIsSessionStaleValue(false);
      }
    };

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity);
    });

    const staleCheck = window.setInterval(() => {
      const stale = isSessionStale();
      setIsSessionStaleValue(stale && status === "signed-in");
      if (stale && status === "signed-in") {
        setUser(null);
        setStatus("signed-out");
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(LAST_ACTIVITY_KEY);
        }
        void authService.signOut().catch(() => undefined);
      }
    }, 30_000);

    return () => {
      active = false;
      data.subscription.unsubscribe();
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      window.clearInterval(staleCheck);
    };
  }, [status]);

  return <AuthContext.Provider value={{ status, user, service, isSessionStale: isSessionStaleValue }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
