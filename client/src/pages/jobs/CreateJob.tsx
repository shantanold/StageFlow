import { useState, FormEvent } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useCreateJob } from "../../lib/queries";
import { ApiError } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { localDateInputValue } from "../../lib/utils";

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function parseMoney(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function CreateJob() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const createJob = useCreateJob();
  const [form, setForm] = useState({
    address: "",
    city: "Pearland",
    state: "TX",
    zip: "",
    client_name: "",
    client_contact: "",
    // Local days: toISOString() would give tomorrow's date on a US evening.
    start_date: localDateInputValue(new Date()),
    expected_end_date: (() => { const d = new Date(); d.setMonth(d.getMonth() + 3); return localDateInputValue(d); })(),
    amount: "",
    monthly_rate: "",
    duration: "3 Months",
    market_value: "",
    extension_amount: "",
    total_paid: "",
    notes: "",
  });
  const [error, setError] = useState("");

  if (user?.role !== "manager") {
    return <Navigate to="/jobs" replace />;
  }

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

    const amount = parseMoney(form.amount);
    const monthlyRate = parseMoney(form.monthly_rate);
    const marketValue = parseMoney(form.market_value);
    const extensionAmount = parseMoney(form.extension_amount);
    const totalPaid = parseMoney(form.total_paid);
    if (
      amount === undefined ||
      monthlyRate === undefined ||
      marketValue === undefined ||
      extensionAmount === undefined ||
      totalPaid === undefined
    ) {
      setError("Price fields must be valid non-negative numbers");
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
        amount,
        monthly_rate: monthlyRate,
        duration: form.duration.trim() || null,
        market_value: marketValue,
        extension_amount: extensionAmount,
        total_paid: totalPaid,
        notes: form.notes.trim() || undefined,
      });
      showToast("Job created", "success");
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
      <div className="page-body form-narrow">
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

          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, marginTop: 4 }}>
            Pricing & property
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div>
              <label className="form-label">Amount</label>
              <input
                className="input-field"
                inputMode="decimal"
                placeholder="2900"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Monthly rate</label>
              <input
                className="input-field"
                inputMode="decimal"
                placeholder="966.67"
                value={form.monthly_rate}
                onChange={(e) => set("monthly_rate", e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div>
              <label className="form-label">Duration</label>
              <input
                className="input-field"
                placeholder="3 Months"
                value={form.duration}
                onChange={(e) => set("duration", e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Market value</label>
              <input
                className="input-field"
                inputMode="decimal"
                placeholder="749000"
                value={form.market_value}
                onChange={(e) => set("market_value", e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div>
              <label className="form-label">Extension amount</label>
              <input
                className="input-field"
                inputMode="decimal"
                placeholder="0"
                value={form.extension_amount}
                onChange={(e) => set("extension_amount", e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Total paid</label>
              <input
                className="input-field"
                inputMode="decimal"
                placeholder="2900"
                value={form.total_paid}
                onChange={(e) => set("total_paid", e.target.value)}
              />
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
