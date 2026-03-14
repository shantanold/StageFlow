import { useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useJob, useJobItems } from "../../lib/queries";
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

type ReturnCondition = "good" | "damaged" | "dispose";

interface ReturnEntry {
  item: Item;
  condition: ReturnCondition;
  notes?: string;
}

interface PendingItem {
  item: Item;
}

export function ScanReturn() {
  const { jobId = "" } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const { data: job } = useJob(jobId);
  const { data: jobItems = [] } = useJobItems(jobId);

  const [returnedItems, setReturnedItems] = useState<ReturnEntry[]>([]);
  const [pending, setPending] = useState<PendingItem | null>(null);
  const [manualSku, setManualSku] = useState("");
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobDone, setJobDone] = useState(false);
  const lastScanRef = useRef<string>("");
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Total items expected for return (non-returned job items)
  const totalExpected = jobItems.filter((ji) => ji.status !== "returned").length + returnedItems.length;
  const returnedCount = returnedItems.length;

  const returnedItemIds = new Set(returnedItems.map((r) => r.item.id));

  async function lookupAndPrompt(sku: string) {
    const normalized = sku.trim().toUpperCase();
    if (!normalized) return;
    setError(null);

    let item: Item;
    try {
      item = await api.get<Item>(`/items/sku/${encodeURIComponent(normalized)}`);
    } catch {
      setError(`SKU "${normalized}" not found`);
      return;
    }

    // Already returned in this session?
    if (returnedItemIds.has(item.id)) {
      setError(`${item.name} already returned`);
      return;
    }

    // Check it's actually on this job
    const onJob = jobItems.some((ji) => ji.item_id === item.id && ji.status !== "returned");
    if (!onJob) {
      setError(`${item.name} is not on this job or already returned`);
      return;
    }

    setPending({ item });
    setPaused(true);
  }

  function handleScan(text: string) {
    if (text === lastScanRef.current) return;
    lastScanRef.current = text;
    if (cooldownRef.current) clearTimeout(cooldownRef.current);
    cooldownRef.current = setTimeout(() => { lastScanRef.current = ""; }, 2000);
    lookupAndPrompt(text);
  }

  function handleManual(e: React.FormEvent) {
    e.preventDefault();
    lookupAndPrompt(manualSku);
    setManualSku("");
  }

  async function processReturn(condition: ReturnCondition) {
    if (!pending) return;
    const { item } = pending;
    setPending(null);

    try {
      const res = await api.post<{ item: Item; job_completed: boolean; remaining: number }>(
        `/jobs/${jobId}/scan-return`,
        { itemId: item.id, condition }
      );
      setReturnedItems((prev) => [{ item: res.item ?? item, condition }, ...prev]);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs", jobId, "items"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      showToast(`${item.name} returned`, "success");
      if (res.job_completed) setJobDone(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Return failed";
      setError(msg);
    } finally {
      setPaused(false);
    }
  }

  function dismissPending() {
    setPending(null);
    setPaused(false);
  }

  if (jobDone) {
    return (
      <div style={{ padding: "60px 18px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>All items returned!</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 24 }}>
          Job has been marked as completed.
        </p>
        <button className="btn btn-primary" onClick={() => navigate(`/jobs/${jobId}`)}>
          Back to job
        </button>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(`/jobs/${jobId}`)} style={{ marginBottom: 8 }}>
          <BackIcon /> Job
        </button>
        <h1 className="page-title">Scan Return</h1>
        {job && (
          <p className="page-subtitle">{job.address} · {job.client_name}</p>
        )}
      </div>

      <div style={{ padding: "0 18px" }}>
        {/* Progress bar */}
        {totalExpected > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Progress</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                {returnedCount} / {totalExpected}
              </span>
            </div>
            <div
              style={{
                height: 6, borderRadius: 3,
                background: "var(--bg-surface)",
              }}
            >
              <div
                style={{
                  height: "100%", borderRadius: 3,
                  background: "var(--green-text)",
                  width: `${totalExpected > 0 ? (returnedCount / totalExpected) * 100 : 0}%`,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* Condition prompt overlay */}
        {pending && (
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: 16,
              marginBottom: 14,
            }}
          >
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Condition check</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div
                style={{
                  width: 40, height: 40, borderRadius: 6, flexShrink: 0,
                  background: "var(--bg-surface)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                }}
              >
                {getCategoryEmoji(pending.item.category)}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600 }}>{pending.item.name}</p>
                <p style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                  {pending.item.sku}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-outline"
                style={{ flex: 1, fontSize: 13, borderColor: "rgba(34,197,94,0.4)", color: "var(--green-text)" }}
                onClick={() => processReturn("good")}
              >
                Good
              </button>
              <button
                className="btn btn-outline"
                style={{ flex: 1, fontSize: 13, borderColor: "rgba(251,191,36,0.4)", color: "var(--amber-text)" }}
                onClick={() => processReturn("damaged")}
              >
                Damaged
              </button>
              <button
                className="btn btn-outline"
                style={{ flex: 1, fontSize: 13, borderColor: "rgba(239,68,68,0.4)", color: "var(--red-text)" }}
                onClick={() => processReturn("dispose")}
              >
                Dispose
              </button>
            </div>
            <button
              className="btn btn-outline btn-full"
              style={{ marginTop: 8, fontSize: 12 }}
              onClick={dismissPending}
            >
              Cancel
            </button>
          </div>
        )}

        {!pending && (
          <>
            <QrScannerView onScan={handleScan} paused={paused} />

            <form onSubmit={handleManual} style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                className="input-field"
                placeholder="Enter SKU manually…"
                value={manualSku}
                onChange={(e) => setManualSku(e.target.value.toUpperCase())}
                style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 13 }}
              />
              <button className="btn btn-outline" type="submit" style={{ padding: "9px 16px", fontSize: 13 }}>
                Check
              </button>
            </form>
          </>
        )}

        {error && (
          <div
            style={{
              marginTop: 10,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "var(--radius-lg)",
              padding: "10px 14px",
              fontSize: 12.5,
              color: "var(--red-text)",
            }}
          >
            {error}
          </div>
        )}

        {/* Returned items list */}
        {returnedItems.length > 0 && (
          <div style={{ marginTop: 16, paddingBottom: 24 }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.6px" }}>
              Returned this session
            </div>
            <div className="list-card">
              {returnedItems.map((entry, i) => (
                <ReturnRow key={i} entry={entry} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReturnRow({ entry }: { entry: ReturnEntry }) {
  const conditionColor =
    entry.condition === "good" ? "var(--green-text)" :
    entry.condition === "damaged" ? "var(--amber-text)" :
    "var(--red-text)";

  return (
    <div className="list-row">
      <div
        style={{
          width: 36, height: 36, borderRadius: 6, flexShrink: 0,
          background: "var(--bg-surface)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
        }}
      >
        {getCategoryEmoji(entry.item.category)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {entry.item.name}
        </p>
        <p style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginTop: 1 }}>
          {entry.item.sku}
        </p>
      </div>
      <span
        style={{
          fontSize: 11, fontWeight: 600, color: conditionColor,
          textTransform: "capitalize", flexShrink: 0,
        }}
      >
        {entry.condition}
      </span>
    </div>
  );
}
