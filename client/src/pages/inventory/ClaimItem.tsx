import { useState, FormEvent, useRef, useMemo } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { useItem, useClaimItem, useSets, useItems, useJobs } from "../../lib/queries";
import { CATEGORIES, uniqueItemTemplates } from "../../lib/utils";
import { displayPhotoUrl, uploadImage } from "../../lib/cloudinary";
import { useToast } from "../../contexts/ToastContext";
import { ApiError } from "../../lib/api";
import type { Item } from "../../types";

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

/** Fill in details for a pre-printed blank QR sticker. */
export function ClaimItem() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: item, isLoading } = useItem(id);
  const claim = useClaimItem(id);
  const { data: sets = [] } = useSets();
  const { data: templates = [] } = useItems({ is_unlabeled: false });
  const { data: allJobs = [] } = useJobs();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "",
    category: "Sofa",
    set_id: "",
    purchase_cost: "",
    width_in: "",
    depth_in: "",
    height_in: "",
    notes: "",
  });
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [jobId, setJobId] = useState("");
  const [error, setError] = useState("");

  const claimedTemplates = useMemo(
    () => uniqueItemTemplates(templates.filter((t) => t.id !== id)),
    [templates, id]
  );

  const openJobs = useMemo(
    () => allJobs.filter((j) => j.status === "planning" || j.status === "active"),
    [allJobs]
  );

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function applyTemplate(source: Item) {
    setTemplateId(source.id);
    setForm({
      name: source.name,
      category: source.category,
      set_id: source.set_id ?? "",
      purchase_cost: "",
      width_in: source.width_in ?? "",
      depth_in: source.depth_in ?? "",
      height_in: source.height_in ?? "",
      notes: source.notes ?? "",
    });
    if (source.photo_url) {
      setPhotoUrl(source.photo_url);
      setPhotoPreview(displayPhotoUrl(source.photo_url) ?? source.photo_url);
    } else {
      setPhotoUrl("");
      setPhotoPreview("");
    }
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (uploadProgress !== null) {
      setError("Please wait for the photo to finish uploading");
      return;
    }
    try {
      await claim.mutateAsync({
        name: form.name.trim(),
        category: form.category,
        set_id: form.set_id || null,
        purchase_cost: form.purchase_cost ? Number(form.purchase_cost) : 0,
        width_in: form.width_in ? Number(form.width_in) : null,
        depth_in: form.depth_in ? Number(form.depth_in) : null,
        height_in: form.height_in ? Number(form.height_in) : null,
        notes: form.notes || undefined,
        photo_url: photoUrl || undefined,
        job_id: jobId || null,
      });
      showToast(jobId ? "Item claimed and assigned to job" : "Item claimed", "success");
      navigate(`/inventory/${id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to claim item");
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: "40px 18px", textAlign: "center" }}>
        <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div style={{ padding: "40px 18px", textAlign: "center" }}>
        <p style={{ color: "var(--red-text)", fontSize: 13 }}>Item not found.</p>
      </div>
    );
  }

  if (!item.is_unlabeled) {
    return <Navigate to={`/inventory/${id}`} replace />;
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
          <BackIcon /> Back
        </button>
        <h1 className="page-title">Claim label</h1>
        <p className="page-subtitle" style={{ fontFamily: "var(--font-mono)" }}>{item.sku}</p>
      </div>

      <form onSubmit={handleSubmit} className="page-body form-narrow" style={{ paddingBottom: 40 }}>
        <div className="card" style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
            Copy from existing item
          </label>
          <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 10 }}>
            Duplicates with the same name, category, and set are hidden. Tap a row to reuse its details.
          </p>
          {claimedTemplates.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No existing items to copy from.</p>
          ) : (
            <div
              className="list-card"
              style={{
                marginBottom: 0,
                maxHeight: 280,
                overflowY: "auto",
              }}
            >
              {claimedTemplates.map((t) => {
                const selected = templateId === t.id;
                const thumb = displayPhotoUrl(t.photo_url);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="list-row"
                    onClick={() => applyTemplate(t)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      background: selected ? "rgba(59,130,246,0.12)" : "transparent",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: "inherit",
                    }}
                  >
                    <div
                      className="photo-frame"
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        flexShrink: 0,
                        fontSize: 18,
                      }}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" className="photo-contain" />
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>📦</span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                        {t.category}
                        {t.set?.name ? ` · ${t.set.name}` : ""}
                      </div>
                    </div>
                    {selected && (
                      <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>Selected</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Name *</label>
            <input className="input-field" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Modern gray sofa" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Category *</label>
            <select className="input-field" value={form.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Set</label>
            <select className="input-field" value={form.set_id} onChange={(e) => set("set_id", e.target.value)}>
              <option value="">None</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <input className="input-field" type="number" step="0.1" placeholder="W" value={form.width_in} onChange={(e) => set("width_in", e.target.value)} />
            <input className="input-field" type="number" step="0.1" placeholder="D" value={form.depth_in} onChange={(e) => set("depth_in", e.target.value)} />
            <input className="input-field" type="number" step="0.1" placeholder="H" value={form.height_in} onChange={(e) => set("height_in", e.target.value)} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Assign to job (optional)</label>
            <select className="input-field" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">— Don’t assign yet —</option>
              {openJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.address} ({j.status})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Notes</label>
            <textarea className="input-field" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Photo</label>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} />
            {photoPreview && (
              <div className="photo-preview-frame" style={{ marginTop: 8 }}>
                <img src={photoPreview} alt="" />
              </div>
            )}
            {uploadProgress !== null && (
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Uploading {uploadProgress}%</p>
            )}
          </div>
        </div>

        {error && <p style={{ color: "var(--red-text)", fontSize: 13, marginBottom: 10 }}>{error}</p>}

        <button className="btn btn-primary" type="submit" style={{ width: "100%" }} disabled={claim.isPending}>
          {claim.isPending ? "Saving…" : jobId ? "Claim & assign" : "Claim item"}
        </button>
      </form>
    </div>
  );
}
