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
 * "Enter demo" signs the browser in as the seeded active user
 * (00000000-0000-0000-0001-000000000001) so the whole journey is walkable
 * without a real university email. See demo-login-action.ts for how the
 * session is minted; this component only ever sees a token hash, never the
 * service-role key.
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
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: result.tokenHash,
      type: "magiclink",
    });

    if (verifyError) {
      setError(verifyError.message);
      setPending(false);
      return;
    }

    router.push("/home");
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
        className="gap-2 rounded-full"
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
