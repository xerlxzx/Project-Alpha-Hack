"use client";

import { Settings } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GlassPanel } from "@/components/GlassPanel";
import { SettingsSheet, type SettingsSheetProps } from "@/components/profile/SettingsSheet";

export interface ProfileHeaderProps {
  profile: SettingsSheetProps["profile"];
  preferences: SettingsSheetProps["preferences"];
  isDemo: boolean;
}

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export function ProfileHeader({ profile, preferences, isDemo }: ProfileHeaderProps) {
  const subtitle = [profile.university, profile.courseYear].filter(Boolean).join(" · ");

  return (
    <GlassPanel
      withTextBacking
      backingClassName="bg-surface/60 dark:bg-surface/40"
      className="flex items-center gap-4 p-5"
    >
      <Avatar size="lg" className="size-16 shrink-0">
        <AvatarImage src={profile.photoUrl ?? undefined} alt="" />
        <AvatarFallback className="text-lg">{initials(profile.firstName)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-xl text-foreground">{profile.firstName}</h1>
        {subtitle && (
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>

      <SettingsSheet
        isDemo={isDemo}
        profile={profile}
        preferences={preferences}
        trigger={
          <button
            type="button"
            aria-label="Settings"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings className="size-5" />
          </button>
        }
      />
    </GlassPanel>
  );
}
