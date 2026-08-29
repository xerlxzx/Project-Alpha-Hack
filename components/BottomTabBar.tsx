"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Home, Users, User as UserIcon } from "lucide-react";

import { GlassPanel } from "@/components/GlassPanel";
import { spring } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

export interface BottomTabBarProps {
  /** The user's current active meetup, if any — links straight into it. */
  activeMeetupId?: string | null;
  activeMeetupStatus?: "forming" | "confirmed" | null;
}

interface TabDef {
  href: string;
  match: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Hybrid-nav bottom bar (DESIGN_DIRECTION.md "Navigation", PRD §19). Rendered
 * only by app/layout.tsx once a user has an active meetup or history — new
 * and idle users never see this, keeping their flow single-action and
 * minimal-chrome. One of the four surfaces sanctioned for Liquid Glass.
 */
export function BottomTabBar({ activeMeetupId, activeMeetupStatus }: BottomTabBarProps) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  const tabs: TabDef[] = [
    { href: "/home", match: "/home", label: "Home", icon: Home },
    ...(activeMeetupId
      ? [
          {
            href:
              activeMeetupStatus === "confirmed"
                ? `/meetup/${activeMeetupId}`
                : `/match?meetupId=${activeMeetupId}`,
            match: activeMeetupStatus === "confirmed" ? `/meetup/${activeMeetupId}` : "/match",
            label: "Meetup",
            icon: Users,
          },
        ]
      : []),
    { href: "/profile", match: "/profile", label: "Profile", icon: UserIcon },
  ];

  return (
    <motion.nav
      aria-label="Primary"
      initial={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={spring.gentle}
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <GlassPanel
        withTextBacking
        className="mx-auto flex max-w-md items-center justify-around gap-1 rounded-full px-2 py-2"
      >
        {tabs.map((tab) => {
          const active = pathname?.startsWith(tab.match) ?? false;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-3 py-2 text-[0.7rem] font-medium transition-colors",
                active
                  ? "bg-[var(--accent)]/12 text-[var(--accent)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {tab.label}
            </Link>
          );
        })}
      </GlassPanel>
    </motion.nav>
  );
}
