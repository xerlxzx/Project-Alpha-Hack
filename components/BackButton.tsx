"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * History-aware back control. Returns to wherever the user came from (home,
 * a match, a notification) rather than a hardcoded route. Falls back to /home
 * when there's no in-app history to pop, for example when the page was opened directly.
 */
export function BackButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push("/home");
        }
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full text-sm text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back
    </button>
  );
}
