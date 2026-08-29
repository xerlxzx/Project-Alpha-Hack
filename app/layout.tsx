import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { BottomTabBar } from "@/components/BottomTabBar";
import { getServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import "./globals.css";

// Single premium sans (Geist) drives both body and display tokens, an
// Apple/system-UI direction. Geist is variable, so `font-semibold`/`font-bold`
// headings across the app keep real weights (no synthetic faux-bold).
const fontSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Project Alpha — designed to be deleted",
  description:
    "Project Alpha matches university students with compatible people nearby, then an AI agent finds a real place to meet. You just say yes.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#171512", // deep warm-neutral; matches --background
};

// Seeded demo user (supabase/seed.sql, see task-1.2-report.md). Used only as
// a fallback when no auth session exists yet, so the hybrid nav still demos
// correctly ahead of Task 4.1's sign-in/demo-login flow setting a real one.
const DEMO_USER_ID = "00000000-0000-0000-0001-000000000001";

interface NavState {
  showTabBar: boolean;
  activeMeetupId: string | null;
  activeMeetupStatus: "forming" | "confirmed" | null;
}

// Shows the bottom tab bar once a user has an active or completed meetup.
// Wrapped in try/catch so a missing session or unapplied migration degrades
// to the no-tab-bar experience instead of crashing the app shell.
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
      return { showTabBar: false, activeMeetupId: null, activeMeetupStatus: null };
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
      activeMeetupStatus:
        active && statusOf(active) === "confirmed" ? "confirmed" : active ? "forming" : null,
    };
  } catch {
    return { showTabBar: false, activeMeetupId: null, activeMeetupStatus: null };
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nav = await getNavState();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${fontSans.variable} ${geistMono.variable} h-full antialiased`}
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
            <BottomTabBar
              activeMeetupId={nav.activeMeetupId}
              activeMeetupStatus={nav.activeMeetupStatus}
            />
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
