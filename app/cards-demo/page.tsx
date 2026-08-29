import { notFound } from "next/navigation";

import { GroupPreview } from "@/components/GroupPreview";
import { ProposalCard } from "@/components/ProposalCard";

/**
 * TEMPORARY eyeball route for Task 4.5 (ProposalCard + GroupPreview) — not
 * linked from any nav. A later task wires these to live match/venue data
 * and this route can be deleted then. Guarded out of production builds so
 * it never ships as a real page.
 */
export default function CardsDemoPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm font-medium text-muted-foreground">
          ProposalCard — within budget/distance
        </h2>
        <ProposalCard
          activityTitle="Coffee & board games"
          venueName="Toby's Estate"
          address="129 Chippendale Way, Chippendale NSW"
          photoUrl={null}
          openNow
          estimatedDistanceKm={1.2}
          estimatedCostAud={18}
          reason="Everyone in the group tagged board games and specialty coffee as shared interests."
          mapsUrl="https://maps.google.com/?q=Toby%27s+Estate+Chippendale"
          bookingUrl="https://example.com/book"
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm font-medium text-muted-foreground">
          ProposalCard — over budget & over distance
        </h2>
        <ProposalCard
          activityTitle="Rock climbing session"
          venueName="Climb Fit Sydney"
          address="88 Foveaux St, Surry Hills NSW"
          photoUrl={null}
          openNow={false}
          estimatedDistanceKm={6.4}
          estimatedCostAud={42}
          reason="Matched on your shared interest in climbing and trying new active hobbies."
          overBudgetPreference
          overDistancePreference
          mapsUrl="https://maps.google.com/?q=Climb+Fit+Sydney"
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm font-medium text-muted-foreground">
          GroupPreview — anonymous, pre-acceptance
        </h2>
        <GroupPreview
          size={4}
          genderMix="Mixed gender"
          ageRanges={["20-22", "23-25"]}
          sharedInterests={["Board games", "Coffee", "Live music", "Hiking"]}
          verifiedCount={4}
          compatibilityReason="You all matched on board games and a preference for low-key weeknight catchups."
        />
      </section>
    </div>
  );
}
