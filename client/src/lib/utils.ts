// ─── Category emoji ───────────────────────────────────────────────────────────

import type { Item } from "../types";

const EMOJI_MAP: Record<string, string> = {
  sofa:    "🛋️",
  chair:   "🪑",
  table:   "🪑",
  lamp:    "💡",
  lighting:"💡",
  bed:     "🛏️",
  rug:     "🟫",
  art:     "🖼️",
  decor:   "🏺",
  plant:   "🌿",
  textile: "🧵",
  mirror:  "🪞",
  shelf:   "📚",
};

export function getCategoryEmoji(category: string): string {
  if (!category) return "📦";
  const key = category.toLowerCase();
  for (const [k, v] of Object.entries(EMOJI_MAP)) {
    if (key.includes(k)) return v;
  }
  return "📦";
}

export const CATEGORIES = [
  "Sofa", "Chair", "Table", "Lamp", "Bed",
  "Rug", "Art", "Decor", "Plant", "Textile",
  "Mirror", "Shelf", "Other",
] as const;

// ─── Date formatting ──────────────────────────────────────────────────────────

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateShort(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Currency ─────────────────────────────────────────────────────────────────

export function formatCurrency(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
}

// ─── Dimensions ───────────────────────────────────────────────────────────────

export function formatDimensions(
  width_in: string | number | null | undefined,
  depth_in: string | number | null | undefined,
  height_in: string | number | null | undefined
): string | null {
  if (width_in == null && depth_in == null && height_in == null) return null;
  const w = width_in != null ? `${Number(width_in)}"W` : null;
  const d = depth_in != null ? `${Number(depth_in)}"D` : null;
  const h = height_in != null ? `${Number(height_in)}"H` : null;
  return [w, d, h].filter(Boolean).join(" × ");
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export function statusBadgeClass(status: string, condition?: string): string {
  if (status === "missing")   return "badge badge-red";
  if (condition === "damaged") return "badge badge-amber";
  if (status === "available") return "badge badge-green";
  if (status === "staged")    return "badge badge-blue";
  if (status === "disposed")  return "badge badge-gray";
  return "badge badge-gray";
}

export function statusLabel(status: string, condition?: string): string {
  if (status === "missing")   return "Missing";
  if (condition === "damaged") return "Damaged";
  if (status === "available") return "Unstaged";
  if (status === "staged")    return "Staged";
  if (status === "disposed")  return "Disposed";
  return status;
}

/** User-facing label for a job-item lifecycle status. */
export function jobItemStatusLabel(status: string): string {
  switch (status) {
    case "assigned":
      return "Unstaged";
    case "loaded":
    case "delivered":
    case "picked_up":
      return "Staged";
    case "returned":
      return "Returned";
    case "missing":
      return "Missing";
    default:
      return status;
  }
}

export function movementDotColor(toStatus: string): string {
  if (toStatus === "staged")    return "var(--accent)";
  if (toStatus === "available") return "var(--green)";
  return "var(--red)";
}

// ─── Job status badge ────────────────────────────────────────────────────────

export function jobStatusBadgeClass(status: string): string {
  if (status === "active")    return "badge badge-green";
  if (status === "planning")  return "badge badge-blue";
  if (status === "completed") return "badge badge-gray";
  if (status === "cancelled") return "badge badge-gray";
  return "badge badge-gray";
}

/** Collapse duplicate catalog copies (same name/category/set) into one template. Prefer photo, then newest. */
export function uniqueItemTemplates(items: Item[]): Item[] {
  const byKey = new Map<string, Item>();
  for (const item of items) {
    if (item.status === "disposed") continue;
    const key = [
      item.name.trim().toLowerCase(),
      item.category.trim().toLowerCase(),
      item.set_id ?? "",
    ].join("|");
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, item);
      continue;
    }
    const prevPhoto = Boolean(prev.photo_url);
    const nextPhoto = Boolean(item.photo_url);
    if (nextPhoto !== prevPhoto) {
      if (nextPhoto) byKey.set(key, item);
      continue;
    }
    if (new Date(item.created_at).getTime() > new Date(prev.created_at).getTime()) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}
