import { useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useItem, useItemMovements, useUpdateItem } from "../../lib/queries";
import { useSets } from "../../lib/queries";
import { downloadLabels, useQRCodeUrl } from "../../lib/labels";
import { uploadImage } from "../../lib/cloudinary";
import {
  getCategoryEmoji, statusBadgeClass, statusLabel,
  formatDate, formatCurrency, movementDotColor, CATEGORIES,
} from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { ApiError } from "../../lib/api";
import type { ItemDetail as ItemDetailType, Movement } from "../../types";

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function QRSection({ itemId }: { itemId: string }) {
  const { src, loading } = useQRCodeUrl(itemId);
  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    setPrinting(true);
    try { await downloadLabels([itemId]); } finally { setPrinting(false); }
  }

  return (
    <div
      className="card"
      style={{
        display: "flex", alignItems: "center", gap: 16,
      }}
    >
      {/* QR image */}
      <div
        style={{
          width: 80, height: 80, flexShrink: 0,
          background: "white", borderRadius: 8, padding: 4,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {loading ? (
          <div style={{ width: 16, height: 16, border: "2px solid #e5e7eb", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        ) : src ? (
          <img src={src} alt="QR code" style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} />
        ) : (
          <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Error</span>
        )}
      </div>

      {/* Label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>
          QR Label
        </p>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
          Scan to look up this item
        </p>
        <button
          className="btn btn-outline"
          style={{ padding: "6px 12px", fontSize: 12, gap: 5 }}
          onClick={handlePrint}
          disabled={printing || loading}
        >
          <PrinterIcon /> {printing ? "Generating…" : "Print label"}
        </button>
      </div>
    </div>
  );
}

export function ItemDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const [showEdit, setShowEdit] = useState(false);

  const { data: item, isLoading, isError } = useItem(id);
  const { data: movements = [] } = useItemMovements(id);

  if (isLoading) {
    return (
      <div style={{ padding: "40px 18px", textAlign: "center" }}>
        <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</p>
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div style={{ padding: "40px 18px", textAlign: "center" }}>
        <p style={{ color: "var(--red-text)", fontSize: 13 }}>Item not found.</p>
      </div>
    );
  }

  return (
    <div className="animate-in">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <button className="back-btn" onClick={() => navigate(-1)}>
            <BackIcon /> Back
          </button>
          {isManager && (
            <button
              className="btn btn-outline"
              style={{ padding: "7px 12px", fontSize: 12, gap: 5 }}
              onClick={() => setShowEdit(true)}
            >
              <EditIcon /> Edit
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: 8,
              background: "var(--bg-surface)", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, overflow: "hidden",
            }}
          >
            {item.photo_url ? (
              <img src={item.photo_url} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              getCategoryEmoji(item.category)
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.2px" }}>{item.name}</h1>
            <p
              style={{
                fontFamily: "var(--font-mono)", fontSize: 12,
                color: "var(--text-tertiary)", marginTop: 3,
              }}
            >
              {item.sku}
            </p>
            <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
              <span className={statusBadgeClass(item.status, item.condition)}>
                {statusLabel(item.status, item.condition)}
              </span>
              {item.condition === "fair" && (
                <span className="badge badge-amber">Fair condition</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 18px" }}>
        {/* Info grid */}
        <div
          className="card"
          style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14,
          }}
        >
          <InfoCell label="Category" value={item.category} />
          <InfoCell label="Set" value={item.set?.name ?? "None"} />
          <InfoCell label="Cost" value={formatCurrency(item.purchase_cost)} />
          <InfoCell label="Purchased" value={formatDate(item.purchase_date)} />
          {item.notes && (
            <div style={{ gridColumn: "1 / -1" }}>
              <InfoCell label="Notes" value={item.notes} />
            </div>
          )}
        </div>

        {/* Photo */}
        {item.photo_url && (
          <div style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: 12 }}>
            <img
              src={item.photo_url}
              alt={item.name}
              style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }}
            />
          </div>
        )}

        {/* QR code */}
        <QRSection itemId={item.id} />

        {/* Current job card */}
        {item.current_job && (
          <div
            className="card"
            style={{
              borderColor: "rgba(59,130,246,0.3)",
              cursor: "pointer",
            }}
            onClick={() => navigate(`/jobs/${item.current_job!.id}`)}
          >
            <p
              style={{
                fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
                textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6,
              }}
            >
              Currently staged at
            </p>
            <div
              style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: "#60a5fa" }}>
                  {item.current_job.address}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                  {item.current_job.city}, {item.current_job.state} · {item.current_job.client_name}
                </p>
              </div>
              <span style={{ color: "var(--text-tertiary)" }}>
                <ChevronRightIcon />
              </span>
            </div>
          </div>
        )}

        {showEdit && item && (
          <EditItemModal item={item} onClose={() => setShowEdit(false)} />
        )}

        {/* Movement history */}
        <div
          style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 10, marginTop: 4,
          }}
        >
          <span className="section-title">Movement history</span>
        </div>

        {movements.length === 0 ? (
          <div
            style={{
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)", padding: "24px 16px", textAlign: "center",
            }}
          >
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              No movements recorded yet
            </p>
          </div>
        ) : (
          <div style={{ paddingLeft: 4, marginBottom: 24 }}>
            {movements.map((m, i) => (
              <MovementRow key={m.id} movement={m} isLast={i === movements.length - 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        style={{
          fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
          textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4,
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: 13.5, fontWeight: 500 }}>{value}</p>
    </div>
  );
}

const SelectArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8'%3E%3Cpath d='M6 8L1 3h10z'/%3E%3C/svg%3E")`;
const selectStyle = { backgroundImage: SelectArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32, appearance: "none" as const };

function EditItemModal({ item, onClose }: { item: ItemDetailType; onClose: () => void }) {
  const { showToast } = useToast();
  const updateItem = useUpdateItem(item.id);
  const { data: sets = [] } = useSets();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: item.name,
    category: item.category,
    set_id: item.set_id ?? "",
    condition: item.condition,
    purchase_cost: item.purchase_cost,
    purchase_date: item.purchase_date.slice(0, 10),
    notes: item.notes ?? "",
  });
  const [photoUrl, setPhotoUrl] = useState(item.photo_url ?? "");
  const [photoPreview, setPhotoPreview] = useState(item.photo_url ?? "");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
    setUploadProgress(0);
    try {
      const url = await uploadImage(file, setUploadProgress);
      setPhotoUrl(url);
    } catch {
      showToast("Photo upload failed", "error");
      setPhotoPreview(item.photo_url ?? "");
    } finally {
      setUploadProgress(null);
    }
  }

  function removePhoto() {
    setPhotoUrl("");
    setPhotoPreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (uploadProgress !== null) { setError("Please wait for the photo to finish uploading"); return; }
    setError("");
    try {
      await updateItem.mutateAsync({
        name: form.name.trim(),
        category: form.category,
        set_id: form.set_id || null,
        condition: form.condition,
        purchase_cost: parseFloat(String(form.purchase_cost)) || 0,
        purchase_date: form.purchase_date,
        notes: form.notes.trim() || undefined,
        photo_url: photoUrl || undefined,
      });
      showToast("Item updated", "success");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet animate-in" style={{ maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <p style={{ fontSize: 17, fontWeight: 500, marginBottom: 16 }}>Edit item</p>

        {error && (
          <div style={{ padding: "9px 12px", borderRadius: "var(--radius-md)", background: "var(--red-dim)", color: "var(--red-text)", fontSize: 12.5, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Name */}
        <div style={{ marginBottom: 12 }}>
          <label className="form-label">Name</label>
          <input className="input-field" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>

        {/* Category + Condition */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label className="form-label">Category</label>
            <select className="input-field" style={selectStyle} value={form.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Condition</label>
            <select className="input-field" style={selectStyle} value={form.condition} onChange={(e) => set("condition", e.target.value)}>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>
        </div>

        {/* Set */}
        <div style={{ marginBottom: 12 }}>
          <label className="form-label">Set</label>
          <select className="input-field" style={selectStyle} value={form.set_id} onChange={(e) => set("set_id", e.target.value)}>
            <option value="">No set</option>
            {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Cost + Date */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label className="form-label">Cost ($)</label>
            <input type="number" min="0" step="0.01" className="input-field" value={form.purchase_cost} onChange={(e) => set("purchase_cost", e.target.value)} />
          </div>
          <div>
            <label className="form-label">Purchase date</label>
            <input type="date" className="input-field" value={form.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
          </div>
        </div>

        {/* Photo */}
        <div style={{ marginBottom: 12 }}>
          <label className="form-label">Photo</label>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />
          {!photoPreview ? (
            <button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: "100%", height: 80, border: "1.5px dashed var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-surface)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, color: "var(--text-tertiary)" }}>
              <CameraIcon />
              <span style={{ fontSize: 12 }}>Add photo</span>
            </button>
          ) : (
            <div style={{ position: "relative", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
              <img src={photoPreview} alt="Preview" style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
              {uploadProgress !== null && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <div style={{ width: "60%", height: 4, background: "rgba(255,255,255,0.3)", borderRadius: 2 }}>
                    <div style={{ width: `${uploadProgress}%`, height: "100%", background: "white", borderRadius: 2, transition: "width 0.1s" }} />
                  </div>
                  <span style={{ fontSize: 12, color: "white" }}>Uploading {uploadProgress}%</span>
                </div>
              )}
              {uploadProgress === null && (
                <button type="button" onClick={removePhoto} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 28, height: 28, color: "white", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 18 }}>
          <label className="form-label">Notes</label>
          <textarea className="input-field" style={{ resize: "vertical", minHeight: 70 }} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={updateItem.isPending}>
            {updateItem.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MovementRow({ movement: m, isLast }: { movement: Movement; isLast: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", position: "relative" }}>
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            width: 10, height: 10, borderRadius: "50%",
            background: movementDotColor(m.to_status),
            marginTop: 4,
          }}
        />
        {!isLast && (
          <div
            style={{
              width: 2, flex: 1, background: "var(--border)",
              marginTop: 4, minHeight: 20,
            }}
          />
        )}
      </div>
      <div style={{ paddingBottom: 4, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500 }}>
          {m.from_status} → {m.to_status}
        </p>
        <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 1 }}>
          {formatDate(m.created_at)} · by {m.performer.name}
          {m.job && ` · ${m.job.address}`}
        </p>
        {m.notes && (
          <p style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>
            {m.notes}
          </p>
        )}
      </div>
    </div>
  );
}
