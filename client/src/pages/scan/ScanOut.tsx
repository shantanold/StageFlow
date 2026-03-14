import { useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useJob } from "../../lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { getCategoryEmoji } from "../../lib/utils";
import { useToast } from "../../contexts/ToastContext";
import { QrScannerView } from "./QrScannerView";
import type { Item } from "../../types";

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

interface ScanEntry {
  item: Item;
  status: "ok" | "error";
  message?: string;
}

export function ScanOut() {
  const { jobId = "" } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { data: job } = useJob(jobId);

  const [entries, setEntries] = useState<ScanEntry[]>([]);
  const [manualSku, setManualSku] = useState("");
  const [paused, setPaused] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const lastScanRef = useRef<string>("");
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SKUs already in the scan list (prevent adding duplicates)
  const scannedSkus = new Set(entries.map((e) => e.item.sku));

  async function processItem(sku: string) {
    const normalized = sku.trim().toUpperCase();
    if (!normalized) return;

    // Look up item by SKU
    let item: Item;
    try {
      item = await api.get<Item>(`/items/sku/${encodeURIComponent(normalized)}`);
    } catch {
      // Item not found — add error entry with placeholder
      setEntries((prev) => [
        { item: { id: "", sku: normalized, name: normalized, category: "", set_id: null, set: null, status: "available", condition: "good", photo_url: null, purchase_cost: "0", purchase_date: "", notes: null, created_at: "" }, status: "error", message: "Item not found in inventory" },
        ...prev,
      ]);
      return;
    }

    // Duplicate in this scan session?
    if (scannedSkus.has(item.sku)) {
      return; // silently skip
    }

    if (item.status !== "available") {
      setEntries((prev) => [
        { item, status: "error", message: item.status === "staged" ? "Already staged on another job" : "Item is disposed" },
        ...prev,
      ]);
    } else {
      setEntries((prev) => [{ item, status: "ok" }, ...prev]);
    }
  }

  function handleScan(text: string) {
    if (text === lastScanRef.current) return;
    lastScanRef.current = text;
    setPaused(true);
    if (cooldownRef.current) clearTimeout(cooldownRef.current);
    cooldownRef.current = setTimeout(() => {
      lastScanRef.current = "";
      setPaused(false);
    }, 1500);
    processItem(text);
  }

  function handleManual(e: React.FormEvent) {
    e.preventDefault();
    processItem(manualSku);
    setManualSku("");
  }

  async function handleConfirm() {
    const validIds = entries.filter((e) => e.status === "ok" && e.item.id).map((e) => e.item.id);
    if (validIds.length === 0 || assigning) return;
    setAssigning(true);
    try {
      await api.post(`/jobs/${jobId}/assign`, { itemIds: validIds });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      showToast(`${validIds.length} item${validIds.length !== 1 ? "s" : ""} assigned`, "success");
      navigate(`/jobs/${jobId}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Assignment failed", "error");
    } finally {
      setAssigning(false);
    }
  }

  const validCount = entries.filter((e) => e.status === "ok").length;

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(`/jobs/${jobId}`)} style={{ marginBottom: 8 }}>
          <BackIcon /> Job
        </button>
        <h1 className="page-title">Scan Out</h1>
        {job && (
          <p className="page-subtitle">{job.address} · {job.client_name}</p>
        )}
      </div>

      <div style={{ padding: "0 18px" }}>
        <QrScannerView onScan={handleScan} paused={paused} />

        {/* Manual entry */}
        <form onSubmit={handleManual} style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            className="input-field"
            placeholder="Enter SKU manually…"
            value={manualSku}
            onChange={(e) => setManualSku(e.target.value.toUpperCase())}
            style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 13 }}
          />
          <button className="btn btn-outline" type="submit" style={{ padding: "9px 16px", fontSize: 13 }}>
            Add
          </button>
        </form>

        {/* Running list */}
        {entries.length > 0 && (
          <div style={{ marginTop: 16, marginBottom: 100 }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.6px" }}>
              Scanned — {validCount} ready to assign
            </div>
            <div className="list-card">
              {entries.map((entry, i) => (
                <ScanRow key={i} entry={entry} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fixed action bar */}
      <div
        style={{
          position: "fixed",
          bottom: "calc(70px + env(safe-area-inset-bottom, 0px))",
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 480,
          padding: "10px 18px",
          background: "var(--bg-card)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 99,
        }}
      >
        <div>
          <p style={{ fontSize: 13, fontWeight: 500 }}>
            {validCount === 0 ? "Scan items to assign" : `${validCount} item${validCount !== 1 ? "s" : ""} ready`}
          </p>
          {entries.length > validCount && (
            <p style={{ fontSize: 11, color: "var(--red-text)", marginTop: 1 }}>
              {entries.length - validCount} with issues
            </p>
          )}
        </div>
        <button
          className="btn btn-primary"
          style={{ padding: "9px 16px", fontSize: 13 }}
          disabled={validCount === 0 || assigning}
          onClick={handleConfirm}
        >
          {assigning ? "Assigning…" : `Confirm & Assign (${validCount})`}
        </button>
      </div>
    </div>
  );
}

function ScanRow({ entry }: { entry: ScanEntry }) {
  const ok = entry.status === "ok";
  return (
    <div
      className="list-row"
      style={{ background: ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)" }}
    >
      <div
        style={{
          width: 36, height: 36, borderRadius: 6, flexShrink: 0,
          background: "var(--bg-surface)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
        }}
      >
        {entry.item.category ? getCategoryEmoji(entry.item.category) : "📦"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {entry.item.name || entry.item.sku}
        </p>
        <p style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginTop: 1 }}>
          {entry.item.sku}
        </p>
        {!ok && entry.message && (
          <p style={{ fontSize: 11, color: "var(--red-text)", marginTop: 1 }}>{entry.message}</p>
        )}
      </div>
      <div
        style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: ok ? "var(--green-text)" : "var(--red-text)",
        }}
      />
    </div>
  );
}
