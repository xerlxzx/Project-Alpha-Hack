"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { PrimaryCTA } from "@/components/motion/PrimaryCTA";
import { spring } from "@/components/motion/tokens";

// Validates university email domain format only; shows a verification badge.
const UNIVERSITY_EMAIL_RE = /^[^\s@]+@([a-z0-9-]+\.)*edu\.au$/i;

export type AuthMode = "signin" | "signup";

export interface AuthPanelProps {
  className?: string;
  defaultMode?: AuthMode;
}

/**
 * Supabase email/password flow with a simulated university-domain check.
 * Routes new users to /onboarding and returning users to /home.
 */
export function AuthPanel({ className, defaultMode = "signin" }: AuthPanelProps) {
  const router = useRouter();
  const [mode, setMode] = React.useState<AuthMode>(defaultMode);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const isUniversityEmail = UNIVERSITY_EMAIL_RE.test(email.trim());

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!isUniversityEmail) {
      setError("Use a university email, e.g. name@youruni.edu.au");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    const { data, error: authError } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
        : await supabase.auth.signUp({ email: trimmedEmail, password });

    if (authError) {
      setError(authError.message);
      setSubmitting(false);
      return;
    }

    if (!data.session || !data.user) {
      setNotice("Check your inbox to confirm your email, then sign in.");
      setMode("signin");
      setSubmitting(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();

    router.push(profile ? "/home" : "/onboarding");
    router.refresh();
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.gentle}
      className={cn(
        "w-full max-w-sm rounded-3xl border border-border bg-card/50 p-6 backdrop-blur-sm sm:p-7",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <button
          type="button"
          onClick={() => switchMode("signin")}
          className={cn(
            "rounded-full px-3 py-1 transition-colors",
            mode === "signin" ? "bg-foreground text-background" : "hover:text-foreground",
          )}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchMode("signup")}
          className={cn(
            "rounded-full px-3 py-1 transition-colors",
            mode === "signup" ? "bg-foreground text-background" : "hover:text-foreground",
          )}
        >
          Create account
        </button>
      </div>

      <div className="mt-5 space-y-1.5">
        <label htmlFor="auth-email" className="text-sm font-medium text-foreground">
          University email
        </label>
        <Input
          id="auth-email"
          type="email"
          autoComplete="email"
          placeholder="name@youruni.edu.au"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <AnimatePresence>
          {isUniversityEmail && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              University verified ✓
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 space-y-1.5">
        <label htmlFor="auth-password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <Input
          id="auth-password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && <p className="mt-3 text-sm text-muted-foreground">{notice}</p>}

      <PrimaryCTA type="submit" disabled={submitting} className="mt-5 w-full justify-center">
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
      </PrimaryCTA>
    </motion.form>
  );
}
