import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Project Alpha",
  description:
    "Project Alpha matches university students with compatible people nearby, then an AI agent finds a real place to meet. You just say yes.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#171512",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${fontSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
