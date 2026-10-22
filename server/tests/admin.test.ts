import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { isPlatformAdminEmail } from "../src/lib/platformAdmin";
import { cleanDb, createOrg, registerUser, authHeader, uniqueEmail } from "./helpers";

describe("platform admin — cross-org organization views", () => {
  const originalAdmins = process.env.PLATFORM_ADMIN_EMAILS;
  let adminEmail: string;

  beforeEach(async () => {
    await cleanDb();
    adminEmail = uniqueEmail("admin");
    process.env.PLATFORM_ADMIN_EMAILS = ` someone@else.com , ${adminEmail.toUpperCase()} `;
  });
  afterEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = originalAdmins;
  });
  afterAll(async () => {
    await cleanDb();
    await rawPrisma.$disconnect();
  });

  it("matches allowlisted emails case-insensitively and ignores blanks", () => {
    expect(isPlatformAdminEmail(adminEmail)).toBe(true);
    expect(isPlatformAdminEmail("nobody@example.com")).toBe(false);
    expect(isPlatformAdminEmail("")).toBe(false);
    process.env.PLATFORM_ADMIN_EMAILS = "";
    expect(isPlatformAdminEmail(adminEmail)).toBe(false);
  });

  it("flags platform admins on login and /auth/me", async () => {
    const admin = await registerUser(app, { email: adminEmail, role: "staff" });
    const me = await request(app).get("/api/v1/auth/me").set(authHeader(admin.token));
    expect(me.body.is_platform_admin).toBe(true);

    const login = await request(app).post("/api/v1/auth/login").send({ email: adminEmail, password: "password123" });
    expect(login.body.user.is_platform_admin).toBe(true);

    const manager = await registerUser(app, { role: "manager" });
    const otherMe = await request(app).get("/api/v1/auth/me").set(authHeader(manager.token));
    expect(otherMe.body.is_platform_admin).toBe(false);
  });

  it("rejects managers who aren't platform admins", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const list = await request(app).get("/api/v1/admin/organizations").set(authHeader(manager.token));
    expect(list.status).toBe(403);
  });

  it("rejects requests without a token", async () => {
    const res = await request(app).get("/api/v1/admin/organizations");
    expect(res.status).toBe(401);
  });

  it("rejects a deactivated platform admin even with a valid token", async () => {
    const admin = await registerUser(app, { email: adminEmail });
    await rawPrisma.user.update({ where: { id: admin.userId }, data: { is_active: false } });
    const res = await request(app).get("/api/v1/admin/organizations").set(authHeader(admin.token));
    expect(res.status).toBe(403);
  });

  it("lists every organization with counts, regardless of the admin's own org", async () => {
    const admin = await registerUser(app, { email: adminEmail, role: "staff" });

    const orgB = await createOrg("Org B");
    const orgBManager = await registerUser(app, { role: "manager", code: orgB.invite_code });
    await registerUser(app, { role: "staff", code: orgB.invite_code });
    await request(app)
      .post("/api/v1/items")
      .set(authHeader(orgBManager.token))
      .send({ name: "B Sofa", category: "sofa", purchase_cost: 100, purchase_date: "2025-01-01" });
    await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(orgBManager.token))
      .send({ address: "1 B St", client_name: "B Client", start_date: "2025-02-01", expected_end_date: "2025-05-01" });

    const res = await request(app).get("/api/v1/admin/organizations").set(authHeader(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);

    const b = res.body.find((o: any) => o.id === orgB.id);
    expect(b).toMatchObject({ name: "Org B", is_active: true, user_count: 2, item_count: 1, job_count: 1 });
    expect(b.active_job_count).toBe(0);
    expect(b).not.toHaveProperty("invite_code");
  });

  it("returns one organization's detail with its users and status breakdowns", async () => {
    const admin = await registerUser(app, { email: adminEmail });
    const orgB = await createOrg("Org B");
    const orgBManager = await registerUser(app, { role: "manager", code: orgB.invite_code });
    await request(app)
      .post("/api/v1/items")
      .set(authHeader(orgBManager.token))
      .send({ name: "B Lamp", category: "lamp", purchase_cost: 20, purchase_date: "2025-01-01" });

    const res = await request(app).get(`/api/v1/admin/organizations/${orgB.id}`).set(authHeader(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.invite_code).toBe(orgB.invite_code);
    expect(res.body.items_by_status).toEqual({ available: 1 });
    expect(res.body.jobs_by_status).toEqual({});
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0]).not.toHaveProperty("password_hash");

    const missing = await request(app)
      .get("/api/v1/admin/organizations/00000000-0000-0000-0000-00000000ffff")
      .set(authHeader(admin.token));
    expect(missing.status).toBe(404);
  });
});
