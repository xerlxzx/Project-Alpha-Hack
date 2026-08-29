import { notFound } from "next/navigation"

import AgentProgressDemo from "@/components/AgentProgress.demo"

/**
 * Temporary eyeball route for Task 4.4 (AgentProgress screen). Not linked
 * from any nav. A later task wires the real screen to live match/venue data
 * and this route can be deleted then. Guarded out of production builds so
 * it never ships as a real page.
 */
export default function AgentDemoPage() {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }

  return <AgentProgressDemo />
}
