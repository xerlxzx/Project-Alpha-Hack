import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { ThemeProvider, ThemeToggle } from "@/components/theme-provider";
import { BottomTabBar } from "@/components/BottomTabBar";
import { getServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import "./globals.css";

const fontDisplay = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
});

const fontSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Momentum — stop scrolling, start doing",
  description:
    "Momentum matches university students with compatible people nearby, then an AI agent finds a real place to meet. You just say yes.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#EA7317",
};

// Seeded demo user (supabase/seed.sql, see task-1.2-report.md). Used only as
// a fallback when no auth session exists yet, so the hybrid nav still demos
// correctly ahead of Task 4.1's sign-in/demo-login flow setting a real one.
const DEMO_USER_ID = "00000000-0000-0000-0001-000000000001";

interface NavState {
  showTabBar: boolean;
  activeMeetupId: string | null;
}

// Hybrid nav (DESIGN_DIRECTION.md "Navigation"): the bottom tab bar appears
// only once a user has an active meetup or a completed one in their history.
// A simple membership query decides it — wrapped in try/catch so a missing
// Supabase session/env or an unapplied migration degrades to the new/idle
// (no tab bar) experience instead of crashing the whole app shell.
async function getNavState(): Promise<NavState> {
  try {
    const supabase = await getServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? DEMO_USER_ID;

    const { data, error } = await supabase
      .from("meetup_members")
      .select("meetup_id, accepted, meetups(status)")
      .eq("user_id", userId)
      .eq("accepted", true);

    if (error || !data || data.length === 0) {
      return { showTabBar: false, activeMeetupId: null };
    }

    type Row = {
      meetup_id: string;
      meetups: { status: string } | { status: string }[] | null;
    };
    const rows = data as unknown as Row[];
    const statusOf = (row: Row) =>
      Array.isArray(row.meetups) ? row.meetups[0]?.status : row.meetups?.status;

    const active = rows.find((row) => {
      const status = statusOf(row);
      return status === "confirmed" || status === "forming";
    });
    const hasHistory = rows.some((row) => statusOf(row) === "completed");

    return {
      showTabBar: Boolean(active) || hasHistory,
      activeMeetupId: active?.meetup_id ?? null,
    };
  } catch {
    return { showTabBar: false, activeMeetupId: null };
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nav = await getNavState();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontDisplay.variable} ${fontSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className={cn(
          "min-h-full flex flex-col",
          nav.showTabBar && "pb-[calc(4.5rem+env(safe-area-inset-bottom))]",
        )}
      >
        <ThemeProvider>
          {children}
          {nav.showTabBar && (
            <BottomTabBar activeMeetupId={nav.activeMeetupId} />
          )}
          <ThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
