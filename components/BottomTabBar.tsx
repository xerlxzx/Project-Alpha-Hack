"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Home, MessageCircle, Users, User as UserIcon } from "lucide-react";

import { GlassPanel } from "@/components/GlassPanel";
import { LiquidGlassFilter, useRefractionSupported } from "@/components/LiquidGlass";
import { cn } from "@/lib/utils";

interface TabDef {
  href: string;
  /** Path prefixes that count as this tab being active. */
  match: string[];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const FILTER_ID = "liquid-glass-tab";

// Meetup/Messages route through app/(app)/meetup and app/(app)/messages,
// which redirect to the active meetup (or a sensible fallback) server-side.
// /match carries the forming-meetup flow, so it counts toward the Meetup tab.
const TABS: TabDef[] = [
  { href: "/home", match: ["/home"], label: "Home", icon: Home },
  { href: "/meetup", match: ["/meetup", "/match"], label: "Meetup", icon: Users },
  { href: "/messages", match: ["/messages"], label: "Messages", icon: MessageCircle },
  { href: "/profile", match: ["/profile"], label: "Profile", icon: UserIcon },
];

/**
 * Bottom nav, present on every authenticated app screen.
 *
 * The selected tab is an iOS 26 "Liquid Glass" capsule that shares-element
 * animates between tabs (`layoutId`) and refracts the content behind it. The
 * refraction is a Chromium-only backdrop SVG filter; other engines fall back to
 * the frosted `backdrop-blur` capsule, which still reads as glass.
 */
export function BottomTabBar() {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const refractionSupported = useRefractionSupported();

  const tabs = TABS;

  const activeIndex = tabs.findIndex((tab) =>
    tab.match.some((prefix) => pathname?.startsWith(prefix)),
  );

  // Measure the selected cell so the refraction map is baked at its real size.
  const [dims, setDims] = React.useState({ w: 0, h: 0 });
  const activeElRef = React.useRef<HTMLElement | null>(null);

  const measure = React.useCallback(() => {
    const el = activeElRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDims((prev) =>
      Math.abs(prev.w - rect.width) < 0.5 && Math.abs(prev.h - rect.height) < 0.5
        ? prev
        : { w: rect.width, h: rect.height },
    );
  }, []);

  const setActiveEl = React.useCallback(
    (node: HTMLElement | null) => {
      activeElRef.current = node;
      measure();
    },
    [measure],
  );

  React.useEffect(() => {
    measure();
    const el = activeElRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, activeIndex, tabs.length]);

  const radius = dims.h ? dims.h / 2 : 999;

  return (
    <motion.nav
      aria-label="Primary"
      initial={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 130, damping: 20, mass: 0.9 }}
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {refractionSupported && dims.w > 0 && (
        <LiquidGlassFilter id={FILTER_ID} width={dims.w} height={dims.h} radius={radius} />
      )}

      <GlassPanel
        withTextBacking
        backingClassName="bg-surface/60 dark:bg-surface/35"
        className="mx-auto flex max-w-md items-center justify-around gap-1 rounded-full p-1.5"
      >
        {tabs.map((tab, index) => {
          const active = index === activeIndex;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              ref={active ? setActiveEl : undefined}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 rounded-full px-3 py-2",
                "text-[0.7rem] font-medium transition-colors duration-200",
                active
                  ? "text-[var(--accent)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="tab-glass-pill"
                  aria-hidden
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 380, damping: 34, mass: 0.9 }
                  }
                  className={cn(
                    "absolute inset-0 -z-10 overflow-hidden rounded-full",
                    "border border-white/40 dark:border-white/20",
                    // Luminous raised glass: a soft top-lit sheen, brighter than
                    // the bar so the selected capsule reads as lifted.
                    "bg-gradient-to-b from-white/25 to-white/5 dark:from-white/15 dark:to-white/[0.03]",
                    "shadow-[inset_0_1px_1px_rgba(255,255,255,0.65),inset_0_-1px_2px_rgba(0,0,0,0.18),0_8px_22px_-8px_rgba(0,0,0,0.5)]",
                    // Frosted-glass fallback, always present, augmented by the
                    // refraction filter on Chromium via the inline style below.
                    "backdrop-blur-md backdrop-saturate-150",
                  )}
                  style={
                    refractionSupported && dims.w > 0
                      ? {
                          backdropFilter: `blur(5px) saturate(160%) url(#${FILTER_ID})`,
                          WebkitBackdropFilter: `blur(5px) saturate(160%)`,
                        }
                      : undefined
                  }
                />
              )}
              <motion.span
                className="flex flex-col items-center gap-0.5"
                whileTap={reduce ? undefined : { scale: 0.92 }}
                transition={{ type: "spring", stiffness: 400, damping: 26 }}
              >
                <Icon className="h-5 w-5" />
                {tab.label}
              </motion.span>
            </Link>
          );
        })}
      </GlassPanel>
    </motion.nav>
  );
}
