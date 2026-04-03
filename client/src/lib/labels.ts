import { useState, useEffect } from "react";

const TOKEN_KEY = "sf_token";
const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

// ─── Download PDF ─────────────────────────────────────────────────────────────

export async function downloadLabels(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) throw new Error("No items selected");

  const token = localStorage.getItem(TOKEN_KEY);
  const params = new URLSearchParams({ itemIds: itemIds.join(",") });

  const res = await fetch(`${BASE}/labels/generate?${params}`, {
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? "Failed to generate labels");
  }

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `stageflow-labels-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── QR code image hook ───────────────────────────────────────────────────────

export function useQRCodeUrl(itemId: string): { src: string | null; loading: boolean } {
  const [src, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!itemId) return;

    const token   = localStorage.getItem(TOKEN_KEY);
    let mounted   = true;
    let objectUrl = "";

    fetch(`${BASE}/items/${itemId}/qr`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("qr fetch failed"))))
      .then((blob) => {
        if (!mounted) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [itemId]);

  return { src, loading };
}
