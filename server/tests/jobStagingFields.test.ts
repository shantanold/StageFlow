import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDb, registerUser, authHeader } from "./helpers";

describe("job staging project fields", () => {
  beforeEach(cleanDb);
  afterAll(async () => {
    await cleanDb();
    await prisma.$disconnect();
  });

  it("creates and updates amount, market value, duration, extensions, and destaged_at", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const createRes = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(manager.token))
      .send({
        address: "714 Coggins Point Way",
        city: "Sugar Land",
        state: "TX",
        zip: "77479",
        client_name: "Seth Real Estate Group",
        client_contact: "555-0100",
        start_date: "2026-01-02",
        expected_end_date: "2026-04-02",
        amount: 2900,
        monthly_rate: 966.66,
        duration: "3 Months",
        market_value: 739900,
        extension_amount: 0,
        total_paid: 2900,
        notes: "gate code: #2282",
      });

    expect(createRes.status).toBe(201);
    expect(Number(createRes.body.amount)).toBe(2900);
    expect(Number(createRes.body.monthly_rate)).toBeCloseTo(966.66, 2);
    expect(createRes.body.duration).toBe("3 Months");
    expect(Number(createRes.body.market_value)).toBe(739900);
    expect(Number(createRes.body.extension_amount)).toBe(0);
    expect(Number(createRes.body.total_paid)).toBe(2900);
    expect(createRes.body.destaged_at).toBeNull();

    const jobId = createRes.body.id as string;

    const updateRes = await request(app)
      .put(`/api/v1/jobs/${jobId}`)
      .set(authHeader(manager.token))
      .send({
        extension_amount: 900,
        total_paid: 3800,
        destaged_at: "2026-04-10",
        status: "completed",
      });

    expect(updateRes.status).toBe(200);
    expect(Number(updateRes.body.extension_amount)).toBe(900);
    expect(Number(updateRes.body.total_paid)).toBe(3800);
    expect(updateRes.body.status).toBe("completed");
    expect(String(updateRes.body.destaged_at).slice(0, 10)).toBe("2026-04-10");

    const getRes = await request(app)
      .get(`/api/v1/jobs/${jobId}`)
      .set(authHeader(manager.token));
    expect(getRes.status).toBe(200);
    expect(Number(getRes.body.market_value)).toBe(739900);
    expect(String(getRes.body.destaged_at).slice(0, 10)).toBe("2026-04-10");
  });

  it("rejects negative money fields", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const res = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(manager.token))
      .send({
        address: "123 Main St",
        city: "Pearland",
        state: "TX",
        zip: "77584",
        client_name: "Test Client",
        client_contact: "555-0000",
        start_date: "2026-01-01",
        expected_end_date: "2026-04-01",
        amount: -100,
      });

    expect(res.status).toBe(400);
  });

  it("sets destaged_at when a job auto-completes on return", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const itemRes = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({
        name: "Grey Sofa",
        category: "sofa",
        purchase_cost: 500,
        purchase_date: "2025-01-01",
      });
    expect(itemRes.status).toBe(201);

    const jobRes = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(manager.token))
      .send({
        address: "123 Main St",
        city: "Pearland",
        state: "TX",
        zip: "77584",
        client_name: "Jane Realtor",
        client_contact: "555-1234",
        start_date: "2025-02-01",
        expected_end_date: "2025-05-01",
        amount: 2500,
        market_value: 450000,
      });
    expect(jobRes.status).toBe(201);
    const jobId = jobRes.body.id as string;

    await request(app)
      .post(`/api/v1/jobs/${jobId}/assign`)
      .set(authHeader(manager.token))
      .send({ itemIds: [itemRes.body.id] });

    const returnRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/scan-return`)
      .set(authHeader(manager.token))
      .send({ itemId: itemRes.body.id, condition: "good" });
    expect(returnRes.status).toBe(200);
    expect(returnRes.body.job_completed).toBe(true);

    const getRes = await request(app)
      .get(`/api/v1/jobs/${jobId}`)
      .set(authHeader(manager.token));
    expect(getRes.body.status).toBe("completed");
    expect(getRes.body.destaged_at).toBeTruthy();
    expect(getRes.body.actual_end_date).toBeTruthy();
  });
});
