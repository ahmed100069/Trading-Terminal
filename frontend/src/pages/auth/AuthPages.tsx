import { useState, type FormEvent, type ReactNode } from "react";

import { AuthLayout } from "../../components/auth/AuthLayout";
import { useAuth } from "../../auth/AuthContext";

const inputClassName = "mt-2 w-full rounded-xl border border-ink/12 bg-white px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-leaf focus:ring-2 focus:ring-leaf/10";
const primaryButtonClassName = "w-full rounded-xl bg-leaf px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,138,113,0.18)] transition hover:bg-leaf/90 disabled:cursor-not-allowed disabled:opacity-50";

function AuthField({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block text-sm font-medium text-ink/80">
      {label}
      <input
        className={inputClassName}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        placeholder={type === "email" ? "name@example.com" : undefined}
      />
    </label>
  );
}

function AuthSubmit({ children, disabled = false }: { children: string; disabled?: boolean }) {
  return <button type="submit" disabled={disabled} className={primaryButtonClassName}>{children}</button>;
}

function AuthFooter({ children }: { children: ReactNode }) {
  return <p className="mt-6 text-center text-sm text-ink/55">{children}</p>;
}

function AuthError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{message}</p>;
}

export function LoginPage() {
  const { service } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleResendConfirmation() {
    if (!service || !confirmationEmail) return;
    setResending(true);
    const result = await service.resendSignupConfirmation(confirmationEmail);
    setResending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setSuccess("A new confirmation email has been sent.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setConfirmationEmail(null);

    if (!service) {
      setError("Supabase is not configured. Add your environment variables first.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const rememberMe = Boolean(form.get("rememberMe"));

    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    setSubmitting(true);
    const result = await service.signInWithPassword(email, password, rememberMe);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      if (result.confirmationRequired) setConfirmationEmail(email);
      return;
    }

    window.location.assign("/app/markets");
  }

  return (
    <AuthLayout title="Sign in" description="Sign in to access your Trading Terminal account.">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <AuthField label="Email" name="email" type="email" autoComplete="email" />
        <AuthField label="Password" name="password" type="password" autoComplete="current-password" />
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <label className="flex items-center gap-2 text-ink/65">
            <input type="checkbox" name="rememberMe" className="h-4 w-4 rounded border-ink/20 accent-leaf" />
            Remember me
          </label>
          <a className="font-semibold text-leaf-700 hover:underline" href="/forgot-password">Forgot password?</a>
        </div>
        <AuthError message={error} />
        {success ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{success}</p> : null}
        {confirmationEmail ? <button type="button" onClick={() => void handleResendConfirmation()} disabled={resending} className="text-sm font-semibold text-leaf-700 hover:underline disabled:opacity-50">{resending ? "SENDING..." : "Resend confirmation email"}</button> : null}
        <AuthSubmit disabled={submitting}>{submitting ? "SIGNING IN..." : "SIGN IN"}</AuthSubmit>
      </form>
      <AuthFooter>Don’t have an account? <a className="font-semibold text-leaf-700 hover:underline" href="/register">Create account</a></AuthFooter>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { service } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleResendConfirmation() {
    if (!service || !confirmationEmail) return;
    setResending(true);
    const result = await service.resendSignupConfirmation(confirmationEmail);
    setResending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setSuccess("A new confirmation email has been sent.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!service) {
      setError("Supabase is not configured. Add your environment variables first.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("displayName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (!displayName || !email || !password || !confirmPassword) {
      setError("Full name, email, and both password fields are required.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setSubmitting(true);
    const result = await service.signUp(email, password, displayName);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.confirmationRequired) {
      setConfirmationEmail(email);
      setSuccess("Account created. Check your inbox and confirm your email before signing in.");
      return;
    }

    window.location.assign("/login");
  }

  return (
    <AuthLayout title="Create your account" description="Create an account to access the Trading Terminal.">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <AuthField label="Full name" name="displayName" autoComplete="name" />
        <AuthField label="Email" name="email" type="email" autoComplete="email" />
        <AuthField label="Password" name="password" type="password" autoComplete="new-password" />
        <AuthField label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" />
        <AuthError message={error} />
        {success ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{success}</p> : null}
        {confirmationEmail ? <button type="button" onClick={() => void handleResendConfirmation()} disabled={resending} className="text-sm font-semibold text-leaf-700 hover:underline disabled:opacity-50">{resending ? "SENDING..." : "Resend confirmation email"}</button> : null}
        <AuthSubmit disabled={submitting}>{submitting ? "CREATING ACCOUNT..." : "CREATE ACCOUNT"}</AuthSubmit>
      </form>
      <AuthFooter>Already have an account? <a className="font-semibold text-leaf-700 hover:underline" href="/login">Sign in</a></AuthFooter>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { service } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!service) {
      setError("Supabase is not configured. Add your environment variables first.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (!email) {
      setError("Email is required.");
      return;
    }

    setSubmitting(true);
    const result = await service.requestPasswordReset(email);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSuccess("A password reset link has been sent to your email.");
  }

  return (
    <AuthLayout title="Forgot your password?" description="Enter the email associated with your account and we’ll send a reset link.">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <AuthField label="Email" name="email" type="email" autoComplete="email" />
        <AuthError message={error} />
        {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{success}</p> : null}
        <AuthSubmit disabled={submitting}>{submitting ? "SENDING..." : "SEND RESET LINK"}</AuthSubmit>
      </form>
      <AuthFooter><a className="font-semibold text-leaf-700 hover:underline" href="/login">Back to sign in</a></AuthFooter>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { service } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!service) {
      setError("Supabase is not configured. Add your environment variables first.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (!password || !confirmPassword) {
      setError("Both password fields are required.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const result = await service.updatePassword(password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSuccess("Password updated successfully. You can sign in with your new password.");
    window.setTimeout(() => {
      window.location.assign("/login");
    }, 1500);
  }

  return (
    <AuthLayout title="Set a new password" description="Choose a new password to finish the reset flow.">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <AuthField label="New password" name="password" type="password" autoComplete="new-password" />
        <AuthField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" />
        <AuthError message={error} />
        {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{success}</p> : null}
        <AuthSubmit disabled={submitting}>{submitting ? "UPDATING..." : "UPDATE PASSWORD"}</AuthSubmit>
      </form>
      <AuthFooter><a className="font-semibold text-leaf-700 hover:underline" href="/login">Back to sign in</a></AuthFooter>
    </AuthLayout>
  );
}
