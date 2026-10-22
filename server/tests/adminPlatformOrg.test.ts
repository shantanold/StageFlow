import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { ensurePlatformOrg, moveUserToPlatformOrg, PLATFORM_ORG_SLUG } from "../src/lib/platformAdmin";
import { cleanDb, createOrg, registerUser, authHeader, uniqueEmail } from "./helpers";

// Separate from admin.test.ts so each file stays under the auth rate limit.
describe("platform admin — platform org and cross-org furniture", () => {
  const originalAdmins = process.env.PLATFORM_ADMIN_EMAILS;
  let adminEmail: string;

  beforeEach(async () => {
    await cleanDb();
    adminEmail = uniqueEmail("admin");
    process.env.PLATFORM_ADMIN_EMAILS = adminEmail;
  });
  afterEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = originalAdmins;
  });
  afterAll(async () => {
    await cleanDb();
    await rawPrisma.$disconnect();
  });

  async function addItem(token: string, name: string) {
    const res = await request(app)
      .post("/api/v1/items")
      .set(authHeader(token))
      .send({ name, category: "decor", purchase_cost: 50, purchase_date: "2025-01-01" });
    return res.body as { id: string; sku: string };
  }

  async function login(email: string) {
    const res = await request(app).post("/api/v1/auth/login").send({ email, password: "password123" });
    return res.body.token as string;
  }

  it("dry run reports the move without creating the org or moving the user", async () => {
    const admin = await registerUser(app, { email: adminEmail });
    const r = await moveUserToPlatformOrg(adminEmail, { apply: false });
    expect(r.alreadyThere).toBe(false);
    expect(await rawPrisma.organization.findUnique({ where: { slug: PLATFORM_ORG_SLUG } })).toBeNull();
    const user = await rawPrisma.user.findUnique({ where: { id: admin.userId } });
    expect(user!.org_id).toBe(r.fromOrg.id);
  });

  it("moving an admin to the platform org empties their own screens but keeps cross-org access", async () => {
    const admin = await registerUser(app, { email: adminEmail });
    await addItem(admin.token, "Admin's Old Org Lamp");

    const r = await moveUserToPlatformOrg(adminEmail, { apply: true });
    expect(r.toOrg.name).toBe("StageFlow Platform");
    expect((await moveUserToPlatformOrg(adminEmail, { apply: true })).alreadyThere).toBe(true);

    const token = await login(adminEmail);
    const own = await request(app).get("/api/v1/items").set(authHeader(token));
    expect(own.status).toBe(200);
    expect(own.body).toEqual([]);

    const all = await request(app).get("/api/v1/admin/items").set(authHeader(token));
    expect(all.body.items.map((i: any) => i.name)).toContain("Admin's Old Org Lamp");
  });

  it("the platform org is hidden from the org list and can't be joined by invite code", async () => {
    const admin = await registerUser(app, { email: adminEmail });
    const platform = await ensurePlatformOrg();
    expect(platform.is_active).toBe(false);
    expect((await ensurePlatformOrg()).id).toBe(platform.id);

    const list = await request(app).get("/api/v1/admin/organizations").set(authHeader(admin.token));
    expect(list.body.map((o: any) => o.id)).not.toContain(platform.id);

    const join = await request(app).post("/api/v1/auth/register").send({
      name: "Sneaky", email: uniqueEmail("sneaky"), password: "password123", code: platform.invite_code,
    });
    expect(join.status).toBe(403);
  });

  // ─── Cross-org furniture ──────────────────────────────────────────────────

  it("lists furniture across orgs with the owning org, filterable by org, search and status", async () => {
    const admin = await registerUser(app, { email: adminEmail });
    const orgA = await registerUser(app, { role: "manager" });
    const orgB = await createOrg("Org B");
    const orgBManager = await registerUser(app, { role: "manager", code: orgB.invite_code });
    await addItem(orgA.token, "A Velvet Sofa");
    const bLamp = await addItem(orgBManager.token, "B Brass Lamp");
    await addItem(orgBManager.token, "B Oak Table");

    const all = await request(app).get("/api/v1/admin/items").set(authHeader(admin.token));
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3);
    const lamp = all.body.items.find((i: any) => i.id === bLamp.id);
    expect(lamp.org).toEqual({ id: orgB.id, name: "Org B" });

    const onlyB = await request(app).get(`/api/v1/admin/items?org_id=${orgB.id}`).set(authHeader(admin.token));
    expect(onlyB.body.items.map((i: any) => i.name).sort()).toEqual(["B Brass Lamp", "B Oak Table"]);

    const search = await request(app).get("/api/v1/admin/items?search=%20brass%20").set(authHeader(admin.token));
    expect(search.body.items.map((i: any) => i.id)).toEqual([bLamp.id]);

    // SKUs are numbered per org, so the same SKU can match in several orgs.
    const bySku = await request(app).get(`/api/v1/admin/items?search=${bLamp.sku.toLowerCase()}`).set(authHeader(admin.token));
    expect(bySku.body.items.map((i: any) => i.id)).toContain(bLamp.id);
    expect(bySku.body.items.every((i: any) => i.sku === bLamp.sku)).toBe(true);

    const staged = await request(app).get("/api/v1/admin/items?status=staged").set(authHeader(admin.token));
    expect(staged.body).toEqual({ items: [], total: 0 });
  });

  it("caps the furniture list at the limit but reports the full total", async () => {
    const admin = await registerUser(app, { email: adminEmail });
    for (const name of ["One", "Two", "Three"]) await addItem(admin.token, name);

    const res = await request(app).get("/api/v1/admin/items?limit=2").set(authHeader(admin.token));
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(3);
  });

  it("rejects non-admins from the furniture list", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const res = await request(app).get("/api/v1/admin/items").set(authHeader(manager.token));
    expect(res.status).toBe(403);
  });
});
