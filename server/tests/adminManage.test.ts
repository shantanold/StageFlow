import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { ensurePlatformOrg, slugify, newInviteCode } from "../src/lib/platformAdmin";
import { cleanDb, createOrg, registerUser, authHeader, uniqueEmail } from "./helpers";

describe("platform admin — managing orgs, users and the cross-org job list", () => {
  const originalAdmins = process.env.PLATFORM_ADMIN_EMAILS;
  let adminEmail: string;
  let admin: { token: string; userId: string };

  beforeEach(async () => {
    await cleanDb();
    adminEmail = uniqueEmail("admin");
    process.env.PLATFORM_ADMIN_EMAILS = adminEmail;
    admin = await registerUser(app, { email: adminEmail });
  });
  afterEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = originalAdmins;
  });
  afterAll(async () => {
    await cleanDb();
    await rawPrisma.$disconnect();
  });

  const as = () => authHeader(admin.token);

  /** A user row without going through /auth/register (keeps us under the auth rate limit). */
  async function makeUser(orgId: string, role: "staff" | "manager" = "staff") {
    return rawPrisma.user.create({
      data: { org_id: orgId, name: "Row User", email: uniqueEmail("row"), password_hash: "x", role },
    });
  }

  it("slugify and invite codes are tidy", () => {
    expect(slugify("  Bluebird Staging, LLC ")).toBe("bluebird-staging-llc");
    expect(slugify("!!!")).toBe("org");
    expect(newInviteCode("Bluebird Staging")).toMatch(/^BLUEBIRD-[A-Z2-9]{6}$/);
  });

  // ─── Orgs ─────────────────────────────────────────────────────────────────

  it("creates orgs with a unique slug and a working invite code", async () => {
    const a = await request(app).post("/api/v1/admin/organizations").set(as()).send({ name: "  Harbor Homes " });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ name: "Harbor Homes", slug: "harbor-homes", is_active: true });

    const b = await request(app).post("/api/v1/admin/organizations").set(as()).send({ name: "Harbor Homes" });
    expect(b.body.slug).toBe("harbor-homes-2");

    const joined = await registerUser(app, { role: "manager", code: a.body.invite_code });
    const user = await rawPrisma.user.findUnique({ where: { id: joined.userId } });
    expect(user!.org_id).toBe(a.body.id);

    const bad = await request(app).post("/api/v1/admin/organizations").set(as()).send({ name: " x " });
    expect(bad.status).toBe(400);
  });

  it("renames and deactivates orgs; a deactivated org's code stops working", async () => {
    const org = await createOrg("Old Name");
    const renamed = await request(app).patch(`/api/v1/admin/organizations/${org.id}`).set(as()).send({ name: "New Name" });
    expect(renamed.body.name).toBe("New Name");

    const off = await request(app).patch(`/api/v1/admin/organizations/${org.id}`).set(as()).send({ is_active: false });
    expect(off.body.is_active).toBe(false);
    const join = await request(app).post("/api/v1/auth/register").send({
      name: "Late", email: uniqueEmail("late"), password: "password123", code: org.invite_code,
    });
    expect(join.status).toBe(403);

    const invalid = await request(app).patch(`/api/v1/admin/organizations/${org.id}`).set(as()).send({ is_active: "no" });
    expect(invalid.status).toBe(400);
  });

  it("regenerating an invite code retires the old one", async () => {
    const org = await createOrg("Rotating");
    const res = await request(app).post(`/api/v1/admin/organizations/${org.id}/invite-code`).set(as());
    expect(res.status).toBe(200);
    expect(res.body.invite_code).not.toBe(org.invite_code);

    const old = await request(app).post("/api/v1/auth/register").send({
      name: "Old", email: uniqueEmail("old"), password: "password123", code: org.invite_code,
    });
    expect(old.status).toBe(403);
  });

  it("refuses to change the platform org or unknown orgs", async () => {
    const platform = await ensurePlatformOrg();
    for (const path of [`/organizations/${platform.id}/invite-code`, `/organizations/${platform.id}/act`]) {
      expect((await request(app).post(`/api/v1/admin${path}`).set(as())).status).toBe(400);
    }
    const patch = await request(app).patch(`/api/v1/admin/organizations/${platform.id}`).set(as()).send({ is_active: true });
    expect(patch.status).toBe(400);
    const missing = await request(app)
      .patch("/api/v1/admin/organizations/00000000-0000-0000-0000-00000000ffff").set(as()).send({ name: "Nope" });
    expect(missing.status).toBe(404);
  });

  // ─── Users ────────────────────────────────────────────────────────────────

  it("changes any org's user role, access, and org", async () => {
    const orgB = await createOrg("Org B");
    const orgC = await createOrg("Org C");
    const user = await makeUser(orgB.id);

    const res = await request(app).patch(`/api/v1/admin/users/${user.id}`).set(as())
      .send({ role: "manager", is_active: false, org_id: orgC.id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: "manager", is_active: false, org: { id: orgC.id, name: "Org C" } });
    expect(res.body).not.toHaveProperty("password_hash");
  });

  it("guards user changes: self, platform admins, the platform org, bad input", async () => {
    const platform = await ensurePlatformOrg();
    const orgB = await createOrg("Org B");
    const user = await makeUser(orgB.id);
    const otherAdmin = await makeUser(platform.id);

    const cases: [string, object, number][] = [
      [admin.userId, { role: "staff" }, 400],
      [otherAdmin.id, { is_active: false }, 400],
      [user.id, { org_id: platform.id }, 400],
      [user.id, { role: "owner" }, 400],
      [user.id, { org_id: "00000000-0000-0000-0000-00000000ffff" }, 404],
      ["00000000-0000-0000-0000-00000000ffff", { role: "staff" }, 404],
    ];
    for (const [id, body, status] of cases) {
      const res = await request(app).patch(`/api/v1/admin/users/${id}`).set(as()).send(body);
      expect(res.status, JSON.stringify(body)).toBe(status);
    }
  });

  it("is admin-only", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const res = await request(app).post("/api/v1/admin/organizations").set(authHeader(manager.token)).send({ name: "Mine" });
    expect(res.status).toBe(403);
  });

  // ─── Jobs ─────────────────────────────────────────────────────────────────

  it("lists jobs across orgs with their org, filterable by org, status and search", async () => {
    const orgB = await createOrg("Org B");
    const bManager = await registerUser(app, { role: "manager", code: orgB.invite_code });
    const job = (token: string, address: string, client_name: string) =>
      request(app).post("/api/v1/jobs").set(authHeader(token)).send({
        address, city: "Austin", client_name, start_date: "2026-01-01", expected_end_date: "2026-03-01",
      });
    await job(admin.token, "1 Admin Org St", "Ann Realty");
    await job(bManager.token, "2 Bluebonnet Ln", "Bo Realty");

    const all = await request(app).get("/api/v1/admin/jobs").set(as());
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);
    const b = all.body.jobs.find((j: any) => j.address === "2 Bluebonnet Ln");
    expect(b).toMatchObject({ org: { id: orgB.id, name: "Org B" }, status: "planning", item_count: 0 });

    const onlyB = await request(app).get(`/api/v1/admin/jobs?org_id=${orgB.id}`).set(as());
    expect(onlyB.body.jobs.map((j: any) => j.address)).toEqual(["2 Bluebonnet Ln"]);
    const byClient = await request(app).get("/api/v1/admin/jobs?search=%20ann%20").set(as());
    expect(byClient.body.jobs.map((j: any) => j.client_name)).toEqual(["Ann Realty"]);
    const active = await request(app).get("/api/v1/admin/jobs?status=active").set(as());
    expect(active.body).toEqual({ jobs: [], total: 0 });
  });
});
