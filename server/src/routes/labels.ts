import { Router } from "express";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// ─── PDF layout constants (US Letter, 3 col × 10 row) ────────────────────────

const PAGE_W  = 612;
const PAGE_H  = 792;
const MARGIN_X = 18;
const MARGIN_Y = 20;
const COLS    = 3;
const ROWS    = 10;
const CELL_W  = (PAGE_W - MARGIN_X * 2) / COLS;   // 192 pt
const CELL_H  = (PAGE_H - MARGIN_Y * 2) / ROWS;   // 75.2 pt
const QR_SIZE = 48;
const QR_TOP  = 5;

function cellOrigin(index: number): { x: number; y: number } {
  const pageIndex = index % (COLS * ROWS);
  const col = pageIndex % COLS;
  const row = Math.floor(pageIndex / COLS);
  return {
    x: MARGIN_X + col * CELL_W,
    y: MARGIN_Y + row * CELL_H,
  };
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ─── GET /labels/generate?itemIds=id1,id2,… ──────────────────────────────────

router.get("/generate", async (req, res) => {
  try {
    const raw = (req.query.itemIds as string) ?? "";
    const ids = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return res.status(400).json({ message: "Provide at least one itemId" });
    }
    if (ids.length > 300) {
      return res.status(400).json({ message: "Maximum 300 items per PDF" });
    }

    const items = await prisma.item.findMany({
      where: { id: { in: ids } },
      select: { id: true, sku: true, name: true },
    });

    // Preserve requested order
    const ordered = ids
      .map((id) => items.find((it) => it.id === id))
      .filter((it): it is NonNullable<typeof it> => it !== undefined);

    if (ordered.length === 0) {
      return res.status(404).json({ message: "No matching items found" });
    }

    // Pre-generate all QR buffers
    const qrBuffers = await Promise.all(
      ordered.map((item) =>
        QRCode.toBuffer(item.sku, { type: "png", width: 200, margin: 1 })
      )
    );

    // Build PDF
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      autoFirstPage: false,
      info: { Title: "StageFlow QR Labels" },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="stageflow-labels-${Date.now()}.pdf"`
    );
    doc.pipe(res);

    const labelsPerPage = COLS * ROWS;

    for (let i = 0; i < ordered.length; i++) {
      // New page every labelsPerPage items
      if (i % labelsPerPage === 0) {
        doc.addPage({ size: "LETTER", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      }

      const item = ordered[i];
      const qrBuf = qrBuffers[i];
      const { x, y } = cellOrigin(i);

      // Very subtle cell border
      doc
        .rect(x + 0.5, y + 0.5, CELL_W - 1, CELL_H - 1)
        .stroke("#e5e7eb");

      // QR code — centered horizontally
      const qrX = x + (CELL_W - QR_SIZE) / 2;
      const qrY = y + QR_TOP;
      doc.image(qrBuf, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });

      // Item name (Helvetica, 7pt, centered)
      const nameY = qrY + QR_SIZE + 4;
      doc
        .fillColor("#111827")
        .font("Helvetica")
        .fontSize(7)
        .text(truncate(item.name, 30), x + 4, nameY, {
          width: CELL_W - 8,
          align: "center",
          lineBreak: false,
        });

      // SKU (Courier, 6.5pt, centered)
      const skuY = nameY + 9;
      doc
        .fillColor("#6b7280")
        .font("Courier")
        .fontSize(6.5)
        .text(item.sku, x + 4, skuY, {
          width: CELL_W - 8,
          align: "center",
          lineBreak: false,
        });
    }

    doc.end();
  } catch (err) {
    console.error(err);
    // Only send error if headers haven't been flushed
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error" });
    }
  }
});

export default router;
