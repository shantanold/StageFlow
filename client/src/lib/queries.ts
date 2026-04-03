import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Item, ItemDetail, ItemSet, Movement, Job, JobItemRow } from "../types";

// ─── Items ────────────────────────────────────────────────────────────────────

interface ItemFilters {
  search?: string;
  status?: string;
  condition?: string;
  category?: string;
  set_id?: string;
}

function buildItemsQS(filters: ItemFilters): string {
  const p = new URLSearchParams();
  if (filters.search)    p.set("search",    filters.search);
  if (filters.status)    p.set("status",    filters.status);
  if (filters.condition) p.set("condition", filters.condition);
  if (filters.category)  p.set("category",  filters.category);
  if (filters.set_id)    p.set("set_id",    filters.set_id);
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
  purchase_date: string;
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
  purchase_date: string;
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
    mutationFn: (data: Partial<CreateItemInput & { condition: string }>) =>
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
}

export function useDashboard() {
  return useQuery({
    queryKey: ["stats", "dashboard"],
    queryFn: () => api.get<DashboardStats>("/stats/dashboard"),
    refetchInterval: 30_000, // refresh every 30s
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
