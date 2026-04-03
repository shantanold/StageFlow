import { useRef, useState } from "react";
import { useImportItems } from "../../lib/queries";
import { CATEGORIES } from "../../lib/utils";
import { useToast } from "../../contexts/ToastContext";

type Category = typeof CATEGORIES[number];

interface ParsedRow {
  name: string;
  category: Category;
  purchase_cost: number;
  purchase_date: string;
  notes: string;
  _error?: string;
}

const VALID_CATEGORIES = new Set<string>(CATEGORIES);
const EXPECTED_HEADERS = ["name", "category", "purchase_cost", "purchase_date", "notes"];

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));

  return lines.slice(1).map((line) => {
    // Simple CSV parse — handles quoted fields with commas
    const values: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { values.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    values.push(cur.trim());

    const get = (key: string) => values[headers.indexOf(key)]?.trim() ?? "";

    const name = get("name");
    const rawCategory = get("category");
    const category: Category = VALID_CATEGORIES.has(rawCategory) ? (rawCategory as Category) : "Other";
    const purchase_cost = parseFloat(get("purchase_cost")) || 0;
    const purchase_date = get("purchase_date");
    const notes = get("notes");

    const errors: string[] = [];
    if (!name) errors.push("name required");
    if (!VALID_CATEGORIES.has(rawCategory)) errors.push(`unknown category "${rawCategory}"`);
    if (!purchase_date || isNaN(Date.parse(purchase_date))) errors.push("invalid purchase_date");

    return { name, category, purchase_cost, purchase_date, notes, _error: errors.join("; ") || undefined };
  });
}

interface Props {
  onClose: () => void;
}

export function ImportCSVModal({ onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const importItems = useImportItems();
  const { showToast } = useToast();

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");

  const validRows = rows.filter((r) => !r._error);
  const invalidRows = rows.filter((r) => r._error);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRows(parseCSV(text));
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (validRows.length === 0) return;
    try {
      const result = await importItems.mutateAsync(
        validRows.map(({ name, category, purchase_cost, purchase_date, notes }) => ({
          name, category, purchase_cost, purchase_date, notes: notes || undefined,
        }))
      );
      const msg =
        result.errors.length > 0
          ? `Imported ${result.created} items (${result.errors.length} failed)`
          : `Imported ${result.created} items`;
      showToast(msg, result.errors.length > 0 ? "error" : "success");
      onClose();
    } catch {
      showToast("Import failed", "error");
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-card)", borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
          width: "100%", maxWidth: 480, maxHeight: "85vh",
          display: "flex", flexDirection: "column",
          padding: "20px 18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Import from CSV</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-tertiary)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Template hint */}
        <div
          style={{
            padding: "10px 12px", borderRadius: "var(--radius-md)",
            background: "var(--bg-surface)", marginBottom: 14,
            fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)",
          }}
        >
          {EXPECTED_HEADERS.join(",")}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 14 }}>
          purchase_date format: YYYY-MM-DD · Categories: {CATEGORIES.join(", ")}
        </p>

        {/* File picker */}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={handleFile}
        />
        <button
          className="btn btn-outline btn-full"
          style={{ marginBottom: 14 }}
          onClick={() => fileRef.current?.click()}
        >
          {fileName ? fileName : "Choose CSV file"}
        </button>

        {/* Preview */}
        {rows.length > 0 && (
          <div style={{ flex: 1, overflowY: "auto", marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
              {validRows.length} valid · {invalidRows.length} with errors
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rows.map((row, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 10px", borderRadius: "var(--radius-md)",
                    background: row._error ? "rgba(239,68,68,0.08)" : "var(--bg-surface)",
                    border: `1px solid ${row._error ? "rgba(239,68,68,0.3)" : "var(--border)"}`,
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row.name || "(no name)"}
                    <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}> · {row.category} · ${row.purchase_cost.toFixed(2)}</span>
                  </div>
                  {row._error && (
                    <div style={{ color: "var(--red-text)", marginTop: 2 }}>{row._error}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          className="btn btn-primary btn-full"
          disabled={validRows.length === 0 || importItems.isPending}
          onClick={handleImport}
        >
          {importItems.isPending ? "Importing…" : `Import ${validRows.length} item${validRows.length !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}
