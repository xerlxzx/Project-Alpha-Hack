"use client"

import * as React from "react"

import { AgentProgress, type AgentStep, type MapPin } from "@/components/AgentProgress"

// Camperdown/Newtown coords for the standalone demo projection.
// One pin reuses the task-3.2 smoke-test venue at -33.8885267, 151.1757575.
const CENTER = { lat: -33.8886, lng: 151.1873 }

const DEMO_PINS: MapPin[] = [
  { placeId: "demo-1", lat: -33.8885267, lng: 151.1757575, label: "Camperdown Courts" },
  { placeId: "demo-2", lat: -33.8963, lng: 151.1793, label: "Newtown Sports Centre" },
  { placeId: "demo-3", lat: -33.8847, lng: 151.1935, label: "Victoria Park Courts" },
  { placeId: "demo-4", lat: -33.8908, lng: 151.1962, label: "Sydney Uni Sports & Fitness", selected: true },
]

function buildSteps(stage: number): AgentStep[] {
  const found = DEMO_PINS.length
  const definitions: Array<Omit<AgentStep, "status">> = [
    { key: "analyze", label: "Analyzing group interests" },
    { key: "search", label: "Searching Google Places" },
    { key: "found", label: `Found ${found} candidates` },
    { key: "rank", label: "Ranking by fit" },
    { key: "selected", label: "Selected: Sydney Uni Sports & Fitness", detail: "Best match for shared interests + travel" },
  ]

  return definitions.map((def, i) => ({
    ...def,
    status: i < stage ? "done" : i === stage ? "active" : "pending",
  }))
}

/** Standalone timer-driven AgentProgress mock. Live match uses the same shapes. */
export default function AgentProgressDemo() {
  const [stage, setStage] = React.useState(0)
  const [visiblePins, setVisiblePins] = React.useState(0)

  React.useEffect(() => {
    if (stage >= 4) return
    const t = setTimeout(() => setStage((s) => s + 1), 1400)
    return () => clearTimeout(t)
  }, [stage])

  React.useEffect(() => {
    // Pins arrive during the "Searching Google Places" -> "Found N" steps.
    if (stage < 1 || visiblePins >= DEMO_PINS.length) return
    const t = setTimeout(() => setVisiblePins((n) => n + 1), 500)
    return () => clearTimeout(t)
  }, [stage, visiblePins])

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <AgentProgress steps={buildSteps(stage)} pins={DEMO_PINS.slice(0, visiblePins)} center={CENTER} boundsKm={4} />
    </div>
  )
}
