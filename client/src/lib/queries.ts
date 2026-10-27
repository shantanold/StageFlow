import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiWithToken } from "./api";
import type { CalendarEvent, CalendarSource, CalendarSyncResult, Item, ItemDetail, ItemSet, Movement, Job, JobItemRow, ManagedUser, AdminOrganization, AdminOrganizationDetail, AdminItemsResponse, AdminOrgSummary, AdminUserUpdate, AdminJobsResponse } from "../types";

// ─── Items ────────────────────────────────────────────────────────────────────

interface ItemFilters {
  search?: string;
  status?: string;
  condition?: string;
  category?: string;
  set_id?: string;
  qr_printed?: boolean;
  is_unlabeled?: boolean;
}

function buildItemsQS(filters: ItemFilters): string {
  const p = new URLSearchParams();
  if (filters.search)    p.set("search",    filters.search);
  if (filters.status)    p.set("status",    filters.status);
  if (filters.condition) p.set("condition", filters.condition);
  if (filters.category)  p.set("category",  filters.category);
  if (filters.set_id)    p.set("set_id",    filters.set_id);
  if (filters.qr_printed !== undefined) p.set("qr_printed", String(filters.qr_printed));
  if (filters.is_unlabeled !== undefined) p.set("is_unlabeled", String(filters.is_unlabeled));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export function useItems(filters: ItemFilters = {}) {
  return useQuery({
    queryKey: ["items", filters],
    queryFn:  () => api.get<Item[]>(`/items${buildItemsQS(filters)}`),
  });
}

export function useItem(id: string) {
  return useQuery({
    queryKey: ["items", id],
    queryFn:  () => api.get<ItemDetail>(`/items/${id}`),
    enabled:  !!id,
  });
}

export function useItemMovements(id: string) {
  return useQuery({
    queryKey: ["items", id, "movements"],
    queryFn:  () => api.get<Movement[]>(`/items/${id}/movements`),
    enabled:  !!id,
  });
}

interface CreateItemInput {
  name: string;
  category: string;
  set_id?: string | null;
  purchase_cost: number;
  purchase_date?: string | null;
  width_in?: number | null;
  depth_in?: number | null;
  height_in?: number | null;
  notes?: string;
  photo_url?: string;
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateItemInput) => api.post<Item>("/items", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["sets"] }); // item counts change
    },
  });
}

interface ImportItemRow {
  name: string;
  category: string;
  purchase_cost: number;
  purchase_date?: string | null;
  width_in?: number;
  depth_in?: number;
  height_in?: number;
  notes?: string;
}

export function useImportItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: ImportItemRow[]) =>
      api.post<{ created: number; errors: { row: number; message: string }[] }>("/items/import", { items }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useUpdateItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateItemInput & { condition: string; qr_printed: boolean }>) =>
      api.put<Item>(`/items/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["items", id] });
      qc.invalidateQueries({ queryKey: ["sets"] });
    },
  });
}

// ─── Sets ─────────────────────────────────────────────────────────────────────

export function useSets() {
  return useQuery({
    queryKey: ["sets"],
    queryFn:  () => api.get<ItemSet[]>("/sets"),
  });
}

export function useSet(id: string) {
  return useQuery({
    queryKey: ["sets", id],
    queryFn:  () => api.get<ItemSet>(`/sets/${id}`),
    enabled:  !!id,
  });
}

export function useSetItems(id: string) {
  return useQuery({
    queryKey: ["sets", id, "items"],
    queryFn:  () => api.get<Item[]>(`/sets/${id}/items`),
    enabled:  !!id,
  });
}

interface CreateSetInput {
  name: string;
  description?: string;
}

export function useCreateSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSetInput) => api.post<ItemSet>("/sets", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sets"] });
    },
  });
}

export function useUpdateSet(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateSetInput>) => api.put<ItemSet>(`/sets/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sets"] });
    },
  });
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  available_count: number;
  staged_count: number;
  total_items: number;
  active_jobs_count: number;
  needs_attention: number;
  utilization_pct: number;
  total_inventory_value: number;
  upcoming_jobs: import("../types").Job[];
  major_pieces: {
    key: string;
    label: string;
    available: number;
    staged: number;
  }[];
}

export function useDashboard() {
  return useQuery({
    queryKey: ["stats", "dashboard"],
    queryFn: () => api.get<DashboardStats>("/stats/dashboard"),
    refetchInterval: 30_000, // refresh every 30s
  });
}

export interface UtilizationReport {
  overall_pct: number;
  by_category: { category: string; total: number; staged: number; utilization_pct: number }[];
  dead_stock:  { id: string; sku: string; name: string; category: string }[];
  top_items:   { id: string; name: string; category: string; job_count: number }[];
}

export interface JobPerformanceReport {
  total_completed:     number;
  avg_duration_days:   number;
  on_time_rate_pct:    number;
  damage_rate_pct:     number;
  top_clients:         { client_name: string; job_count: number }[];
  monthly_completions: { month: string; count: number }[];
}

export interface InventoryValueReport {
  total_value:     number;
  available_value: number;
  staged_value:    number;
  disposed_value:  number;
  disposed_count:  number;
  by_category:     { category: string; value: number; count: number }[];
}

export interface DamageLossReport {
  total_damage_events:  number;
  total_disposed_count: number;
  total_disposed_value: number;
  top_damaged_items:    { id: string; name: string; sku: string; category: string; damage_count: number }[];
  recent_events: {
    item_name: string; item_sku: string; item_category: string;
    job_address: string; job_client: string;
    condition: string; notes: string | null; returned_at: string | null;
  }[];
}

export function useUtilizationReport() {
  return useQuery({
    queryKey: ["stats", "reports", "utilization"],
    queryFn:  () => api.get<UtilizationReport>("/stats/reports/utilization"),
  });
}

export function useJobPerformanceReport() {
  return useQuery({
    queryKey: ["stats", "reports", "job-performance"],
    queryFn:  () => api.get<JobPerformanceReport>("/stats/reports/job-performance"),
  });
}

export function useInventoryValueReport() {
  return useQuery({
    queryKey: ["stats", "reports", "inventory-value"],
    queryFn:  () => api.get<InventoryValueReport>("/stats/reports/inventory-value"),
  });
}

export function useDamageLossReport() {
  return useQuery({
    queryKey: ["stats", "reports", "damage-loss"],
    queryFn:  () => api.get<DamageLossReport>("/stats/reports/damage-loss"),
  });
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

interface JobFilters {
  status?: string;
}

function buildJobsQS(filters: JobFilters): string {
  const p = new URLSearchParams();
  if (filters.status) p.set("status", filters.status);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export function useJobs(filters: JobFilters = {}) {
  return useQuery({
    queryKey: ["jobs", filters],
    queryFn: () => api.get<Job[]>(`/jobs${buildJobsQS(filters)}`),
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: ["jobs", id],
    queryFn: () => api.get<Job>(`/jobs/${id}`),
    enabled: !!id,
  });
}

export function useJobItems(id: string) {
  return useQuery({
    queryKey: ["jobs", id, "items"],
    queryFn: () => api.get<JobItemRow[]>(`/jobs/${id}/items`),
    enabled: !!id,
  });
}

interface CreateJobInput {
  address: string;
  city: string;
  state: string;
  zip: string;
  client_name: string;
  client_contact: string;
  start_date: string;
  expected_end_date: string;
  notes?: string;
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateJobInput) => api.post<Job>("/jobs", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useUpdateJob(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateJobInput> & { actual_end_date?: string | null; status?: string }) =>
      api.put<Job>(`/jobs/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["jobs", id] });
    },
  });
}

export function useAssignItems(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemIds: string[]) => api.post<Job>(`/jobs/${jobId}/assign`, { itemIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs", jobId, "items"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["sets"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

/** Assign one or more items to a job chosen at call time (e.g. from item detail). */
export function useAssignToJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, itemIds }: { jobId: string; itemIds: string[] }) =>
      api.post<Job>(`/jobs/${jobId}/assign`, { itemIds }),
    onSuccess: (_data, { jobId, itemIds }) => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs", jobId, "items"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["sets"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      for (const itemId of itemIds) {
        qc.invalidateQueries({ queryKey: ["items", itemId] });
      }
    },
  });
}

export function useUnassignItems(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemIds: string[]) =>
      api.post<Job & { unassigned_count: number }>(`/jobs/${jobId}/unassign`, { itemIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs", jobId, "items"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["sets"] });
    },
  });
}

export function useForceCompleteJob(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ job_completed: boolean; missing_count: number }>(`/jobs/${jobId}/force-complete`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs", jobId, "items"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

function invalidateJobAndItems(qc: ReturnType<typeof useQueryClient>, jobId: string, itemId?: string) {
  qc.invalidateQueries({ queryKey: ["jobs"] });
  qc.invalidateQueries({ queryKey: ["jobs", jobId] });
  qc.invalidateQueries({ queryKey: ["jobs", jobId, "items"] });
  qc.invalidateQueries({ queryKey: ["items"] });
  qc.invalidateQueries({ queryKey: ["stats"] });
  if (itemId) qc.invalidateQueries({ queryKey: ["items", itemId] });
}

export function useMarkLoaded(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      api.post<{ item: Item; job_activated: boolean; remaining_to_load: number }>(
        `/jobs/${jobId}/mark-loaded`,
        { itemId },
      ),
    onSuccess: (_data, itemId) => invalidateJobAndItems(qc, jobId, itemId),
  });
}

export function useUndoLoad(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      api.post<{ item: Item }>(`/jobs/${jobId}/undo-load`, { itemId }),
    onSuccess: (_data, itemId) => invalidateJobAndItems(qc, jobId, itemId),
  });
}

export function useMarkReturned(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { itemId: string; condition: string; notes?: string }) =>
      api.post<{ item: Item; job_completed: boolean; remaining: number }>(
        `/jobs/${jobId}/mark-returned`,
        data,
      ),
    onSuccess: (_data, vars) => invalidateJobAndItems(qc, jobId, vars.itemId),
  });
}

export function useBulkUnlabeled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (count: number) =>
      api.post<{ created: number; items: Item[] }>("/items/bulk-unlabeled", { count }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useClaimItem(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateItemInput> & { condition?: string; job_id?: string | null }) =>
      api.post<Item>(`/items/${itemId}/claim`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["items", itemId] });
      qc.invalidateQueries({ queryKey: ["sets"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useDuplicateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.post<Item>(`/items/${itemId}/duplicate`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["sets"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useSetItemStatus(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { status: string; condition?: string; notes?: string; job_id?: string }) =>
      api.post<Item>(`/items/${itemId}/set-status`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["items", itemId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useMarkItemFound(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Item>(`/items/${itemId}/found`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["items", itemId] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useDisposeItem(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Item>(`/items/${itemId}/dispose`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["items", itemId] });
      qc.invalidateQueries({ queryKey: ["sets"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useDeleteItem(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ message: string; id: string }>(`/items/${itemId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["sets"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

// ─── Users (manager only) ────────────────────────────────────────────────────

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<ManagedUser[]>("/users"),
  });
}

export function useUpdateUserAccess(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { role?: "staff" | "manager"; is_active?: boolean }) =>
      api.patch<ManagedUser>(`/users/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

// ─── Platform admin ───────────────────────────────────────────────────────────

export function useAdminOrganizations() {
  return useQuery({
    queryKey: ["admin", "organizations"],
    queryFn: () => api.get<AdminOrganization[]>("/admin/organizations"),
  });
}

export function useAdminOrganization(id: string) {
  return useQuery({
    queryKey: ["admin", "organizations", id],
    queryFn: () => api.get<AdminOrganizationDetail>(`/admin/organizations/${id}`),
    enabled: !!id,
  });
}

export interface AdminItemFilters {
  org_id?: string;
  search?: string;
  status?: string;
}

export function useAdminItems(filters: AdminItemFilters) {
  const p = new URLSearchParams();
  if (filters.org_id) p.set("org_id", filters.org_id);
  if (filters.search?.trim()) p.set("search", filters.search.trim());
  if (filters.status) p.set("status", filters.status);
  const qs = p.toString();
  return useQuery({
    queryKey: ["admin", "items", filters],
    queryFn: () => api.get<AdminItemsResponse>(`/admin/items${qs ? `?${qs}` : ""}`),
  });
}

export interface AdminJobFilters {
  org_id?: string;
  search?: string;
  status?: string;
}

export function useAdminJobs(filters: AdminJobFilters) {
  const p = new URLSearchParams();
  if (filters.org_id) p.set("org_id", filters.org_id);
  if (filters.search?.trim()) p.set("search", filters.search.trim());
  if (filters.status) p.set("status", filters.status);
  const qs = p.toString();
  return useQuery({
    queryKey: ["admin", "jobs", filters],
    queryFn: () => api.get<AdminJobsResponse>(`/admin/jobs${qs ? `?${qs}` : ""}`),
  });
}

/** Any admin change can move the cross-org numbers, so refresh all admin views. */
function useInvalidateAdmin() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["admin"] });
}

export function useCreateOrganization() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (name: string) => api.post<AdminOrgSummary>("/admin/organizations", { name }),
    onSuccess: invalidate,
  });
}

export function useUpdateOrganization(id: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (data: { name?: string; is_active?: boolean }) => api.patch<AdminOrgSummary>(`/admin/organizations/${id}`, data),
    onSuccess: invalidate,
  });
}

export function useRegenerateInviteCode(id: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: () => api.post<AdminOrgSummary>(`/admin/organizations/${id}/invite-code`, {}),
    onSuccess: invalidate,
  });
}

export function useAdminUpdateUser(id: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (data: AdminUserUpdate) => api.patch(`/admin/users/${id}`, data),
    onSuccess: invalidate,
  });
}

export type AdminItemAction =
  | { kind: "condition"; condition: "good" | "fair" | "damaged" }
  | { kind: "status"; status: "available" | "missing" }
  | { kind: "found" }
  | { kind: "dispose" };

/**
 * Change one item in any org, through that org's normal item routes (same
 * rules and history as a manager there), using a short-lived org-scoped token.
 */
export function useAdminItemAction() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async ({ orgId, itemId, action }: { orgId: string; itemId: string; action: AdminItemAction }) => {
      const { token } = await api.post<{ token: string }>(`/admin/organizations/${orgId}/act`, {});
      const org = apiWithToken(token);
      switch (action.kind) {
        case "condition": return org.put(`/items/${itemId}`, { condition: action.condition });
        case "status":    return org.post(`/items/${itemId}/set-status`, { status: action.status, notes: "Platform admin override" });
        case "found":     return org.post(`/items/${itemId}/found`, {});
        case "dispose":   return org.post(`/items/${itemId}/dispose`, {});
      }
    },
    onSuccess: invalidate,
  });
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export function useCalendarEvents(from: Date, to: Date) {
  const range = { from: from.toISOString(), to: to.toISOString() };
  return useQuery({
    queryKey: ["calendar", "events", range],
    queryFn: () => api.get<CalendarEvent[]>(`/calendar/events?${new URLSearchParams(range)}`),
  });
}

export function useCalendarPeople() {
  return useQuery({
    queryKey: ["calendar", "people"],
    queryFn: () => api.get<{ id: string; name: string }[]>("/calendar/people"),
  });
}

export interface EventInput {
  title?: string;
  description?: string | null;
  location?: string | null;
  start_at?: string;
  end_at?: string;
  all_day?: boolean;
  is_busy?: boolean;
  job_id?: string | null;
  assignee_id?: string | null;
}

export function useSaveEvent(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: EventInput) =>
      id ? api.patch<CalendarEvent>(`/calendar/events/${id}`, data) : api.post<CalendarEvent>("/calendar/events", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar", "events"] }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/calendar/events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar", "events"] }),
  });
}

export function useImportIcs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ics: string) =>
      api.postText<{ created: number; updated: number; total: number }>("/calendar/import", ics, "text/calendar"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar", "events"] }),
  });
}

export function useCalendarSources(enabled = true) {
  return useQuery({
    queryKey: ["calendar", "sources"],
    queryFn: () => api.get<CalendarSource[]>("/calendar/sources"),
    enabled,
  });
}

function invalidateCalendar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["calendar", "sources"] });
  qc.invalidateQueries({ queryKey: ["calendar", "events"] });
}

export function useAddCalendarSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; url: string }) => api.post<CalendarSyncResult>("/calendar/sources", data),
    onSuccess: () => invalidateCalendar(qc),
  });
}

export function useSyncCalendarSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<CalendarSyncResult>(`/calendar/sources/${id}/sync`, {}),
    onSuccess: () => invalidateCalendar(qc),
  });
}

export function useDeleteCalendarSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/calendar/sources/${id}`),
    onSuccess: () => invalidateCalendar(qc),
  });
}

export function useCalendarSettings() {
  return useQuery({
    queryKey: ["calendar", "settings"],
    queryFn: () => api.get<{ timezone: string }>("/calendar/settings"),
  });
}

export function useUpdateCalendarSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { timezone: string }) => api.put<{ timezone: string }>("/calendar/settings", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar", "settings"] }),
  });
}
