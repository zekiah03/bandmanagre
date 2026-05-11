import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export type Member = {
  id: string;
  band_id: string;
  user_id: string | null;
  email: string | null;
  display_name: string;
  instrument: string | null;
  role: "admin" | "member";
};

export type Band = {
  id: string;
  name: string;
  created_by: string;
};

export type EventItem = {
  id: string;
  band_id: string;
  title: string;
  kind: "rehearsal" | "live" | "recording" | "meeting" | "other";
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  notes: string | null;
  allow_muted_participation: boolean;
};

export type SchedulePoll = {
  id: string;
  band_id: string;
  title: string;
  kind: "rehearsal" | "live" | "recording" | "meeting" | "other";
  note: string | null;
  allow_muted_participation: boolean;
  status: "open" | "closed";
  created_by: string | null;
  created_at: string;
};

export type AvailabilitySlot = {
  id: string;
  poll_id: string;
  band_id: string;
  member_id: string;
  starts_at: string;
  ends_at: string;
  can_join_muted: boolean;
  note: string | null;
  created_at: string;
};

export type TaskItem = {
  id: string;
  band_id: string;
  title: string;
  description: string | null;
  assignee_member_id: string | null;
  due_date: string | null;
  status: "todo" | "doing" | "done";
};

export type MoneyItem = {
  id: string;
  band_id: string;
  kind: "income" | "expense";
  category: string;
  title: string;
  amount: number;
  occurred_on: string;
  memo: string | null;
};

export type MeetingMinute = {
  id: string;
  band_id: string;
  event_id: string | null;
  title: string;
  body: string;
  decisions: string | null;
  action_items: string | null;
  next_steps: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
