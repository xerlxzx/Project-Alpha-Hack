"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Switch } from "@/components/ui/switch";
import { updateNotificationPrefs } from "@/app/(app)/profile/actions";

export interface NotificationsTabProps {
  notifyMatchFound: boolean;
  notifyMeetupReminders: boolean;
  notifyWeeklySummary: boolean;
}

const ROWS: {
  key: keyof NotificationsTabProps;
  label: string;
  description: string;
}[] = [
  {
    key: "notifyMatchFound",
    label: "Match found",
    description: "When you're placed into a forming group.",
  },
  {
    key: "notifyMeetupReminders",
    label: "Meetup reminders",
    description: "Ahead of a confirmed meetup you're part of.",
  },
  {
    key: "notifyWeeklySummary",
    label: "Weekly summary",
    description: "A recap of your momentum and streak each week.",
  },
];

export function NotificationsTab(props: NotificationsTabProps) {
  const router = useRouter();
  const [values, setValues] = React.useState(props);
  const [saving, setSaving] = React.useState(false);

  async function toggle(key: keyof NotificationsTabProps) {
    const next = { ...values, [key]: !values[key] };
    setValues(next);
    setSaving(true);
    await updateNotificationPrefs(next);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="mb-3 text-xs text-muted-foreground">
        These are saved preferences. Project Alpha doesn&apos;t send push
        notifications yet, so toggling these won&apos;t page your phone today
        &mdash; they&apos;ll take effect once that&apos;s built.
      </p>
      {ROWS.map((row) => (
        <div
          key={row.key}
          className="flex items-center justify-between gap-4 border-t border-border py-3.5 first:border-t-0"
        >
          <div>
            <p className="text-sm font-medium text-foreground">{row.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
          </div>
          <Switch
            checked={values[row.key]}
            onCheckedChange={() => toggle(row.key)}
            disabled={saving}
            aria-label={row.label}
          />
        </div>
      ))}
    </div>
  );
}
