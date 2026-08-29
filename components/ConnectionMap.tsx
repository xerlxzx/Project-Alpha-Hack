import { getCurrentUser } from "@/lib/current-user"
import { getAdminSupabase, getServerSupabase } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

// Private map linking the current user to friends through shared meetups.

export interface ConnectionMapFriend {
  userId: string
  firstName: string
  photoUrl: string | null
  /** The activity (from the meetup's recommendation) they met through. */
  activityTitle: string
  venueName: string | null
  meetupId: string | null
  connectedAt: string
}

export interface ConnectionMapProps {
  /**
   * Supply to render without hitting the database (embedding, tests, stories).
   * When omitted, the component self-fetches for the current user.
   */
  friends?: ConnectionMapFriend[]
  /** Centre-node label. */
  selfLabel?: string
  className?: string
}

interface FriendshipRow {
  user_a: string
  user_b: string
  via_meetup: string | null
  created_at: string
}

async function loadFriendsForCurrentUser(): Promise<ConnectionMapFriend[]> {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return []
  }

  // Authenticated sessions use owner-scoped RLS. The sessionless demo needs
  // the admin client because RLS has no auth.uid().
  const supabase = currentUser.isDemo ? getAdminSupabase() : await getServerSupabase()
  const userId = currentUser.id

  const { data: friendships } = await supabase
    .from("friendships")
    .select("user_a, user_b, via_meetup, created_at")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order("created_at", { ascending: true })

  const rows = (friendships ?? []) as FriendshipRow[]
  if (rows.length === 0) {
    return []
  }

  const otherIds = rows.map((row) => (row.user_a === userId ? row.user_b : row.user_a))
  const meetupIds = rows.map((row) => row.via_meetup).filter((value): value is string => Boolean(value))

  const [{ data: profiles }, { data: recommendations }] = await Promise.all([
    supabase.from("profiles").select("user_id, first_name, photo_url").in("user_id", otherIds),
    meetupIds.length > 0
      ? supabase
          .from("activity_recommendations")
          .select("meetup_id, activity_title, venue_name, created_at")
          .in("meetup_id", meetupIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { meetup_id: string; activity_title: string | null; venue_name: string | null }[] }),
  ])

  const profileById = new Map((profiles ?? []).map((row) => [row.user_id, row]))
  const recByMeetup = new Map<string, { activity_title: string | null; venue_name: string | null }>()
  for (const rec of recommendations ?? []) {
    if (!recByMeetup.has(rec.meetup_id)) {
      recByMeetup.set(rec.meetup_id, rec) // ordered newest-first, so first seen wins
    }
  }

  return rows.map((row) => {
    const otherId = row.user_a === userId ? row.user_b : row.user_a
    const profile = profileById.get(otherId)
    const rec = row.via_meetup ? recByMeetup.get(row.via_meetup) : undefined
    return {
      userId: otherId,
      firstName: profile?.first_name ?? "A friend",
      photoUrl: profile?.photo_url ?? null,
      activityTitle: rec?.activity_title ?? "a shared activity",
      venueName: rec?.venue_name ?? null,
      meetupId: row.via_meetup,
      connectedAt: row.created_at,
    }
  })
}

const VIEWBOX = 320
const CENTER = VIEWBOX / 2
const RING_RADIUS = 108
const FRIEND_NODE_RADIUS = 26
const SELF_NODE_RADIUS = 30

function nodePosition(index: number, count: number): { x: number; y: number } {
  // Single friend sits straight above; otherwise spread evenly from the top.
  const angle = (-90 + (360 / Math.max(count, 1)) * index) * (Math.PI / 180)
  return {
    x: CENTER + RING_RADIUS * Math.cos(angle),
    y: CENTER + RING_RADIUS * Math.sin(angle),
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "")
}

export async function ConnectionMap({ friends, selfLabel = "You", className }: ConnectionMapProps) {
  const data = friends ?? (await loadFriendsForCurrentUser())

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-5 text-card-foreground",
        className
      )}
      aria-label="Your private connection map"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Connection map</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            The activities you met your friends through.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          Private
        </span>
      </header>

      {data.length === 0 ? (
        <p className="mt-6 rounded-xl bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">
          No connections yet. When you and someone from a meetup both choose
          &ldquo;meet again&rdquo;, they&rsquo;ll show up here — linked by the
          activity you shared.
        </p>
      ) : (
        <>
          <div className="mt-4 flex justify-center">
            <svg
              viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
              className="h-auto w-full max-w-[320px] overflow-visible"
              role="img"
              aria-label={`You and ${data.length} ${data.length === 1 ? "friend" : "friends"}, each linked by a shared activity`}
            >
              {data.map((friend, index) => {
                const { x, y } = nodePosition(index, data.length)
                return (
                  <line
                    key={`edge-${friend.userId}`}
                    x1={CENTER}
                    y1={CENTER}
                    x2={x}
                    y2={y}
                    className="stroke-border"
                    strokeWidth={2}
                    strokeDasharray="3 4"
                  />
                )
              })}

              {data.map((friend, index) => {
                const { x, y } = nodePosition(index, data.length)
                const clipId = `cm-avatar-${friend.userId}`
                return (
                  <g key={`node-${friend.userId}`}>
                    {friend.photoUrl ? (
                      <>
                        <clipPath id={clipId}>
                          <circle cx={x} cy={y} r={FRIEND_NODE_RADIUS} />
                        </clipPath>
                        <image
                          href={friend.photoUrl}
                          x={x - FRIEND_NODE_RADIUS}
                          y={y - FRIEND_NODE_RADIUS}
                          width={FRIEND_NODE_RADIUS * 2}
                          height={FRIEND_NODE_RADIUS * 2}
                          clipPath={`url(#${clipId})`}
                          preserveAspectRatio="xMidYMid slice"
                        />
                        <circle
                          cx={x}
                          cy={y}
                          r={FRIEND_NODE_RADIUS}
                          fill="none"
                          className="stroke-border"
                          strokeWidth={2}
                        />
                      </>
                    ) : (
                      <>
                        <circle cx={x} cy={y} r={FRIEND_NODE_RADIUS} className="fill-muted stroke-border" strokeWidth={2} />
                        <text
                          x={x}
                          y={y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="fill-muted-foreground text-[13px] font-semibold"
                        >
                          {initials(friend.firstName)}
                        </text>
                      </>
                    )}
                    <text
                      x={x}
                      y={y + FRIEND_NODE_RADIUS + 15}
                      textAnchor="middle"
                      className="fill-foreground text-[12px] font-medium"
                    >
                      {friend.firstName}
                    </text>
                  </g>
                )
              })}

              <circle cx={CENTER} cy={CENTER} r={SELF_NODE_RADIUS} className="fill-accent" />
              <text
                x={CENTER}
                y={CENTER}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-accent-foreground text-[13px] font-semibold"
              >
                {selfLabel}
              </text>
            </svg>
          </div>

          <ul className="mt-4 space-y-2">
            {data.map((friend) => (
              <li
                key={`row-${friend.userId}`}
                className="rounded-xl border border-border/70 bg-background px-3.5 py-2.5 text-sm"
              >
                <span className="font-medium">{friend.firstName}</span>
                <span className="text-muted-foreground"> — met through </span>
                <span className="font-medium">{friend.activityTitle}</span>
                {friend.venueName ? (
                  <span className="text-muted-foreground"> at {friend.venueName}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
