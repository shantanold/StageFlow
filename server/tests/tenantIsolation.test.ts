import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { cleanDb, createOrg, registerUser, authHeader } from "./helpers";

describe("tenant isolation — org A cannot touch org B's data", () => {
  beforeEach(cleanDb);
  afterAll(async () => {
    await cleanDb();
    await rawPrisma.$disconnect();
  });

  async function setupTwoOrgsWithData() {
    const orgA = await registerUser(app, { role: "manager" }); // default org (from .env.test SIGNUP_CODE)

    const orgB = await createOrg("Org B");
    const orgBManager = await registerUser(app, { role: "manager", code: orgB.invite_code! });

    // Org A creates an item and a job
    const itemRes = await request(app)
      .post("/api/v1/items")
      .set(authHeader(orgA.token))
      .send({ name: "Org A Sofa", category: "sofa", purchase_cost: 500, purchase_date: "2025-01-01" });
    const orgAItemId = itemRes.body.id as string;

    const jobRes = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(orgA.token))
      .send({
        address: "1 Org A St", client_name: "Org A Client",
        start_date: "2025-02-01", expected_end_date: "2025-05-01",
      });
    const orgAJobId = jobRes.body.id as string;

    return { orgA, orgBManager, orgAItemId, orgAJobId };
  }

  it("org B cannot read org A's item", async () => {
    const { orgBManager, orgAItemId } = await setupTwoOrgsWithData();
    const res = await request(app).get(`/api/v1/items/${orgAItemId}`).set(authHeader(orgBManager.token));
    expect(res.status).toBe(404);
  });

  it("org B cannot update org A's item", async () => {
    const { orgBManager, orgAItemId } = await setupTwoOrgsWithData();
    const res = await request(app)
      .put(`/api/v1/items/${orgAItemId}`)
      .set(authHeader(orgBManager.token))
      .send({ name: "Hijacked" });
    expect(res.status).toBe(404);

    // confirm it genuinely wasn't touched
    const stillOrgAsItem = await rawPrisma.item.findUnique({ where: { id: orgAItemId } });
    expect(stillOrgAsItem?.name).toBe("Org A Sofa");
  });

  it("org B cannot read org A's job", async () => {
    const { orgBManager, orgAJobId } = await setupTwoOrgsWithData();
    const res = await request(app).get(`/api/v1/jobs/${orgAJobId}`).set(authHeader(orgBManager.token));
    expect(res.status).toBe(404);
  });

  it("org B cannot assign its own items to org A's job", async () => {
    const { orgBManager, orgAJobId } = await setupTwoOrgsWithData();

    const orgBItemRes = await request(app)
      .post("/api/v1/items")
      .set(authHeader(orgBManager.token))
      .send({ name: "Org B Chair", category: "chair", purchase_cost: 100, purchase_date: "2025-01-01" });
    const orgBItemId = orgBItemRes.body.id as string;

    const assignRes = await request(app)
      .post(`/api/v1/jobs/${orgAJobId}/assign`)
      .set(authHeader(orgBManager.token))
      .send({ itemIds: [orgBItemId] });
    expect(assignRes.status).toBe(404); // org A's job doesn't exist from org B's perspective
  });

  it("org B's item list never includes org A's items", async () => {
    const { orgBManager } = await setupTwoOrgsWithData();
    const res = await request(app).get("/api/v1/items").set(authHeader(orgBManager.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("org B's dashboard stats don't count org A's inventory", async () => {
    const { orgBManager } = await setupTwoOrgsWithData();
    const res = await request(app).get("/api/v1/stats/dashboard").set(authHeader(orgBManager.token));
    expect(res.status).toBe(200);
    expect(res.body.total_items).toBe(0);
  });

  it("org A can still fully access its own data (isolation isn't over-broad)", async () => {
    const { orgA, orgAItemId, orgAJobId } = await setupTwoOrgsWithData();
    const itemRes = await request(app).get(`/api/v1/items/${orgAItemId}`).set(authHeader(orgA.token));
    expect(itemRes.status).toBe(200);
    const jobRes = await request(app).get(`/api/v1/jobs/${orgAJobId}`).set(authHeader(orgA.token));
    expect(jobRes.status).toBe(200);
  });

  it("the same SKU can exist independently in two different orgs", async () => {
    // Both orgs' SKU sequences start fresh (STG-ITM-0001) since generateSku()
    // is now scoped per-org too — this only works once sku uniqueness is per-org.
    const orgA = await registerUser(app, { role: "manager" });
    const orgB = await createOrg("Org B 2");
    const orgBManager = await registerUser(app, { role: "manager", code: orgB.invite_code! });

    const itemA = await request(app)
      .post("/api/v1/items")
      .set(authHeader(orgA.token))
      .send({ name: "First Item A", category: "sofa", purchase_cost: 1, purchase_date: "2025-01-01" });
    const itemB = await request(app)
      .post("/api/v1/items")
      .set(authHeader(orgBManager.token))
      .send({ name: "First Item B", category: "sofa", purchase_cost: 1, purchase_date: "2025-01-01" });

    expect(itemA.status).toBe(201);
    expect(itemB.status).toBe(201);
    expect(itemA.body.sku).toBe(itemB.body.sku); // same SKU, different orgs — must not collide
  });
});
