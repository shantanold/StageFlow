import { Router } from "express";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// ─── PDF layout: Avery 5163–style 2" × 4" shipping labels ────────────────────
// Sheet: US Letter 8.5" × 11" · 10 labels/sheet · 2 cols × 5 rows
// Each label: 4" wide × 2" tall

const COLS     = 2;
const ROWS     = 5;
const LABEL_W  = 288;          // 4"
const LABEL_H  = 144;          // 2"
const MARGIN_X = 11.25;        // ~0.156" (Avery side margin)
const MARGIN_Y = 36;           // 0.5" top margin
const COL_GAP  = 13.5;         // ~0.188" gap between columns
const QR_SIZE  = 88;
const LABELS_PER_PAGE = COLS * ROWS;

function cellOrigin(index: number): { x: number; y: number } {
  const pageIndex = index % LABELS_PER_PAGE;
  const col = pageIndex % COLS;
  const row = Math.floor(pageIndex / COLS);
  return {
    x: MARGIN_X + col * (LABEL_W + COL_GAP),
    y: MARGIN_Y + row * LABEL_H,
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
        QRCode.toBuffer(item.sku, { type: "png", width: 280, margin: 1 })
      )
    );

    await prisma.item.updateMany({
      where: { id: { in: ordered.map((it) => it.id) } },
      data: { qr_printed: true },
    });

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

    for (let i = 0; i < ordered.length; i++) {
      if (i % LABELS_PER_PAGE === 0) {
        doc.addPage({ size: "LETTER", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      }

      const item = ordered[i];
      const qrBuf = qrBuffers[i];
      const { x, y } = cellOrigin(i);

      // QR on the left half of the 4" × 2" label
      const qrX = x + 18;
      const qrY = y + (LABEL_H - QR_SIZE) / 2;
      doc.image(qrBuf, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });

      // Name + SKU on the right half
      const textX = qrX + QR_SIZE + 14;
      const textW = LABEL_W - (textX - x) - 14;
      const textY = y + LABEL_H / 2 - 14;

      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(truncate(item.name, 36), textX, textY, {
          width: textW,
          align: "left",
          lineBreak: false,
        });

      doc
        .fillColor("#6b7280")
        .font("Courier")
        .fontSize(9)
        .text(item.sku, textX, textY + 16, {
          width: textW,
          align: "left",
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
