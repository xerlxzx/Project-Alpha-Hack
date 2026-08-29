// Domain types mirroring supabase/migrations/0001_schema.sql.
// DB columns are snake_case; these interfaces use camelCase — map field
// names when reading rows straight from supabase-js (or alias columns in
// the query) rather than passing raw rows through as these types.

export type MeetupStatus = "forming" | "confirmed" | "completed";
export type AvailabilityMode = "im_free" | "plan_ahead";
export type RecommendationSource = "live" | "fallback";
export type ReportStatus = "open" | "review";

export interface User {
  id: string;
  universityEmail: string;
  isVerified: boolean;
  isOver18: boolean;
  createdAt: string;
}

export interface Profile {
  userId: string;
  firstName: string;
  photoUrl: string | null;
  ageRange: string | null;
  university: string;
  courseYear: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Preferences {
  userId: string;
  travelKm: number | null;
  budgetAud: number | null;
  hobbies: string[];
  interests: string[];
  genderPref: string | null;
  languagePref: string | null;
  accessibility: string | null;
  socialEnergy: string | null;
  weeklyGoal: number | null;
  areaLat?: number | null;
  areaLng?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityWindow {
  id: string;
  userId: string;
  startAt: string;
  endAt: string;
  mode: AvailabilityMode;
  createdAt: string;
}

export interface Meetup {
  id: string;
  status: MeetupStatus;
  quorum: number;
  sizeCap: number;
  areaLat: number | null;
  areaLng: number | null;
  scheduledAt: string | null;
  createdBy: string | null;
  activityIntent?: string | null;
  tags?: string[] | null;
  costMin?: number | null;
  costMax?: number | null;
  createdAt: string;
}

export interface MeetupMember {
  id: string;
  meetupId: string;
  userId: string;
  accepted: boolean;
  revealed: boolean;
  rerollUsed: boolean;
  createdAt: string;
}

export interface ActivityRecommendation {
  id: string;
  meetupId: string;
  placeId: string | null;
  venueName: string | null;
  activityTitle: string | null;
  reason: string | null;
  estCostAud: number | null;
  estDistanceKm: number | null;
  overBudgetPref: boolean;
  overDistancePref: boolean;
  bookingUrl: string | null;
  source: RecommendationSource;
  rawPlacesJson: unknown;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  meetupId: string;
  userId: string;
  body: string;
  createdAt: string;
}

export interface Feedback {
  id: string;
  meetupId: string;
  fromUser: string;
  aboutUser: string | null;
  groupReaction: string | null;
  meetAgain: boolean | null;
  avoidRematch: boolean | null;
  note: string | null;
  safetyReportId: string | null;
  createdAt: string;
}

export interface Friendship {
  id: string;
  userA: string;
  userB: string;
  viaMeetup: string | null;
  createdAt: string;
}

export interface Block {
  id: string;
  blocker: string;
  blocked: string;
  createdAt: string;
}

export interface Report {
  id: string;
  reporter: string;
  reported: string;
  meetupId: string | null;
  category: string;
  detail: string | null;
  status: ReportStatus;
  createdAt: string;
}

export interface MomentumEvent {
  id: string;
  userId: string;
  activityId: string | null;
  week: number;
  completedAt: string | null;
  hours: number | null;
  createdAt: string;
}

export interface Badge {
  id: string;
  userId: string;
  code: string;
  earnedAt: string;
}

// Server-only — never send to a client response. Backs the private
// reliability score (PRD 9.12); the `user_reliability` table has no
// participant-readable RLS policy.
export interface UserReliability {
  userId: string;
  score: number;
  updatedAt: string;
}
