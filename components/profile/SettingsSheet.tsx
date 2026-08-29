"use client";

import type { ReactElement } from "react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileTab } from "@/components/profile/ProfileTab";
import { PreferencesTab } from "@/components/profile/PreferencesTab";
import { NotificationsTab } from "@/components/profile/NotificationsTab";
import { AccountTab } from "@/components/profile/AccountTab";

export interface SettingsSheetProps {
  trigger: ReactElement;
  isDemo: boolean;
  profile: {
    firstName: string;
    photoUrl: string | null;
    ageRange: string | null;
    university: string;
    courseYear: string | null;
  };
  preferences: {
    weeklyGoal: number;
    travelKm: number | null;
    budgetAud: number | null;
    interests: string[];
    genderPref: string | null;
    languagePref: string | null;
    accessibility: string | null;
    socialEnergy: string | null;
    notifyMatchFound: boolean;
    notifyMeetupReminders: boolean;
    notifyWeeklySummary: boolean;
  };
}

export function SettingsSheet({ trigger, isDemo, profile, preferences }: SettingsSheetProps) {
  return (
    <Sheet>
      <SheetTrigger render={trigger} />
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border-border p-0"
      >
        <SheetHeader className="border-b border-border px-5 pt-5 pb-4">
          <SheetTitle className="text-lg">Settings</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="profile" className="min-h-0 flex-1 overflow-hidden px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <TabsList className="mt-4 w-full">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="notifications">Alerts</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>

          <div className="mt-5 min-h-0 flex-1 overflow-y-auto pb-6">
            <TabsContent value="profile">
              <ProfileTab
                firstName={profile.firstName}
                photoUrl={profile.photoUrl}
                ageRange={profile.ageRange}
                university={profile.university}
                courseYear={profile.courseYear}
                weeklyGoal={preferences.weeklyGoal}
              />
            </TabsContent>
            <TabsContent value="preferences">
              <PreferencesTab
                travelKm={preferences.travelKm}
                budgetAud={preferences.budgetAud}
                interests={preferences.interests}
                genderPref={preferences.genderPref}
                languagePref={preferences.languagePref}
                accessibility={preferences.accessibility}
                socialEnergy={preferences.socialEnergy}
              />
            </TabsContent>
            <TabsContent value="notifications">
              <NotificationsTab
                notifyMatchFound={preferences.notifyMatchFound}
                notifyMeetupReminders={preferences.notifyMeetupReminders}
                notifyWeeklySummary={preferences.notifyWeeklySummary}
              />
            </TabsContent>
            <TabsContent value="account">
              <AccountTab isDemo={isDemo} />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
