import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Item, ItemDetail, ItemSet, Movement, Job, JobItemRow, ManagedUser } from "../types";

// ─── Items ────────────────────────────────────────────────────────────────────

interface ItemFilters {
  search?: string;
  status?: string;
  condition?: string;
  category?: string;
  set_id?: string;
  qr_printed?: boolean;
}

function buildItemsQS(filters: ItemFilters): string {
  const p = new URLSearchParams();
  if (filters.search)    p.set("search",    filters.search);
  if (filters.status)    p.set("status",    filters.status);
  if (filters.condition) p.set("condition", filters.condition);
  if (filters.category)  p.set("category",  filters.category);
  if (filters.set_id)    p.set("set_id",    filters.set_id);
  if (filters.qr_printed !== undefined) p.set("qr_printed", String(filters.qr_printed));
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
