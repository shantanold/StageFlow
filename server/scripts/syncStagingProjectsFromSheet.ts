/**
 * Sync job pricing / destage fields from a Staging Projects spreadsheet
 * onto existing jobs (matched by street address).
 *
 * Usage (from server/):
 *   STAGING_PROJECTS_XLSX=/path/to/Staging_Projects.xlsx \
 *   npx ts-node --transpile-only scripts/syncStagingProjectsFromSheet.ts
 *
 * Against production:
 *   railway run env STAGING_PROJECTS_XLSX=... npx ts-node --transpile-only scripts/syncStagingProjectsFromSheet.ts
 *
 * Dry run (default): prints planned updates. Pass --apply to write.
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

// Minimal XLSX shared-string parser would be heavy; prefer pre-parsed JSON
// produced by the agent, or re-run with openpyxl offline.
type SheetRow = {
  sheet: string;
  client: string;
  address: string;
  staged_on: string | null;
  expiry: string | null;
  amount: number | null;
  monthly: number | null;
  duration: string | null;
  notes: string | null;
  destaged: boolean;
  market_value: number | null;
  extension_amount: number | null;
  total_paid: number | null;
};

function normAddr(a: string): string {
  return a
    .toLowerCase()
    .replace(/\n/g, " ")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\blane\b/g, "ln")
    .replace(/\bcourt\b/g, "ct")
    .replace(/\bcircle\b/g, "cir")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\broad\b/g, "rd")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function streetKey(a: string): string {
  let s = normAddr(a);
  for (const tok of [
    "tx", "texas", "houston", "sugar land", "sugarland", "katy", "richmond",
    "missouri city", "missoure city", "pearland", "cypress", "conroe",
    "league city", "united states",
  ]) {
    s = s.replace(new RegExp(`\\b${tok}\\b`, "g"), " ");
  }
  s = s.replace(/\b\d{5}(?:\d{4})?\b/g, " ").replace(/\s+/g, " ").trim();
  return s.split(" ").slice(0, 4).join(" ");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const jsonPath =
    process.env.STAGING_PROJECTS_JSON ??
    path.resolve(__dirname, "data/staging_projects_parsed.json");

  if (!fs.existsSync(jsonPath)) {
    console.error(
      `Parsed sheet JSON not found at ${jsonPath}. Set STAGING_PROJECTS_JSON.`,
    );
    process.exit(1);
  }

  const sheet = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as SheetRow[];
  const byStreet = new Map<string, SheetRow[]>();
  for (const row of sheet) {
    const k = streetKey(row.address);
    const list = byStreet.get(k) ?? [];
    list.push(row);
    byStreet.set(k, list);
  }

  const prisma = new PrismaClient();
  const jobs = await prisma.job.findMany({
    where: { status: { not: "cancelled" } },
  });

  let matched = 0;
  let updated = 0;

  for (const job of jobs) {
    const k = streetKey(job.address);
    const cands = byStreet.get(k) ?? [];
    if (cands.length === 0) {
      console.log(`no match: ${job.address}`);
      continue;
    }
    matched += 1;
    const best = cands.sort(
      (a, b) =>
        Number(b.amount != null) + Number(b.market_value != null) -
        (Number(a.amount != null) + Number(a.market_value != null)),
    )[0];

    const totalPaid =
      best.total_paid ??
      (best.amount != null ? best.amount + (best.extension_amount ?? 0) : null);

    let destagedAt: Date | null = null;
    if (best.destaged || job.status === "completed") {
      const raw =
        (job.actual_end_date && job.actual_end_date.toISOString().slice(0, 10)) ||
        best.expiry ||
        (job.expected_end_date && job.expected_end_date.toISOString().slice(0, 10));
      destagedAt = raw ? new Date(raw) : null;
    }

    const data = {
      amount: best.amount,
      monthly_rate: best.monthly,
      duration: best.duration,
      market_value: best.market_value,
      extension_amount: best.extension_amount,
      total_paid: totalPaid,
      destaged_at: destagedAt,
    };

    console.log(
      `${apply ? "UPDATE" : "dry-run"} ${job.address} ← amt=${data.amount} mv=${data.market_value} destaged_at=${data.destaged_at?.toISOString().slice(0, 10) ?? null}`,
    );

    if (apply) {
      await prisma.job.update({ where: { id: job.id }, data });
      updated += 1;
    }
  }

  console.log(`Matched ${matched}/${jobs.length}; updated ${updated}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
