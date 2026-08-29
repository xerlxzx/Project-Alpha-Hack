"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { requestDemoLoginToken } from "./demo-login-action";

export interface DemoLoginProps {
  className?: string;
}

/**
 * "Enter demo" signs the browser in as the seeded fresh first-run user
 * (00000000-0000-0000-0001-000000000013), which has no profile yet, so the
 * demo starts at onboarding/setup and the whole journey is walkable without a
 * real university email. Once onboarding is saved, later entries go straight
 * to /home. See demo-login-action.ts for how the session is minted; this
 * component only ever sees a token hash, never the service-role key.
 */
export function DemoLogin({ className }: DemoLoginProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);

    const result = await requestDemoLoginToken();
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }

    const supabase = createClient();
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: result.tokenHash,
      type: "magiclink",
    });

    if (verifyError || !data.user) {
      setError(verifyError?.message ?? "Could not start the demo session.");
      setPending(false);
      return;
    }

    // The seeded demo user starts with no profile, so first entry runs the
    // full onboarding/setup flow; once that's saved, later entries land on
    // /home. Same profile gate the real login uses (see AuthPanel.tsx).
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();

    router.push(profile ? "/home" : "/onboarding");
    router.refresh();
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        data-landing-demo=""
        onClick={handleClick}
        disabled={pending}
        className={cn(
          "gap-2 rounded-full text-foreground",
          // Same neutral white glass as the auth card so the two surfaces read
          // as one material.
          "border-white/20 bg-neutral-900/80 backdrop-blur-2xl backdrop-saturate-150",
          "hover:bg-neutral-800/80 hover:text-foreground",
          "dark:border-white/20 dark:bg-neutral-900/80 dark:hover:bg-neutral-800/80",
          "shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_18px_40px_-24px_rgba(0,0,0,0.85)]",
        )}
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "Entering demo…" : "Enter demo"}
      </Button>
      {error && (
        <p role="alert" className={cn("mt-2 text-sm text-destructive")}>
          {error}
        </p>
      )}
    </div>
  );
}
