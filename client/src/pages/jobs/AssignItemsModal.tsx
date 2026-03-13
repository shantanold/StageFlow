import { useState } from "react";
import { useSets, useItems, useAssignItems } from "../../lib/queries";
import { getCategoryEmoji } from "../../lib/utils";
import type { Item } from "../../types";

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

interface AssignItemsModalProps {
  jobId: string;
  onClose: () => void;
}

export function AssignItemsModal({ jobId, onClose }: AssignItemsModalProps) {
  const assignItems = useAssignItems(jobId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"sets" | "individual">("sets");

  const { data: sets = [] } = useSets();
  const { data: allItems = [] } = useItems({ status: "available" });

  const toggleItem = (itemId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleSet = (setId: string) => {
    const setItems = allItems.filter((i) => i.set_id === setId);
    const allSelected = setItems.every((i) => selected.has(i.id));
    setSelected((prev) => {
      const next = new Set(prev);
      setItems.forEach((i) => (allSelected ? next.delete(i.id) : next.add(i.id)));
      return next;
    });
  };

  const handleAssign = async () => {
    if (selected.size === 0) return;
    try {
      await assignItems.mutateAsync([...selected]);
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Assign failed");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90vh" }}>
        <div className="modal-handle" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>Assign items</div>
          <span className="badge badge-blue">{selected.size} selected</span>
        </div>
        <div className="chip-row" style={{ marginBottom: 10 }}>
          <button className={`chip ${mode === "sets" ? "active" : ""}`} onClick={() => setMode("sets")}>
            By set
          </button>
          <button className={`chip ${mode === "individual" ? "active" : ""}`} onClick={() => setMode("individual")}>
            Individual
          </button>
        </div>

        {mode === "sets" ? (
          <div style={{ maxHeight: 350, overflowY: "auto" }}>
            {sets.map((set) => {
              const avail = allItems.filter((i) => i.set_id === set.id);
              if (avail.length === 0) return null;
              const allSel = avail.every((i) => selected.has(i.id));
              const someSel = avail.some((i) => selected.has(i.id));
              return (
                <div key={set.id} style={{ marginBottom: 10 }}>
                  <div
                    className="card"
                    style={{
                      cursor: "pointer",
                      borderColor: someSel ? "rgba(59,130,246,0.4)" : undefined,
                    }}
                    onClick={() => toggleSet(set.id)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 4,
                          border: `2px solid ${allSel ? "var(--accent)" : "var(--text-tertiary)"}`,
                          background: allSel ? "var(--accent)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {allSel && (
                          <span style={{ color: "white" }}>
                            <CheckIcon />
                          </span>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{set.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{avail.length} items available</div>
                      </div>
                    </div>
                  </div>
                  {someSel && (
                    <div style={{ paddingLeft: 14 }}>
                      {avail.map((item: Item) => (
                        <div
                          key={item.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "5px 0",
                            cursor: "pointer",
                            fontSize: 12.5,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleItem(item.id);
                          }}
                        >
                          <div
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 3,
                              border: `1.5px solid ${selected.has(item.id) ? "var(--accent)" : "var(--text-tertiary)"}`,
                              background: selected.has(item.id) ? "var(--accent)" : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {selected.has(item.id) && (
                              <span style={{ color: "white" }}>
                                <CheckIcon />
                              </span>
                            )}
                          </div>
                          <span style={{ color: selected.has(item.id) ? "var(--text-primary)" : "var(--text-secondary)" }}>
                            {item.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Standalone items as a "set" */}
            {(() => {
              const standalone = allItems.filter((i) => !i.set_id);
              if (standalone.length === 0) return null;
              const allSel = standalone.every((i) => selected.has(i.id));
              const someSel = standalone.some((i) => selected.has(i.id));
              return (
                <div style={{ marginBottom: 10 }}>
                  <div
                    className="card"
                    style={{
                      cursor: "pointer",
                      borderColor: someSel ? "rgba(59,130,246,0.4)" : undefined,
                    }}
                    onClick={() => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        standalone.forEach((i) => (allSel ? next.delete(i.id) : next.add(i.id)));
                        return next;
                      });
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 4,
                          border: `2px solid ${allSel ? "var(--accent)" : "var(--text-tertiary)"}`,
                          background: allSel ? "var(--accent)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {allSel && (
                          <span style={{ color: "white" }}>
                            <CheckIcon />
                          </span>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>Standalone items</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{standalone.length} items available</div>
                      </div>
                    </div>
                  </div>
                  {someSel && (
                    <div style={{ paddingLeft: 14 }}>
                      {standalone.map((item: Item) => (
                        <div
                          key={item.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "5px 0",
                            cursor: "pointer",
                            fontSize: 12.5,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleItem(item.id);
                          }}
                        >
                          <div
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 3,
                              border: `1.5px solid ${selected.has(item.id) ? "var(--accent)" : "var(--text-tertiary)"}`,
                              background: selected.has(item.id) ? "var(--accent)" : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {selected.has(item.id) && (
                              <span style={{ color: "white" }}>
                                <CheckIcon />
                              </span>
                            )}
                          </div>
                          <span style={{ color: selected.has(item.id) ? "var(--text-primary)" : "var(--text-secondary)" }}>
                            {item.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="list-card" style={{ maxHeight: 350, overflowY: "auto" }}>
            {allItems.map((item: Item) => (
              <div key={item.id} className="list-row" onClick={() => toggleItem(item.id)}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    border: `2px solid ${selected.has(item.id) ? "var(--accent)" : "var(--text-tertiary)"}`,
                    background: selected.has(item.id) ? "var(--accent)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {selected.has(item.id) && (
                    <span style={{ color: "white" }}>
                      <CheckIcon />
                    </span>
                  )}
                </div>
                <div style={{ width: 32, height: 32, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {getCategoryEmoji(item.category)}
                </div>
                <div className="list-row-content" style={{ flex: 1 }}>
                  <div className="list-row-title" style={{ fontSize: 13 }}>
                    {item.name}
                  </div>
                  <div className="list-row-sub">{item.sku}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleAssign}
            disabled={selected.size === 0 || assignItems.isPending}
          >
            {assignItems.isPending ? "Assigning…" : `Assign ${selected.size} items`}
          </button>
        </div>
      </div>
    </div>
  );
}
