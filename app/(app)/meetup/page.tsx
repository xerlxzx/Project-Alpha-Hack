import { redirect } from "next/navigation";

import { getActiveMeetup, getCurrentUser } from "@/lib/current-user";

// Bottom-nav "Meetup" tab target. Routes to wherever the user's current
// meetup actually lives; with none yet, sends them to the browse feed.
export default async function MeetupTabPage() {
  const user = await getCurrentUser();
  const active = user ? await getActiveMeetup(user.id) : null;

  if (!active) {
    redirect("/meetups");
  }

  redirect(active.status === "confirmed" ? `/meetup/${active.id}` : `/match?meetupId=${active.id}`);
}
