"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// The site is dark-only. `forcedTheme` pins next-themes to the dark class on
// <html> (which the layout also hardcodes for zero-flash) so `dark:` utility
// variants (e.g. the glass surfaces) resolve correctly.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" forcedTheme="dark">
      {children}
    </NextThemesProvider>
  );
}
