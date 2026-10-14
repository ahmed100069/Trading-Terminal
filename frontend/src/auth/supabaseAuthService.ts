import type { AuthResult, AuthService, AuthUser } from "./types";
import { clearStoredSupabaseSession, setSessionPersistence, supabase } from "../lib/supabase";

function mapUser(user: { id: string; email?: string | null; user_metadata?: { full_name?: string | null; name?: string | null } } | null): AuthUser | null {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? "",
    displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
  };
}

export class SupabaseAuthService implements AuthService {
  private getClient() {
    if (!supabase) {
      throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
    }
    return supabase;
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const { data, error } = await this.getClient().auth.getUser();
      return error ? null : mapUser(data.user);
    } catch {
      return null;
    }
  }

  async signInWithPassword(email: string, password: string, rememberMe: boolean): Promise<AuthResult> {
    try {
      const client = this.getClient();
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) {
        return { user: null, error: signOutError.message };
      }
      setSessionPersistence(rememberMe);
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        const message = error.code === "email_not_confirmed"
          ? "Confirm your email using the link we sent before signing in."
          : error.message;
        return {
          user: null,
          error: message,
          confirmationRequired: error.code === "email_not_confirmed",
        };
      }

      return {
        user: mapUser(data.user),
        error: null,
      };
    } catch (error) {
      return {
        user: null,
        error: error instanceof Error ? error.message : "Unable to sign in right now.",
      };
    }
  }

  async signUp(email: string, password: string, displayName: string): Promise<AuthResult> {
    try {
      const client = this.getClient();
      const redirectTo = `${window.location.origin}/login`;
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: displayName,
          },
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        return { user: null, error: error.message };
      }

      return {
        user: mapUser(data.user),
        error: null,
        confirmationRequired: data.session === null,
      };
    } catch (error) {
      return {
        user: null,
        error: error instanceof Error ? error.message : "Unable to create account right now.",
      };
    }
  }

  async resendSignupConfirmation(email: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.getClient().auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      return { error: error?.message ?? null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to resend the confirmation email." };
    }
  }

  async requestPasswordReset(email: string): Promise<{ error: string | null }> {
    try {
      const client = this.getClient();
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      return { error: error ? error.message : null };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unable to request password reset right now.",
      };
    }
  }

  async updatePassword(password: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.getClient().auth.updateUser({ password });
      return { error: error ? error.message : null };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unable to update password right now.",
      };
    }
  }

  async signOut(): Promise<{ error: string | null }> {
    try {
      const { error } = await this.getClient().auth.signOut();
      if (!error) clearStoredSupabaseSession();
      return { error: error?.message ?? null };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unable to sign out right now.",
      };
    }
  }
}
