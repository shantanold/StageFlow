// ─── Category emoji ───────────────────────────────────────────────────────────

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

// ─── Status helpers ───────────────────────────────────────────────────────────

export function statusBadgeClass(status: string, condition?: string): string {
  if (condition === "damaged") return "badge badge-amber";
  if (status === "available") return "badge badge-green";
  if (status === "staged")    return "badge badge-blue";
  if (status === "disposed")  return "badge badge-gray";
  return "badge badge-gray";
}

export function statusLabel(status: string, condition?: string): string {
  if (condition === "damaged") return "Damaged";
  if (status === "available") return "Available";
  if (status === "staged")    return "Staged";
  if (status === "disposed")  return "Disposed";
  return status;
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
