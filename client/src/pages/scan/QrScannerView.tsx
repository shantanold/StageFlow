import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

let idCounter = 0;

interface Props {
  onScan: (text: string) => void;
  paused?: boolean;
}

export function QrScannerView({ onScan, paused }: Props) {
  const elementId = useRef(`qr-reader-${++idCounter}`).current;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const pausedRef = useRef(paused);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const scanner = new Html5Qrcode(elementId, { verbose: false });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (text) => {
          if (!pausedRef.current) onScan(text);
        },
        () => {} // suppress per-frame decode errors
      )
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setCameraError(msg.includes("Permission") ? "Camera permission denied." : "Could not start camera.");
      });

    return () => {
      if (scanner.isScanning) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
      } else {
        scanner.clear();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (cameraError) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          borderRadius: 12,
          padding: "32px 16px",
          textAlign: "center",
          color: "var(--red-text)",
          fontSize: 13,
        }}
      >
        {cameraError}
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: 12,
        overflow: "hidden",
        background: "#000",
        position: "relative",
      }}
    >
      <div id={elementId} style={{ width: "100%" }} />
    </div>
  );
}
