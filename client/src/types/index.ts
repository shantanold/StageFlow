// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: "staff" | "manager";
  created_at?: string;
  /** Runs Stagemigo itself and can see every organization. */
  is_platform_admin?: boolean;
  /** Set while a platform admin is working inside a customer org. */
  acting_org?: { id: string; name: string } | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: "staff" | "manager";
  is_active: boolean;
  created_at: string;
}

// ─── Items ────────────────────────────────────────────────────────────────────

export type ItemStatus    = "available" | "staged" | "disposed" | "missing";
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
  purchase_date: string | null;
  width_in: string | null;  // Prisma Decimal comes back as string
  depth_in: string | null;
  height_in: string | null;
  notes: string | null;
  qr_printed: boolean;
  is_unlabeled: boolean;
  /** Present on list responses when the item is on a not-yet-returned job */
  active_job_id?: string | null;
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
  /** Up to 4 item photo URLs for list collage previews. */
  preview_photo_urls?: string[];
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
  /** Staging contract fee (Prisma Decimal → string). */
  amount: string | null;
  /** Monthly staging rate (Prisma Decimal → string). */
  monthly_rate: string | null;
  /** Contract duration label, e.g. "3 Months". */
  duration: string | null;
  /** Home market / listing value (Prisma Decimal → string). */
  market_value: string | null;
  /** Extension fees (Prisma Decimal → string). */
  extension_amount: string | null;
  /** Total paid by client (Prisma Decimal → string). */
  total_paid: string | null;
  /** Date furniture was destaged / pulled. */
  destaged_at: string | null;
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

// ─── Platform admin ───────────────────────────────────────────────────────────

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  user_count: number;
  item_count: number;
  job_count: number;
  active_job_count: number;
  last_activity_at: string | null;
}

export interface AdminOrgSummary {
  id: string;
  name: string;
  slug: string;
  invite_code: string;
  is_active: boolean;
  created_at: string;
}

export interface AdminUserUpdate {
  role?: "staff" | "manager";
  is_active?: boolean;
  org_id?: string;
}

export interface AdminJob {
  id: string;
  address: string;
  city: string;
  state: string;
  client_name: string;
  status: string;
  start_date: string | null;
  expected_end_date: string | null;
  actual_end_date: string | null;
  created_at: string;
  item_count: number;
  org: { id: string; name: string };
}

export interface AdminJobsResponse {
  jobs: AdminJob[];
  total: number;
}

export interface AdminOrganizationDetail {
  id: string;
  name: string;
  slug: string;
  invite_code: string;
  is_active: boolean;
  created_at: string;
  last_activity_at: string | null;
  items_by_status: Record<string, number>;
  jobs_by_status: Record<string, number>;
  users: ManagedUser[];
}

export interface AdminItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  status: string;
  condition: string;
  photo_url: string | null;
  purchase_cost: string;
  created_at: string;
  org: { id: string; name: string };
  set: { id: string; name: string } | null;
}

export interface AdminItemsResponse {
  items: AdminItem[];
  total: number;
}
