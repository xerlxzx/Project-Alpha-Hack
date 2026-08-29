import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { getActiveMeetup, getCurrentUser } from "@/lib/current-user";

const PANEL =
  "rounded-2xl bg-card ring-1 ring-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-1px_0_rgba(255,255,255,0.02),0_2px_6px_rgba(0,0,0,0.55),0_14px_32px_-24px_rgba(255,255,255,0.08)]";

// Bottom-nav "Messages" tab target. Chat only exists once a meetup is
// confirmed (components/ChatThread.tsx, embedded in app/meetup/[id]), so a
// confirmed meetup jumps straight there; otherwise this shows an empty state.
export default async function MessagesTabPage() {
  const user = await getCurrentUser();
  const active = user ? await getActiveMeetup(user.id) : null;

  if (active?.status === "confirmed") {
    redirect(`/meetup/${active.id}#group-chat`);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className={`flex flex-col items-center gap-3 p-8 ${PANEL}`}>
        <MessageCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No messages yet</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          You&apos;ll be able to chat here once your group is confirmed.
        </p>
      </div>
    </main>
  );
}
