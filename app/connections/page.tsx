import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/current-user"
import { ConnectionMap } from "@/components/ConnectionMap"

// Standalone view for the private connection map.
export default async function ConnectionsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    redirect("/")
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <ConnectionMap />
    </main>
  )
}
