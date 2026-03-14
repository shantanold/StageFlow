interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  confirmDanger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-sheet"
        style={{ padding: "24px 20px calc(24px + env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-handle" />
        <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{title}</p>
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            style={{
              flex: 1,
              background: confirmDanger ? "var(--red)" : undefined,
            }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
