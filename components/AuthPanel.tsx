"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Loader2, Pencil, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { requestSignUpToken } from "./signup-action";
import { Input } from "@/components/ui/input";
import { PrimaryCTA } from "@/components/motion/PrimaryCTA";
import { spring } from "@/components/motion/tokens";

// Validates university email domain format only; shows a verification badge.
const UNIVERSITY_EMAIL_RE = /^[^\s@]+@([a-z0-9-]+\.)*edu\.au$/i;

export type AuthMode = "signin" | "signup";
type Step = "email" | "password";

export interface AuthPanelProps {
  className?: string;
  defaultMode?: AuthMode;
}

/**
 * Supabase email/password flow presented as a staged, iCloud-style reveal.
 * Step 1 takes the university email; on continue the email collapses into a
 * compact locked pill and step 2 slides the password field in beneath it, the
 * glass card's height morphing fluidly between the two. All auth logic
 * (domain check, signup-token exchange, signin, profile routing) is unchanged.
 * Routes new users to /onboarding and returning users to /home.
 */
export function AuthPanel({ className, defaultMode = "signin" }: AuthPanelProps) {
  const router = useRouter();
  const reduce = useReducedMotion();

  const [mode, setMode] = React.useState<AuthMode>(defaultMode);
  const [step, setStep] = React.useState<Step>("email");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);

  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  const isUniversityEmail = UNIVERSITY_EMAIL_RE.test(email.trim());
  const isSignin = mode === "signin";

  // Move focus with the flow: to the password when it reveals, back to the
  // email when the pill is edited. Skips the very first mount.
  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const target = step === "password" ? passwordRef.current : emailRef.current;
    target?.focus();
  }, [step]);

  function switchMode(next: AuthMode) {
    setMode(next);
    setStep("email");
    setError(null);
    setNotice(null);
  }

  function editEmail() {
    setStep("email");
    setError(null);
    setNotice(null);
  }

  // One form, two commit points: in the email step "submit" (Enter or the
  // continue arrow) only advances; in the password step it authenticates.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!isUniversityEmail) {
      setError("Use a university email, e.g. name@uni.sydney.edu.au");
      return;
    }

    if (step === "email") {
      setStep("password");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    // Signup: skip the real Supabase confirmation email entirely (its shared
    // SMTP is rate-limited → "email rate limit exceeded"). The account is
    // created server-side, pre-confirmed, and we exchange a minted token for
    // a real session, no email round trip. See signup-action.ts.
    if (mode === "signup") {
      const result = await requestSignUpToken(trimmedEmail, password);
      if (!result.ok) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: result.tokenHash,
        type: "magiclink",
      });
      if (verifyError) {
        setError(verifyError.message);
        setSubmitting(false);
        return;
      }

      router.push("/onboarding");
      router.refresh();
      return;
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (authError) {
      setError(authError.message);
      setSubmitting(false);
      return;
    }

    if (!data.session || !data.user) {
      setError("Could not start a session. Please try again.");
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

  // Cross-fade only under reduced motion; otherwise rise + de-blur.
  const stepTransition = reduce ? { duration: 0.2 } : spring.gentle;
  const enter = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: -8, filter: "blur(6px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        exit: { opacity: 0, y: -8, filter: "blur(6px)" },
      };
  // Opacity-only for the two email branches: the shared `email-surface`
  // layoutId morphs the box position/size, so a y offset would fight it.
  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  return (
    <motion.form
      onSubmit={handleSubmit}
      layout
      transition={stepTransition}
      data-auth-mode={mode}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative isolate w-full max-w-sm overflow-hidden rounded-[28px] p-7 text-left sm:p-8",
        // Frosted material: a neutral white-glass tint shades the busy hero flow
        // behind it so text stays legible, over a heavy blur + saturation, with
        // a hairline glass border and a deep, lifted shadow so the card floats
        // above the scene. The top-lit sheen is a separate layer below (a bg
        // gradient utility here would be collapsed with the tint by cn()).
        "border border-white/20 bg-neutral-900/80",
        "backdrop-blur-2xl backdrop-saturate-150",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.10)_inset,0_2px_1px_-1px_rgba(255,255,255,0.06)_inset,0_40px_80px_-32px_rgba(0,0,0,0.85)]",
        className,
      )}
    >
      {/* Static frost layers: a specular sheen sweeping the top edge and a fine
          grain. pointer-events-none, never animated. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(120%_80%_at_50%_-20%,rgba(255,255,255,0.14),transparent_55%)]"
      />
      <div
        aria-hidden
        className="noise-grain pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.05] mix-blend-overlay"
      />

      <div className="relative">
        {/* Header: contextual, no tab toggle (moved to the link at the foot). */}
        <motion.div layout="position" className="space-y-1.5">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {isSignin ? "Sign in" : "Create your account"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isSignin
              ? "Welcome back. Continue with your university email."
              : "Join with your university email. Students only."}
          </p>
        </motion.div>

        {/* Email: a full labeled field in step 1, collapsing into a locked pill
            in step 2. The shared layoutId glides the surface between the two. */}
        <div className="mt-6">
          <AnimatePresence initial={false} mode="popLayout">
            {step === "email" ? (
              <motion.div
                key="email-field"
                layout="position"
                {...fade}
                transition={stepTransition}
                className="space-y-1.5"
              >
                <label htmlFor="auth-email" className="text-sm font-medium text-foreground">
                  University email
                </label>
                <motion.div layoutId="email-surface" transition={stepTransition} className="relative">
                  <Input
                    ref={emailRef}
                    id="auth-email"
                    type="email"
                    inputMode="email"
                    autoComplete={isSignin ? "username" : "email"}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="name@uni.sydney.edu.au"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={Boolean(error) && !isUniversityEmail}
                    aria-describedby={isUniversityEmail ? "auth-email-verified" : undefined}
                    className="pr-12"
                    required
                  />
                  {/* iCloud-style continue arrow: advances to the password step. */}
                  <button
                    type="submit"
                    disabled={!isUniversityEmail}
                    aria-label="Continue"
                    className={cn(
                      "absolute inset-y-0 right-1.5 my-auto flex h-9 w-9 items-center justify-center rounded-full transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isUniversityEmail
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm hover:bg-[var(--accent-hover)]"
                        : "cursor-not-allowed bg-white/10 text-muted-foreground",
                    )}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </motion.div>
                <AnimatePresence>
                  {isUniversityEmail && (
                    <motion.p
                      id="auth-email-verified"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-1.5 text-xs font-medium text-success"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      University verified
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.button
                key="email-pill"
                type="button"
                onClick={editEmail}
                layoutId="email-surface"
                {...fade}
                transition={stepTransition}
                aria-label={`Continuing as ${email.trim()}. Edit email.`}
                className="group flex w-full items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {email.trim()}
                </span>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Password: revealed only in step 2. */}
        <AnimatePresence initial={false}>
          {step === "password" && (
            <motion.div
              key="password-field"
              layout
              {...enter}
              transition={stepTransition}
              className="mt-4 space-y-1.5"
            >
              {/* The email input is unmounted in this step; keep a hidden
                  username field so password managers still associate the
                  credential (what real staged sign-ins do). */}
              <input
                type="email"
                name="username"
                autoComplete="username"
                value={email.trim()}
                readOnly
                tabIndex={-1}
                aria-hidden
                className="sr-only"
              />
              <label htmlFor="auth-password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <Input
                  ref={passwordRef}
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignin ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  className="pr-11"
                  aria-describedby={isSignin ? undefined : "auth-password-hint"}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {!isSignin && (
                <p id="auth-password-hint" className="text-xs text-muted-foreground">
                  At least 8 characters.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <motion.p layout="position" role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </motion.p>
        )}
        {notice && (
          <motion.p layout="position" className="mt-3 text-sm text-muted-foreground">
            {notice}
          </motion.p>
        )}

        {/* Sign-in / create only surfaces in the password step; the arrow drives
            step 1. */}
        <AnimatePresence initial={false}>
          {step === "password" && (
            <motion.div key="submit-cta" layout {...enter} transition={stepTransition}>
              <PrimaryCTA
                type="submit"
                disabled={submitting}
                fullWidth
                className="mt-6 w-full justify-center"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Please wait…" : isSignin ? "Sign in" : "Create account"}
              </PrimaryCTA>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reassurance line, Apple-style. */}
        <motion.p
          layout="position"
          className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
        >
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            University email only. We never post or share it.
          </span>
        </motion.p>

        {/* Mode switch: the only place to flip between flows. */}
        <motion.p
          layout="position"
          className="mt-5 border-t border-border/60 pt-4 text-center text-sm text-muted-foreground"
        >
          {isSignin ? "New to Project Alpha?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => switchMode(isSignin ? "signup" : "signin")}
            className="rounded-sm font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isSignin ? "Create account" : "Sign in"}
          </button>
        </motion.p>
      </div>
    </motion.form>
  );
}
