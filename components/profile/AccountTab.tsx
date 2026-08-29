"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

export interface AccountTabProps {
  isDemo: boolean;
}

export function AccountTab({ isDemo }: AccountTabProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (isDemo) {
    return (
      <div className="rounded-xl border border-border bg-background p-4">
        <p className="text-sm font-medium text-foreground">Demo mode</p>
        <p className="mt-1 text-xs text-muted-foreground">
          You&apos;re viewing Project Alpha as the seeded demo account, not a
          real session, so there&apos;s nothing to sign out of.
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-destructive/30 px-5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
    >
      <LogOut className="size-4" />
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
