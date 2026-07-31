import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useBulkUnlabeled } from "../../lib/queries";
import { downloadLabels } from "../../lib/labels";
import { useToast } from "../../contexts/ToastContext";
import { ApiError } from "../../lib/api";

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

/** Create N blank QR stickers and print them in one flow — for pre-labeling furniture on-site. */
export function PrepLabels() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const bulk = useBulkUnlabeled();
  const [count, setCount] = useState(20);
  const [busy, setBusy] = useState(false);
  const [lastCreated, setLastCreated] = useState<string[] | null>(null);

  if (user?.role !== "manager") return <Navigate to="/more" replace />;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (count < 1 || count > 200) {
      showToast("Count must be between 1 and 200", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await bulk.mutateAsync(count);
      const ids = result.items.map((i) => i.id);
      setLastCreated(ids);
      showToast(`Created ${result.created} blank labels`, "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to create blanks", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    if (!lastCreated?.length) return;
    setBusy(true);
    try {
      await downloadLabels(lastCreated);
      showToast("Label PDF downloaded", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to generate PDF", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate("/more")} style={{ marginBottom: 8 }}>
          <BackIcon /> More
        </button>
        <h1 className="page-title">Prep Labels</h1>
        <p className="page-subtitle">
          Create blank QR stickers to print before a staging job. Fill in details later by scanning each label.
        </p>
      </div>

      <div className="page-body form-narrow">
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
            How many blank labels?
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number"
              min={1}
              max={200}
              className="input-field"
              value={count}
              onChange={(e) => setCount(Number(e.target.value) || 1)}
              style={{ width: 100 }}
            />
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ flex: 1 }}>
              {busy && !lastCreated ? "Creating…" : `Create ${count} blanks`}
            </button>
          </div>
        </form>

        {lastCreated && (
          <div className="card" style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 13, marginBottom: 12 }}>
              {lastCreated.length} blank label{lastCreated.length === 1 ? "" : "s"} ready. Print them now, then stick on furniture at the house.
            </p>
            <button className="btn btn-primary" style={{ width: "100%", marginBottom: 8 }} onClick={handlePrint} disabled={busy}>
              {busy ? "Preparing PDF…" : "Print these labels"}
            </button>
            <button className="btn btn-outline" style={{ width: "100%" }} onClick={() => navigate("/inventory?filter=needs_details")}>
              View blanks in inventory
            </button>
          </div>
        )}

        <p style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
          After sticking a label, open Scan → Quick Scan, scan the QR, and fill in the furniture details on the Claim form.
        </p>
      </div>
    </div>
  );
}
