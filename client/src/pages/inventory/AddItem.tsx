import { useState, FormEvent, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateItem } from "../../lib/queries";
import { useSets } from "../../lib/queries";
import { CATEGORIES } from "../../lib/utils";
import { ApiError } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import { uploadImage } from "../../lib/cloudinary";

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

const SelectArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8'%3E%3Cpath d='M6 8L1 3h10z'/%3E%3C/svg%3E")`;

export function AddItem() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createItem = useCreateItem();
  const { data: sets = [] } = useSets();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "",
    category: "Sofa",
    set_id: "",
    purchase_cost: "",
    purchase_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
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
      setPhotoPreview("");
    } finally {
      setUploadProgress(null);
    }
  }

  function removePhoto() {
    setPhotoUrl("");
    setPhotoPreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    if (uploadProgress !== null) {
      setError("Please wait for the photo to finish uploading");
      return;
    }
    try {
      await createItem.mutateAsync({
        name: form.name.trim(),
        category: form.category,
        set_id: form.set_id || null,
        purchase_cost: parseFloat(form.purchase_cost) || 0,
        purchase_date: form.purchase_date,
        notes: form.notes.trim() || undefined,
        photo_url: photoUrl || undefined,
      });
      showToast("Item added", "success");
      navigate(-1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
          <BackIcon /> Cancel
        </button>
        <h1 className="page-title">Add item</h1>
      </div>

      <div style={{ padding: "0 18px" }}>
        {error && (
          <div
            style={{
              padding: "10px 14px", borderRadius: "var(--radius-md)",
              background: "var(--red-dim)", color: "var(--red-text)",
              fontSize: 13, marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div style={{ marginBottom: 16 }}>
            <label className="form-label" htmlFor="name">Name</label>
            <input
              id="name"
              className="input-field"
              placeholder="e.g. Modern gray sofa"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </div>

          {/* Category + Set */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label className="form-label" htmlFor="category">Category</label>
              <select
                id="category"
                className="input-field"
                style={{ backgroundImage: SelectArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32, appearance: "none" }}
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="set_id">Set (optional)</label>
              <select
                id="set_id"
                className="input-field"
                style={{ backgroundImage: SelectArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32, appearance: "none" }}
                value={form.set_id}
                onChange={(e) => set("set_id", e.target.value)}
              >
                <option value="">No set</option>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cost + Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label className="form-label" htmlFor="cost">Cost ($)</label>
              <input
                id="cost"
                type="number"
                min="0"
                step="0.01"
                className="input-field"
                placeholder="0.00"
                value={form.purchase_cost}
                onChange={(e) => set("purchase_cost", e.target.value)}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="purchase_date">Purchase date</label>
              <input
                id="purchase_date"
                type="date"
                className="input-field"
                value={form.purchase_date}
                onChange={(e) => set("purchase_date", e.target.value)}
                required
              />
            </div>
          </div>

          {/* Photo */}
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Photo (optional)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={handlePhotoChange}
            />

            {!photoPreview ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: "100%", height: 100,
                  border: "1.5px dashed var(--border)", borderRadius: "var(--radius-md)",
                  background: "var(--bg-surface)", cursor: "pointer",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 6,
                  color: "var(--text-tertiary)",
                }}
              >
                <CameraIcon />
                <span style={{ fontSize: 12 }}>Take photo or choose from library</span>
              </button>
            ) : (
              <div style={{ position: "relative", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                <img
                  src={photoPreview}
                  alt="Preview"
                  style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }}
                />
                {/* Upload progress overlay */}
                {uploadProgress !== null && (
                  <div
                    style={{
                      position: "absolute", inset: 0,
                      background: "rgba(0,0,0,0.5)",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 8,
                    }}
                  >
                    <div style={{ width: "60%", height: 4, background: "rgba(255,255,255,0.3)", borderRadius: 2 }}>
                      <div style={{ width: `${uploadProgress}%`, height: "100%", background: "white", borderRadius: 2, transition: "width 0.1s" }} />
                    </div>
                    <span style={{ fontSize: 12, color: "white" }}>Uploading {uploadProgress}%</span>
                  </div>
                )}
                {/* Remove / retake button */}
                {uploadProgress === null && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    style={{
                      position: "absolute", top: 8, right: 8,
                      background: "rgba(0,0,0,0.6)", border: "none",
                      borderRadius: "50%", width: 28, height: 28,
                      color: "white", cursor: "pointer", fontSize: 16,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 24 }}>
            <label className="form-label" htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              className="input-field"
              placeholder="Optional notes…"
              style={{ resize: "vertical", minHeight: 80 }}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={createItem.isPending}
          >
            {createItem.isPending ? "Adding…" : "Add item"}
          </button>
        </form>
      </div>
    </div>
  );
}
