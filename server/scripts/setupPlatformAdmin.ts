/**
 * Moves a platform admin into the furniture-free platform org (creating it if
 * needed), so their normal screens stop showing a customer's inventory.
 *
 *   npm run admin:setup -- you@example.com           # dry run: shows what would change
 *   npm run admin:setup -- you@example.com --apply   # does it
 *
 * Runs against whatever DATABASE_URL is set, e.g. via
 * `railway run -e staging -s StageFlow npm run admin:setup -- ...`.
 * The email should also be in PLATFORM_ADMIN_EMAILS on that environment.
 */
import "dotenv/config";
import { rawPrisma } from "../src/lib/prisma";
import { moveUserToPlatformOrg } from "../src/lib/platformAdmin";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const email = args.find((a) => !a.startsWith("--"));
  if (!email) {
    console.error("Usage: npm run admin:setup -- <email> [--apply]");
    process.exit(1);
  }

  const host = (process.env.DATABASE_URL ?? "").replace(/^[a-z]+:\/\/[^@]*@/, "").replace(/[/?].*$/, "");
  console.log(`Database: ${host || "(DATABASE_URL not set)"}`);

  const r = await moveUserToPlatformOrg(email, { apply });
  if (r.alreadyThere) {
    console.log(`${email} is already in ${r.toOrg.name}. Nothing to do.`);
  } else {
    console.log(`${apply ? "Moved" : "Would move"} ${email}`);
    console.log(`  from: ${r.fromOrg.name} (${r.fromOrg.id})`);
    console.log(`  to:   ${r.toOrg.name} (${r.toOrg.id})`);
    console.log(`  Their ${r.jobsCreated} created job(s) and ${r.movementsPerformed} scan(s) stay in ${r.fromOrg.name}.`);
    if (apply) console.log("  They need to sign out and back in for the move to take effect.");
    else console.log("Dry run only. Re-run with --apply to make the change.");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => rawPrisma.$disconnect());
