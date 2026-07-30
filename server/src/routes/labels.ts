import { Router } from "express";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// ─── PDF layout: 8.5″×11″ 10-up (2×5 of 4″×2″) ────────────────────────────────
// Matched to Avery 5163 / Online Labels OL5125–style sheets and the reference
// template `8.5x11in-10up.pdf` (rounded-corner cut guides, 2 cols × 5 rows).
//
// All units are PDF points (72 pt = 1″).

const COLS     = 2;
const ROWS     = 5;
const LABEL_W  = 288;   // 4.000″
const LABEL_H  = 144;   // 2.000″
const MARGIN_X = 11;    // 0.1528″ side margin (matches reference template)
const MARGIN_Y = 36;    // 0.500″ top/bottom
const COL_GAP  = 13.5;  // 0.1875″ gutter between columns
const ROW_GAP  = 0;     // labels share horizontal edges
const LABELS_PER_PAGE = COLS * ROWS;

// In-label content — keep clear of ~9–10 pt rounded corners
const PAD      = 16;
const QR_SIZE  = 112;   // ~1.56″ — large enough to scan from a phone at arm’s length

function cellOrigin(index: number): { x: number; y: number } {
  const pageIndex = index % LABELS_PER_PAGE;
  const col = pageIndex % COLS;
  const row = Math.floor(pageIndex / COLS);
  return {
    x: MARGIN_X + col * (LABEL_W + COL_GAP),
    y: MARGIN_Y + row * (LABEL_H + ROW_GAP),
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
        QRCode.toBuffer(item.sku, { type: "png", width: 320, margin: 1 })
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

      // QR left, vertically centered within the 2″ label
      const qrX = x + PAD;
      const qrY = y + (LABEL_H - QR_SIZE) / 2;
      doc.image(qrBuf, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });

      // Name + SKU on the right, vertically centered as a two-line block
      const textX = qrX + QR_SIZE + 12;
      const textW = x + LABEL_W - PAD - textX;
      const line1 = 13;
      const line2 = 11;
      const gap = 6;
      const blockH = line1 + gap + line2;
      const textY = y + (LABEL_H - blockH) / 2;

      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(line1)
        .text(truncate(item.name, 28), textX, textY, {
          width: textW,
          align: "left",
          lineBreak: false,
          height: line1 + 2,
        });

      doc
        .fillColor("#4b5563")
        .font("Courier")
        .fontSize(line2)
        .text(item.sku, textX, textY + line1 + gap, {
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
