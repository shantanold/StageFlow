import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useItem, useItemMovements } from "../../lib/queries";
import { downloadLabels, useQRCodeUrl } from "../../lib/labels";
import {
  getCategoryEmoji, statusBadgeClass, statusLabel,
  formatDate, formatCurrency, movementDotColor,
} from "../../lib/utils";
import type { Movement } from "../../types";

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
  );
}

function QRSection({ itemId }: { itemId: string }) {
  const { src, loading } = useQRCodeUrl(itemId);
  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    setPrinting(true);
    try { await downloadLabels([itemId]); } finally { setPrinting(false); }
  }

  return (
    <div
      className="card"
      style={{
        display: "flex", alignItems: "center", gap: 16,
      }}
    >
      {/* QR image */}
      <div
        style={{
          width: 80, height: 80, flexShrink: 0,
          background: "white", borderRadius: 8, padding: 4,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {loading ? (
          <div style={{ width: 16, height: 16, border: "2px solid #e5e7eb", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        ) : src ? (
          <img src={src} alt="QR code" style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} />
        ) : (
          <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Error</span>
        )}
      </div>

      {/* Label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>
          QR Label
        </p>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
          Scan to look up this item
        </p>
        <button
          className="btn btn-outline"
          style={{ padding: "6px 12px", fontSize: 12, gap: 5 }}
          onClick={handlePrint}
          disabled={printing || loading}
        >
          <PrinterIcon /> {printing ? "Generating…" : "Print label"}
        </button>
      </div>
    </div>
  );
}

export function ItemDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: item, isLoading, isError } = useItem(id);
  const { data: movements = [] } = useItemMovements(id);

  if (isLoading) {
    return (
      <div style={{ padding: "40px 18px", textAlign: "center" }}>
        <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</p>
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div style={{ padding: "40px 18px", textAlign: "center" }}>
        <p style={{ color: "var(--red-text)", fontSize: 13 }}>Item not found.</p>
      </div>
    );
  }

  return (
    <div className="animate-in">
      {/* Header */}
      <div className="page-header">
        <button
          className="back-btn"
          onClick={() => navigate(-1)}
          style={{ marginBottom: 10 }}
        >
          <BackIcon /> Back
        </button>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: 8,
              background: "var(--bg-surface)", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28,
            }}
          >
            {getCategoryEmoji(item.category)}
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.2px" }}>{item.name}</h1>
            <p
              style={{
                fontFamily: "var(--font-mono)", fontSize: 12,
                color: "var(--text-tertiary)", marginTop: 3,
              }}
            >
              {item.sku}
            </p>
            <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
              <span className={statusBadgeClass(item.status, item.condition)}>
                {statusLabel(item.status, item.condition)}
              </span>
              {item.condition === "fair" && (
                <span className="badge badge-amber">Fair condition</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 18px" }}>
        {/* Info grid */}
        <div
          className="card"
          style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14,
          }}
        >
          <InfoCell label="Category" value={item.category} />
          <InfoCell label="Set" value={item.set?.name ?? "None"} />
          <InfoCell label="Cost" value={formatCurrency(item.purchase_cost)} />
          <InfoCell label="Purchased" value={formatDate(item.purchase_date)} />
          {item.notes && (
            <div style={{ gridColumn: "1 / -1" }}>
              <InfoCell label="Notes" value={item.notes} />
            </div>
          )}
        </div>

        {/* QR code */}
        <QRSection itemId={item.id} />

        {/* Current job card */}
        {item.current_job && (
          <div
            className="card"
            style={{
              borderColor: "rgba(59,130,246,0.3)",
              cursor: "pointer",
            }}
            onClick={() => navigate(`/jobs/${item.current_job!.id}`)}
          >
            <p
              style={{
                fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
                textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6,
              }}
            >
              Currently staged at
            </p>
            <div
              style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: "#60a5fa" }}>
                  {item.current_job.address}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                  {item.current_job.city}, {item.current_job.state} · {item.current_job.client_name}
                </p>
              </div>
              <span style={{ color: "var(--text-tertiary)" }}>
                <ChevronRightIcon />
              </span>
            </div>
          </div>
        )}

        {/* Movement history */}
        <div
          style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 10, marginTop: 4,
          }}
        >
          <span className="section-title">Movement history</span>
        </div>

        {movements.length === 0 ? (
          <div
            style={{
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)", padding: "24px 16px", textAlign: "center",
            }}
          >
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              No movements recorded yet
            </p>
          </div>
        ) : (
          <div style={{ paddingLeft: 4, marginBottom: 24 }}>
            {movements.map((m, i) => (
              <MovementRow key={m.id} movement={m} isLast={i === movements.length - 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        style={{
          fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
          textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4,
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: 13.5, fontWeight: 500 }}>{value}</p>
    </div>
  );
}

function MovementRow({ movement: m, isLast }: { movement: Movement; isLast: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", position: "relative" }}>
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            width: 10, height: 10, borderRadius: "50%",
            background: movementDotColor(m.to_status),
            marginTop: 4,
          }}
        />
        {!isLast && (
          <div
            style={{
              width: 2, flex: 1, background: "var(--border)",
              marginTop: 4, minHeight: 20,
            }}
          />
        )}
      </div>
      <div style={{ paddingBottom: 4, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500 }}>
          {m.from_status} → {m.to_status}
        </p>
        <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 1 }}>
          {formatDate(m.created_at)} · by {m.performer.name}
          {m.job && ` · ${m.job.address}`}
        </p>
        {m.notes && (
          <p style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>
            {m.notes}
          </p>
        )}
      </div>
    </div>
  );
}
