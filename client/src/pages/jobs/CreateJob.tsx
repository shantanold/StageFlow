import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateJob } from "../../lib/queries";
import { ApiError } from "../../lib/api";

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function CreateJob() {
  const navigate = useNavigate();
  const createJob = useCreateJob();
  const [form, setForm] = useState({
    address: "",
    city: "Pearland",
    state: "TX",
    zip: "",
    client_name: "",
    client_contact: "",
    start_date: new Date().toISOString().slice(0, 10),
    expected_end_date: "",
    notes: "",
  });
  const [error, setError] = useState("");

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.address.trim()) {
      setError("Street address is required");
      return;
    }
    if (!form.client_name.trim()) {
      setError("Client / Realtor is required");
      return;
    }
    if (!form.expected_end_date) {
      setError("Expected close date is required");
      return;
    }
    try {
      await createJob.mutateAsync({
        address: form.address.trim(),
        city: form.city.trim() || "Pearland",
        state: form.state.trim() || "TX",
        zip: form.zip.trim(),
        client_name: form.client_name.trim(),
        client_contact: form.client_contact.trim(),
        start_date: form.start_date,
        expected_end_date: form.expected_end_date,
        notes: form.notes.trim() || undefined,
      });
      navigate("/jobs");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate("/jobs")} style={{ marginBottom: 8 }}>
          <BackIcon /> Cancel
        </button>
        <div className="page-title">Create job</div>
      </div>
      <div style={{ padding: "0 18px" }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label className="form-label">Street address</label>
            <input
              className="input-field"
              placeholder="e.g. 4821 Elm Creek Dr"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div>
              <label className="form-label">City</label>
              <input className="input-field" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <label className="form-label">State</label>
              <input className="input-field" value={form.state} onChange={(e) => set("state", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Zip</label>
              <input className="input-field" placeholder="77584" value={form.zip} onChange={(e) => set("zip", e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div>
              <label className="form-label">Client / Realtor</label>
              <input className="input-field" placeholder="Company name" value={form.client_name} onChange={(e) => set("client_name", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Contact</label>
              <input className="input-field" placeholder="Phone or email" value={form.client_contact} onChange={(e) => set("client_contact", e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div>
              <label className="form-label">Start date</label>
              <input className="input-field" type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Expected close</label>
              <input className="input-field" type="date" value={form.expected_end_date} onChange={(e) => set("expected_end_date", e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="form-label">Notes</label>
            <textarea
              className="input-field"
              placeholder="Listing details, special instructions..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
            />
          </div>
          {error && (
            <p style={{ color: "var(--red-text)", fontSize: 13, marginBottom: 12 }}>{error}</p>
          )}
          <button type="submit" className="btn btn-primary btn-full" style={{ marginBottom: 20 }} disabled={createJob.isPending}>
            {createJob.isPending ? "Creating…" : "Create job"}
          </button>
        </form>
      </div>
    </div>
  );
}
