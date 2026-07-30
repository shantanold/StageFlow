import { PrismaClient } from "@prisma/client";
import { getCurrentOrgId } from "./tenantContext";

const globalForPrisma = globalThis as unknown as { rawPrisma: PrismaClient; prisma: PrismaClient };

const base =
  globalForPrisma.rawPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.rawPrisma = base;

/**
 * Unscoped client — bypasses tenant isolation entirely. Use ONLY for the
 * handful of legitimate cross-tenant lookups: login/register (user found by
 * email before we know their org) and the public QR route (no auth at all).
 * Every other query in the app should go through `prisma` below.
 */
export const rawPrisma = base;

const TENANT_MODELS = new Set(["User", "Item", "Set", "Job", "JobItem", "Movement"]);

/**
 * Tenant-scoped client. Every query against a tenant table is automatically
 * filtered/stamped with the current request's org_id (read from AsyncLocalStorage,
 * set by the `authenticate` middleware). Throws if used outside a request that
 * established tenant context — that's a bug, not something to silently ignore.
 */
const scoped = base.$extends({
  name: "tenant-scoping",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) return query(args);

        const orgId = getCurrentOrgId();
        if (!orgId) {
          throw new Error(
            `Tenant context missing for ${model}.${operation}. ` +
            `Use rawPrisma for pre-auth/system queries, or fix missing runWithOrg() wiring.`
          );
        }

        // Cross-model generic logic — Prisma's per-operation arg types don't
        // narrow usefully here, hence the `any`.
        const a = args as any;

        if (operation === "create") {
          a.data = { ...a.data, org_id: a.data?.org_id ?? orgId };
        } else if (operation === "createMany") {
          a.data = Array.isArray(a.data) ? a.data.map((d: any) => ({ ...d, org_id: d.org_id ?? orgId })) : a.data;
        } else if (operation === "upsert") {
          a.where = { ...a.where, org_id: orgId };
          a.create = { ...a.create, org_id: a.create?.org_id ?? orgId };
        } else {
          // findUnique, findUniqueOrThrow, findFirst, findFirstOrThrow, findMany,
          // update, updateMany, delete, deleteMany, count, aggregate, groupBy —
          // all accept org_id as a plain filter field merged into `where`.
          a.where = { ...a.where, org_id: orgId };
        }

        return query(a);
      },
    },
  },
});

export const prisma = (globalForPrisma.prisma ?? scoped) as PrismaClient;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
