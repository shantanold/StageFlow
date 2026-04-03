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

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function ScanOut() {
  const { jobId = "" } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const { data: job } = useJob(jobId);
  const { data: jobItems = [], isLoading } = useJobItems(jobId);

  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  const [manualSku, setManualSku] = useState("");
  const [paused, setPaused] = useState(false);
  const lastScanRef = useRef<string>("");
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Items still waiting to be scanned (assigned but not yet loaded)
  const pendingItems = jobItems.filter(
    (ji) => ji.status === "assigned" && !loadedIds.has(ji.item_id)
  );
  const totalItems = jobItems.length;
  const loadedCount = jobItems.filter((ji) => ji.status === "loaded" || ji.status === "delivered" || ji.status === "picked_up").length + loadedIds.size;

  async function processItem(skuOrId: string) {
    const normalized = skuOrId.trim().toUpperCase();
    if (!normalized) return;

    // Look up item by SKU
    let item: Item;
    try {
      item = await api.get<Item>(`/items/sku/${encodeURIComponent(normalized)}`);
    } catch {
      showToast(`SKU "${normalized}" not found`, "error");
      setTimeout(() => { lastScanRef.current = ""; setPaused(false); }, 1500);
      return;
    }

    // Call scan-out endpoint
    try {
      const res = await api.post<{ item: Item; job_activated: boolean; remaining_to_load: number }>(
        `/jobs/${jobId}/scan-out`,
        { itemId: item.id }
      );

      setLoadedIds((prev) => new Set([...prev, item.id]));
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs", jobId, "items"] });
      qc.invalidateQueries({ queryKey: ["items"] });

      if (res.job_activated) {
        showToast("Job is now active!", "success");
      } else {
        showToast(`${item.name} loaded`, "success");
      }

      if (res.remaining_to_load === 0) {
        showToast("All items loaded!", "success");
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Scan failed";
      showToast(msg, "error");
    } finally {
      setTimeout(() => { lastScanRef.current = ""; setPaused(false); }, 1200);
    }
  }

  function handleScan(text: string) {
    if (text === lastScanRef.current) return;
    lastScanRef.current = text;
    setPaused(true);
    if (cooldownRef.current) clearTimeout(cooldownRef.current);
    processItem(text);
  }

  function handleManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manualSku.trim()) return;
    setPaused(true);
    lastScanRef.current = manualSku;
    processItem(manualSku);
    setManualSku("");
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(`/jobs/${jobId}`)} style={{ marginBottom: 8 }}>
          <BackIcon /> Job
        </button>
        <h1 className="page-title">Load Items</h1>
        {job && (
          <p className="page-subtitle">{job.address} · {job.client_name}</p>
        )}
      </div>

      <div style={{ padding: "0 18px" }}>
        {/* Progress */}
        {totalItems > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Items loaded</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{loadedCount} / {totalItems}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--bg-surface)" }}>
              <div style={{ height: "100%", borderRadius: 3, background: "var(--accent)", width: `${totalItems > 0 ? (loadedCount / totalItems) * 100 : 0}%`, transition: "width 0.3s ease" }} />
            </div>
          </div>
        )}

        <QrScannerView onScan={handleScan} paused={paused} />

        {/* Manual entry */}
        <form onSubmit={handleManual} style={{ display: "flex", gap: 8, marginTop: 12, marginBottom: 20 }}>
          <input
            className="input-field"
            placeholder="Enter SKU manually…"
            value={manualSku}
            onChange={(e) => setManualSku(e.target.value.toUpperCase())}
            style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 13 }}
          />
          <button className="btn btn-outline" type="submit" style={{ padding: "9px 16px", fontSize: 13 }}>
            Load
          </button>
        </form>

        {/* Checklist of assigned items */}
        {isLoading ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center" }}>Loading…</p>
        ) : jobItems.length === 0 ? (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "28px 16px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No items assigned to this job yet.</p>
          </div>
        ) : (
          <>
            {pendingItems.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.6px" }}>
                  Waiting to scan ({pendingItems.length})
                </div>
                <div className="list-card" style={{ marginBottom: 14 }}>
                  {pendingItems.map((ji) => (
                    <ItemRow key={ji.item_id} item={ji.item} loaded={false} />
                  ))}
                </div>
              </>
            )}

            {loadedIds.size > 0 && (
              <>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.6px" }}>
                  Loaded this session ({loadedIds.size})
                </div>
                <div className="list-card" style={{ marginBottom: 24 }}>
                  {jobItems
                    .filter((ji) => loadedIds.has(ji.item_id))
                    .map((ji) => (
                      <ItemRow key={ji.item_id} item={ji.item} loaded={true} />
                    ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ItemRow({ item, loaded }: { item: Item; loaded: boolean }) {
  return (
    <div className="list-row" style={{ background: loaded ? "rgba(16,185,129,0.07)" : undefined }}>
      <div style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0, background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, overflow: "hidden" }}>
        {item.photo_url
          ? <img src={item.photo_url} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : getCategoryEmoji(item.category)
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
        <p style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginTop: 1 }}>{item.sku}</p>
      </div>
      {loaded ? (
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "white" }}>
          <CheckIcon />
        </div>
      ) : (
        <div style={{ width: 22, height: 22, borderRadius: "50%", border: "1.5px dashed var(--border)", flexShrink: 0 }} />
      )}
    </div>
  );
}
