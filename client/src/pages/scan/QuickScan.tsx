import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
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

export function QuickScan() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [manualSku, setManualSku] = useState("");
  const [paused, setPaused] = useState(false);
  const lastScanRef = useRef<string>("");
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function lookupSku(sku: string) {
    const normalized = sku.trim().toUpperCase();
    if (!normalized) return;
    try {
      const item = await api.get<Item>(`/items/sku/${encodeURIComponent(normalized)}`);
      navigate(`/inventory/${item.id}`);
    } catch {
      showToast("No item found for that SKU", "error");
      // Resume scanner after a moment so user can try again
      setTimeout(() => {
        lastScanRef.current = "";
        setPaused(false);
      }, 1500);
    }
  }

  function handleScan(text: string) {
    if (text === lastScanRef.current) return;
    lastScanRef.current = text;
    setPaused(true);
    if (cooldownRef.current) clearTimeout(cooldownRef.current);
    lookupSku(text);
  }

  function handleManual(e: React.FormEvent) {
    e.preventDefault();
    lookupSku(manualSku);
    setManualSku("");
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate("/scan")} style={{ marginBottom: 8 }}>
          <BackIcon /> Scan
        </button>
        <h1 className="page-title">Quick Scan</h1>
        <p className="page-subtitle">Scan any item to open its detail page</p>
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
      </div>
    </div>
  );
}
