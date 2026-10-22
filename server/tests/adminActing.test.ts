import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { moveUserToPlatformOrg } from "../src/lib/platformAdmin";
import { cleanDb, createOrg, registerUser, authHeader, uniqueEmail } from "./helpers";

describe("platform admin — acting inside a customer org", () => {
  const originalAdmins = process.env.PLATFORM_ADMIN_EMAILS;
  let adminEmail: string;
  let adminId: string;
  let adminToken: string;

  beforeEach(async () => {
    await cleanDb();
    adminEmail = uniqueEmail("admin");
    process.env.PLATFORM_ADMIN_EMAILS = adminEmail;
    // A staff-role admin in the furniture-free platform org, like production.
    adminId = (await registerUser(app, { email: adminEmail, role: "staff" })).userId;
    await moveUserToPlatformOrg(adminEmail, { apply: true });
    const login = await request(app).post("/api/v1/auth/login").send({ email: adminEmail, password: "password123" });
    adminToken = login.body.token;
  });
  afterEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = originalAdmins;
  });
  afterAll(async () => {
    await cleanDb();
    await rawPrisma.$disconnect();
  });

  async function setupOrgWithItem() {
    const org = await createOrg("Bluebird");
    const manager = await registerUser(app, { role: "manager", code: org.invite_code });
    const item = await request(app).post("/api/v1/items").set(authHeader(manager.token))
      .send({ name: "Bluebird Sofa", category: "sofa", purchase_cost: 900, purchase_date: "2025-01-01" });
    return { org, manager, itemId: item.body.id as string };
  }

  async function enter(orgId: string) {
    const res = await request(app).post(`/api/v1/admin/organizations/${orgId}/act`).set(authHeader(adminToken));
    expect(res.status).toBe(200);
    return res.body as { token: string; org: { id: string; name: string } };
  }

  it("gives a manager-rights token scoped to that org, with /auth/me saying so", async () => {
    const { org, itemId } = await setupOrgWithItem();
    const acting = await enter(org.id);
    expect(acting.org).toEqual({ id: org.id, name: "Bluebird" });

    const me = await request(app).get("/api/v1/auth/me").set(authHeader(acting.token));
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: adminId, role: "manager", is_platform_admin: true, acting_org: { id: org.id, name: "Bluebird" } });

    const items = await request(app).get("/api/v1/items").set(authHeader(acting.token));
    expect(items.body.map((i: any) => i.id)).toEqual([itemId]);

    const normalMe = await request(app).get("/api/v1/auth/me").set(authHeader(adminToken));
    expect(normalMe.body.acting_org).toBeNull();
  });

  it("can use manager-only routes in the org, and changes are attributed to the admin", async () => {
    const { org, itemId } = await setupOrgWithItem();
    const acting = await enter(org.id);

    const res = await request(app).post(`/api/v1/items/${itemId}/set-status`).set(authHeader(acting.token)).send({ status: "missing" });
    expect(res.status).toBe(200);

    const movement = await rawPrisma.movement.findFirst({ where: { item_id: itemId, to_status: "missing" } });
    expect(movement).toMatchObject({ org_id: org.id, performed_by: adminId });

    const condition = await request(app).put(`/api/v1/items/${itemId}`).set(authHeader(acting.token)).send({ condition: "damaged" });
    expect(condition.body.condition).toBe("damaged");
  });

  it("stays inside the entered org", async () => {
    const { org } = await setupOrgWithItem();
    const other = await createOrg("Other");
    const otherManager = await registerUser(app, { role: "manager", code: other.invite_code });
    const otherItem = await request(app).post("/api/v1/items").set(authHeader(otherManager.token))
      .send({ name: "Other Lamp", category: "lamp", purchase_cost: 10, purchase_date: "2025-01-01" });

    const acting = await enter(org.id);
    const res = await request(app).get(`/api/v1/items/${otherItem.body.id}`).set(authHeader(acting.token));
    expect(res.status).toBe(404);
  });

  it("stops working as soon as the user is no longer a platform admin", async () => {
    const { org } = await setupOrgWithItem();
    const acting = await enter(org.id);

    process.env.PLATFORM_ADMIN_EMAILS = "";
    expect((await request(app).get("/api/v1/items").set(authHeader(acting.token))).status).toBe(401);

    process.env.PLATFORM_ADMIN_EMAILS = adminEmail;
    await rawPrisma.user.update({ where: { id: adminId }, data: { is_active: false } });
    expect((await request(app).get("/api/v1/items").set(authHeader(acting.token))).status).toBe(401);
  });

  it("only platform admins can enter an org", async () => {
    const { org, manager } = await setupOrgWithItem();
    const res = await request(app).post(`/api/v1/admin/organizations/${org.id}/act`).set(authHeader(manager.token));
    expect(res.status).toBe(403);
  });

  it("/auth/me isn't held to the strict login rate limit (it runs on every page load)", async () => {
    for (let i = 0; i < 25; i++) {
      const res = await request(app).get("/api/v1/auth/me").set(authHeader(adminToken));
      expect(res.status).toBe(200);
    }
  });
});
