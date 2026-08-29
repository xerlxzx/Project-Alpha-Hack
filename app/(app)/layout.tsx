import type { ReactNode } from "react";

import { BottomTabBar } from "@/components/BottomTabBar";

// Wraps every authenticated app screen (home, meetup, messages, profile, ...).
// The tab bar is always present here; landing (app/page.tsx) and onboarding
// sit outside this group so they render without it.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      {children}
      <BottomTabBar />
    </div>
  );
}
