import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { getCategoryEmoji, statusBadgeClass, statusLabel } from "../../lib/utils";
import { QrScannerView } from "./QrScannerView";
import type { Item } from "../../types";

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function QuickScan() {
  const navigate = useNavigate();
  const [scannedItem, setScannedItem] = useState<Item | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [manualSku, setManualSku] = useState("");
  const [paused, setPaused] = useState(false);
  const lastScanRef = useRef<string>("");
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function lookupSku(sku: string) {
    const normalized = sku.trim().toUpperCase();
    if (!normalized) return;
    setNotFound(false);
    setScannedItem(null);
    try {
      const item = await api.get<Item>(`/items/sku/${encodeURIComponent(normalized)}`);
      setScannedItem(item);
    } catch {
      setNotFound(true);
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
    }, 2000);
    lookupSku(text);
  }

  function handleManual(e: React.FormEvent) {
    e.preventDefault();
    lookupSku(manualSku);
    setManualSku("");
  }

  return (
    <div>
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate("/scan")} style={{ marginBottom: 8 }}>
          <BackIcon /> Scan
        </button>
        <h1 className="page-title">Quick Scan</h1>
        <p className="page-subtitle">Scan any item to look it up</p>
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
          <button className="btn btn-primary" type="submit" style={{ padding: "9px 16px", fontSize: 13 }}>
            Look up
          </button>
        </form>

        {/* Result */}
        {notFound && (
          <div
            style={{
              marginTop: 14,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "var(--radius-lg)",
              padding: "14px 16px",
              fontSize: 13,
              color: "var(--red-text)",
            }}
          >
            No item found for that SKU.
          </div>
        )}

        {scannedItem && (
          <div
            className="card"
            style={{ marginTop: 14, cursor: "pointer" }}
            onClick={() => navigate(`/inventory/${scannedItem.id}`)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: 8, flexShrink: 0,
                  background: "var(--bg-surface)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                }}
              >
                {getCategoryEmoji(scannedItem.category)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{scannedItem.name}</p>
                <p style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                  {scannedItem.sku}
                </p>
                {scannedItem.set && (
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
                    {scannedItem.set.name}
                  </p>
                )}
              </div>
              <span className={statusBadgeClass(scannedItem.status, scannedItem.condition)}>
                {statusLabel(scannedItem.status, scannedItem.condition)}
              </span>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 10, textAlign: "center" }}>
              Tap to open full detail →
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
