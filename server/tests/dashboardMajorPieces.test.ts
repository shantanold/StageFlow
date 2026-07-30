import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { cleanDb, registerUser, authHeader } from "./helpers";

describe("dashboard major pieces + active jobs", () => {
  beforeEach(cleanDb);
  afterAll(async () => {
    await cleanDb();
    await rawPrisma.$disconnect();
  });

  it("returns major_pieces counts matched by category or name, and active_jobs_count", async () => {
    const manager = await registerUser(app, { role: "manager" });

    // Sofas via category
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/v1/items")
        .set(authHeader(manager.token))
        .send({ name: `Sofa ${i}`, category: "Sofa", purchase_cost: 100 });
    }

    // Coffee / dining / breakfast tables via name under generic "Table" category
    await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Glass Coffee Table", category: "Table", purchase_cost: 200 });
    await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Oak Dining Table", category: "Table", purchase_cost: 400 });
    await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Small Breakfast Table", category: "Table", purchase_cost: 150 });

    // Non-major piece should not inflate major counts
    await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Floor Lamp", category: "Lamp", purchase_cost: 50 });

    // Create a planning job so active_jobs_count includes it
    await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(manager.token))
      .send({
        address: "1 Test St",
        city: "Houston",
        state: "TX",
        zip: "77001",
        client_name: "Client",
        client_contact: "555",
        start_date: "2025-01-01",
        expected_end_date: "2025-06-01",
      });

    const res = await request(app)
      .get("/api/v1/stats/dashboard")
      .set(authHeader(manager.token));

    expect(res.status).toBe(200);
    expect(res.body.active_jobs_count).toBe(1);
    expect(res.body.major_pieces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "sofa", label: "Sofas", available: 3, staged: 0 }),
        expect.objectContaining({ key: "coffee_table", label: "Coffee Tables", available: 1, staged: 0 }),
        expect.objectContaining({ key: "dining_table", label: "Dining Tables", available: 1, staged: 0 }),
        expect.objectContaining({ key: "breakfast_table", label: "Breakfast Tables", available: 1, staged: 0 }),
      ])
    );
  });

  it("counts staged major pieces separately from available", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const sofaRes = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Staging Sofa", category: "Sofa", purchase_cost: 100 });
    expect(sofaRes.status).toBe(201);

    const jobRes = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(manager.token))
      .send({
        address: "2 Stage Ave",
        city: "Houston",
        state: "TX",
        zip: "77002",
        client_name: "Client",
        client_contact: "555",
        start_date: "2025-01-01",
        expected_end_date: "2025-06-01",
      });
    const jobId = jobRes.body.id as string;

    await request(app)
      .post(`/api/v1/jobs/${jobId}/assign`)
      .set(authHeader(manager.token))
      .send({ itemIds: [sofaRes.body.id] });

    await request(app)
      .post(`/api/v1/jobs/${jobId}/scan-out`)
      .set(authHeader(manager.token))
      .send({ itemId: sofaRes.body.id });

    const res = await request(app)
      .get("/api/v1/stats/dashboard")
      .set(authHeader(manager.token));

    expect(res.status).toBe(200);
    const sofa = res.body.major_pieces.find((p: { key: string }) => p.key === "sofa");
    expect(sofa).toMatchObject({ available: 0, staged: 1 });
  });
});
