export interface AuthUser {
  id: string;
  email: string;
  displayName?: string | null;
}

export type AuthStatus = "unconfigured" | "loading" | "signed-out" | "signed-in";

export interface AuthResult {
  user: AuthUser | null;
  error: string | null;
  confirmationRequired?: boolean;
}

/** Provider-neutral contract for account and session operations. */
export interface AuthService {
  getCurrentUser(): Promise<AuthUser | null>;
  signInWithPassword(email: string, password: string, rememberMe: boolean): Promise<AuthResult>;
  signUp(email: string, password: string, displayName: string): Promise<AuthResult>;
  resendSignupConfirmation(email: string): Promise<{ error: string | null }>;
  requestPasswordReset(email: string): Promise<{ error: string | null }>;
  updatePassword(password: string): Promise<{ error: string | null }>;
  signOut(): Promise<{ error: string | null }>;
}
