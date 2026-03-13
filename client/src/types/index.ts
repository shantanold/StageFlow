// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: "staff" | "manager";
  created_at?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// ─── Items ────────────────────────────────────────────────────────────────────

export type ItemStatus    = "available" | "staged" | "disposed";
export type ItemCondition = "good" | "fair" | "damaged";

export interface SetRef {
  id: string;
  name: string;
}

export interface Item {
  id: string;
  sku: string;
  name: string;
  category: string;
  set_id: string | null;
  set: SetRef | null;
  status: ItemStatus;
  condition: ItemCondition;
  photo_url: string | null;
  purchase_cost: string; // Prisma Decimal comes back as string
  purchase_date: string;
  notes: string | null;
  created_at: string;
}

export interface CurrentJob {
  id: string;
  address: string;
  city: string;
  state: string;
  client_name: string;
  start_date: string;
}

export interface ItemDetail extends Item {
  current_job: CurrentJob | null;
}

// ─── Movements ────────────────────────────────────────────────────────────────

export interface Movement {
  id: string;
  item_id: string;
  job_id: string | null;
  from_status: string;
  to_status: string;
  performed_by: string;
  notes: string | null;
  created_at: string;
  performer: { name: string };
  job: { address: string; city: string; state: string } | null;
}

// ─── Sets ─────────────────────────────────────────────────────────────────────

export interface ItemSet {
  id: string;
  name: string;
  description: string;
  created_at: string;
  item_count: number;
  available_count: number;
  staged_count: number;
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

export type JobStatus = "planning" | "active" | "completed" | "cancelled";

export interface Job {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  client_name: string;
  client_contact: string;
  status: JobStatus;
  start_date: string;
  expected_end_date: string;
  actual_end_date: string | null;
  created_by: string;
  notes: string | null;
  created_at: string;
  item_count: number;
}

export interface JobItemRow {
  id: string;
  job_id: string;
  item_id: string;
  status: string;
  return_condition: string | null;
  return_notes: string | null;
  assigned_at: string;
  returned_at: string | null;
  item: Item;
}
