import { useState, FormEvent } from "react";
import { useUpdateJob } from "../../lib/queries";
import { ApiError } from "../../lib/api";
import { ModalOverlay } from "../../components/ModalOverlay";
import type { Job } from "../../types";

interface EditJobModalProps {
  job: Job;
  onClose: () => void;
}

function moneyField(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function parseMoney(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function EditJobModal({ job, onClose }: EditJobModalProps) {
  const updateJob = useUpdateJob(job.id);
  const [form, setForm] = useState({
    address: job.address,
    city: job.city,
    state: job.state,
    zip: job.zip,
    client_name: job.client_name,
    client_contact: job.client_contact,
    start_date: job.start_date.slice(0, 10),
    expected_end_date: job.expected_end_date.slice(0, 10),
    destaged_at: job.destaged_at ? job.destaged_at.slice(0, 10) : "",
    status: job.status,
    amount: moneyField(job.amount),
    monthly_rate: moneyField(job.monthly_rate),
    duration: job.duration ?? "",
    market_value: moneyField(job.market_value),
    extension_amount: moneyField(job.extension_amount),
    total_paid: moneyField(job.total_paid),
    notes: job.notes ?? "",
  });
  const [error, setError] = useState("");

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError("");

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
      await updateJob.mutateAsync({
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip: form.zip.trim(),
        client_name: form.client_name.trim(),
        client_contact: form.client_contact.trim(),
        start_date: form.start_date,
        expected_end_date: form.expected_end_date,
        destaged_at: form.destaged_at || null,
        status: form.status,
        amount,
        monthly_rate: monthlyRate,
        duration: form.duration.trim() || null,
        market_value: marketValue,
        extension_amount: extensionAmount,
        total_paid: totalPaid,
        notes: form.notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 16 }}>Edit job</div>
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 14 }}>
            <label className="form-label">Address</label>
            <input className="input-field" value={form.address} onChange={(e) => set("address", e.target.value)} />
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
              <input className="input-field" value={form.zip} onChange={(e) => set("zip", e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div>
              <label className="form-label">Client</label>
              <input className="input-field" value={form.client_name} onChange={(e) => set("client_name", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Contact</label>
              <input className="input-field" value={form.client_contact} onChange={(e) => set("client_contact", e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div>
              <label className="form-label">Expected close date</label>
              <input className="input-field" type="date" value={form.expected_end_date} onChange={(e) => set("expected_end_date", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Destaged on</label>
              <input className="input-field" type="date" value={form.destaged_at} onChange={(e) => set("destaged_at", e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="form-label">Status</label>
            <select className="input-field" value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>
            Pricing & property
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div>
              <label className="form-label">Amount</label>
              <input className="input-field" inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Monthly rate</label>
              <input className="input-field" inputMode="decimal" value={form.monthly_rate} onChange={(e) => set("monthly_rate", e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div>
              <label className="form-label">Duration</label>
              <input className="input-field" value={form.duration} onChange={(e) => set("duration", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Market value</label>
              <input className="input-field" inputMode="decimal" value={form.market_value} onChange={(e) => set("market_value", e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div>
              <label className="form-label">Extension amount</label>
              <input className="input-field" inputMode="decimal" value={form.extension_amount} onChange={(e) => set("extension_amount", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Total paid</label>
              <input className="input-field" inputMode="decimal" value={form.total_paid} onChange={(e) => set("total_paid", e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="form-label">Notes</label>
            <textarea className="input-field" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>
          {error && <p style={{ color: "var(--red-text)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={updateJob.isPending}>
              {updateJob.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}
