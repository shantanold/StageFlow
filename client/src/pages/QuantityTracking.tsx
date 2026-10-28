import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { getCategoryEmoji } from "../lib/utils";
import type { QuantityItem } from "../types";

const SelectArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8'%3E%3Cpath d='M6 8L1 3h10z'/%3E%3C/svg%3E")`;
const selectStyle: import("react").CSSProperties = {
  backgroundImage: SelectArrow,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  paddingRight: 28,
  appearance: "none",
  fontSize: 12,
  paddingTop: 8,
  paddingBottom: 8,
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}>
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchQuantityItems(category?: string): Promise<QuantityItem[]> {
  const token = localStorage.getItem("token");
  const params = new URLSearchParams();
  if (category && category !== "all") params.set("category", category);
  
  const res = await fetch(`/api/v1/quantity-items?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch quantity items");
  return res.json();
}

async function createQuantityItem(data: {
  name: string;
  category: string;
  quantity: number;
  unit_cost: number;
  notes?: string;
}): Promise<QuantityItem> {
  const token = localStorage.getItem("token");
  const res = await fetch("/api/v1/quantity-items", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Failed to create item");
  }
  return res.json();
}

async function updateQuantityItem(
  id: string,
  data: Partial<{
    name: string;
    category: string;
    quantity: number;
    unit_cost: number;
    notes: string | null;
  }>
): Promise<QuantityItem> {
  const token = localStorage.getItem("token");
  const res = await fetch(`/api/v1/quantity-items/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Failed to update item");
  }
  return res.json();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuantityTracking() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isManager = user?.role === "manager";

  const [categoryFilter, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<QuantityItem | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["quantity-items", categoryFilter],
    queryFn: () => fetchQuantityItems(categoryFilter !== "all" ? categoryFilter : undefined),
  });

  const createMutation = useMutation({
    mutationFn: createQuantityItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quantity-items"] });
      setShowModal(false);
      showToast("Item created", "success");
    },
    onError: (err: Error) => {
      showToast(err.message, "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateQuantityItem>[1] }) =>
      updateQuantityItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quantity-items"] });
      setEditingItem(null);
      showToast("Item updated", "success");
    },
    onError: (err: Error) => {
      showToast(err.message, "error");
    },
  });

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return ["all", ...Array.from(set).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items;

    if (categoryFilter !== "all") {
      list = list.filter((i) => i.category === categoryFilter);
    }

    if (q) {
      list = list.filter((i) => {
        const hay = `${i.name} ${i.category}`.toLowerCase();
        return hay.includes(q);
      });
    }

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [items, categoryFilter, search]);

  const totalQuantity = filtered.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = filtered.reduce((sum, item) => sum + item.quantity * Number(item.unit_cost), 0);

  return (
    <div className="animate-in">
      {/* Header */}
      <div
        className="page-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div>
          <h1 className="page-title">Quantity Tracking</h1>
          <p className="page-subtitle">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""} · {totalQuantity} total units
          </p>
        </div>
        {isManager && (
          <button
            className="btn btn-primary"
            style={{ padding: "8px 14px", fontSize: 12, gap: 5 }}
            onClick={() => setShowModal(true)}
          >
            <PlusIcon /> Add
          </button>
        )}
      </div>

      <div className="page-body">
        {/* Search */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <div
            style={{
              position: "absolute",
              left: 11,
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
            }}
          >
            <SearchIcon />
          </div>
          <input
            className="input-field"
            placeholder="Search name, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>

        {/* Filter */}
        <div style={{ marginBottom: 14 }}>
          <select
            className="input-field"
            style={selectStyle}
            value={categoryFilter}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter category"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All categories" : c}
              </option>
            ))}
          </select>
        </div>

        {/* Summary Card */}
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                  marginBottom: 4,
                }}
              >
                Total Units
              </p>
              <p style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)" }}>
                {totalQuantity}
              </p>
            </div>
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                  marginBottom: 4,
                }}
              >
                Total Value
              </p>
              <p style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
                ${totalValue.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <ItemListSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState search={search} />
        ) : (
          <div className="list-card">
            {filtered.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                isManager={isManager}
                onEdit={() => setEditingItem(item)}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <AddItemModal
          onClose={() => setShowModal(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
        />
      )}

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSubmit={(data) => updateMutation.mutate({ id: editingItem.id, data })}
          isSubmitting={updateMutation.isPending}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ItemRow({
  item,
  isManager,
  onEdit,
}: {
  item: QuantityItem;
  isManager: boolean;
  onEdit: () => void;
}) {
  const unitCost = Number(item.unit_cost);
  const totalValue = item.quantity * unitCost;

  return (
    <div className="list-row">
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 6,
          background: "var(--bg-surface)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
        }}
      >
        {getCategoryEmoji(item.category)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.name}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-tertiary)",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.category} · ${unitCost.toFixed(2)}/unit · ${totalValue.toFixed(2)} total
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{item.quantity}</div>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>units</div>
        </div>

        {isManager && (
          <button
            className="btn btn-outline"
            style={{ padding: "6px 10px", fontSize: 11 }}
            onClick={onEdit}
          >
            <EditIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function ItemListSkeleton() {
  return (
    <div className="list-card">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="list-row" style={{ pointerEvents: "none" }}>
          <div
            style={{ width: 42, height: 42, borderRadius: 6, background: "var(--bg-surface)" }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                height: 13,
                borderRadius: 4,
                background: "var(--bg-surface)",
                width: "55%",
                marginBottom: 6,
              }}
            />
            <div
              style={{
                height: 10,
                borderRadius: 3,
                background: "var(--bg-surface)",
                width: "35%",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ search }: { search: string }) {
  const msg = search ? `No items match "${search}"` : "No quantity-tracked items yet";

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "40px 16px",
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{msg}</p>
    </div>
  );
}

// ─── Add Item Modal ───────────────────────────────────────────────────────────

function AddItemModal({
  onClose,
  onSubmit,
  isSubmitting,
}: {
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    category: string;
    quantity: number;
    unit_cost: number;
    notes?: string;
  }) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [unitCost, setUnitCost] = useState("0");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      category: category.trim(),
      quantity: parseInt(quantity, 10) || 0,
      unit_cost: parseFloat(unitCost) || 0,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Add Quantity Item</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label className="input-label">Name *</label>
            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="input-label">Category *</label>
            <input
              className="input-field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            />
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label className="input-label">Quantity</label>
              <input
                type="number"
                className="input-field"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="0"
              />
            </div>

            <div style={{ flex: 1 }}>
              <label className="input-label">Unit Cost ($)</label>
              <input
                type="number"
                step="0.01"
                className="input-field"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                min="0"
              />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="input-label">Notes</label>
            <textarea
              className="input-field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !name.trim() || !category.trim()}
            >
              {isSubmitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Item Modal ──────────────────────────────────────────────────────────

function EditItemModal({
  item,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  item: QuantityItem;
  onClose: () => void;
  onSubmit: (data: Partial<{
    name: string;
    category: string;
    quantity: number;
    unit_cost: number;
    notes: string | null;
  }>) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unitCost, setUnitCost] = useState(item.unit_cost);
  const [notes, setNotes] = useState(item.notes || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      category: category.trim(),
      quantity: parseInt(quantity, 10) || 0,
      unit_cost: parseFloat(unitCost) || 0,
      notes: notes.trim() || null,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Edit Quantity Item</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label className="input-label">Name *</label>
            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="input-label">Category *</label>
            <input
              className="input-field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            />
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label className="input-label">Quantity</label>
              <input
                type="number"
                className="input-field"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="0"
              />
            </div>

            <div style={{ flex: 1 }}>
              <label className="input-label">Unit Cost ($)</label>
              <input
                type="number"
                step="0.01"
                className="input-field"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                min="0"
              />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="input-label">Notes</label>
            <textarea
              className="input-field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !name.trim() || !category.trim()}
            >
              {isSubmitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
