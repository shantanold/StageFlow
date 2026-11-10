import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDb, registerUser, authHeader } from "./helpers";

describe("business reports (revenue, demand, activity)", () => {
  beforeEach(cleanDb);
  afterAll(async () => {
    await cleanDb();
    await prisma.$disconnect();
  });

  it("returns revenue, demand, and activity payloads including new job fields", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const itemRes = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Sofa", category: "Sofa", purchase_cost: 400, purchase_date: "2025-01-01" });
    expect(itemRes.status).toBe(201);

    const jobRes = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(manager.token))
      .send({
        address: "714 Coggins Point Way",
        city: "Sugar Land",
        state: "TX",
        zip: "77479",
        client_name: "Seth Real Estate",
        client_contact: "555",
        start_date: "2026-01-02",
        expected_end_date: "2026-04-02",
        amount: 2900,
        monthly_rate: 966.66,
        duration: "3 Months",
        market_value: 739900,
        total_paid: 2900,
      });
    expect(jobRes.status).toBe(201);

    await request(app)
      .post(`/api/v1/jobs/${jobRes.body.id}/assign`)
      .set(authHeader(manager.token))
      .send({ itemIds: [itemRes.body.id] });

    const revenue = await request(app)
      .get("/api/v1/stats/reports/revenue")
      .set(authHeader(manager.token));
    expect(revenue.status).toBe(200);
    expect(revenue.body.pipeline_revenue).toBeGreaterThanOrEqual(2900);
    expect(revenue.body.market_value_staged).toBeGreaterThanOrEqual(739900);
    expect(revenue.body.monthly.length).toBe(12);

    const demand = await request(app)
      .get("/api/v1/stats/reports/demand")
      .set(authHeader(manager.token));
    expect(demand.status).toBe(200);
    expect(demand.body.by_category.some((c: { category: string }) => c.category === "Sofa")).toBe(true);
    expect(demand.body.top_items[0].job_count).toBeGreaterThanOrEqual(1);

    const activity = await request(app)
      .get("/api/v1/stats/reports/activity")
      .set(authHeader(manager.token));
    expect(activity.status).toBe(200);
    expect(activity.body.heatmap.length).toBeGreaterThan(300);
    expect(activity.body.currently_staged).toBeGreaterThanOrEqual(1);

    const perf = await request(app)
      .get("/api/v1/stats/reports/job-performance")
      .set(authHeader(manager.token));
    expect(perf.status).toBe(200);
    expect(perf.body).toHaveProperty("total_revenue");
    expect(perf.body).toHaveProperty("avg_amount");
    expect(perf.body).toHaveProperty("total_market_value");
  });
});

describe("activity report piece velocity", () => {
  beforeEach(cleanDb);
  afterAll(async () => {
    await cleanDb();
    await prisma.$disconnect();
  });

  it("counts pieces out/in per day and days on site from movements", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const item = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Chair", category: "Chair", purchase_cost: 100 });
    const job = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(manager.token))
      .send({
        address: "1 Test St", city: "Houston", state: "TX", zip: "77001",
        client_name: "Client", client_contact: "555",
        start_date: "2026-01-01", expected_end_date: "2026-06-01",
      });
    await request(app)
      .post(`/api/v1/jobs/${job.body.id}/assign`)
      .set(authHeader(manager.token))
      .send({ itemIds: [item.body.id] });

    let activity = await request(app).get("/api/v1/stats/reports/activity").set(authHeader(manager.token));
    expect(activity.status).toBe(200);
    const out = activity.body.heatmap.reduce((n: number, d: { pieces_out: number }) => n + d.pieces_out, 0);
    expect(out).toBe(1);
    expect(activity.body.pieces.on_site).toBe(1);
    expect(activity.body.pieces.open_avg_days).not.toBeNull();

    const ret = await request(app)
      .post(`/api/v1/jobs/${job.body.id}/scan-return`)
      .set(authHeader(manager.token))
      .send({ itemId: item.body.id, condition: "good" });
    expect(ret.status).toBeLessThan(300);

    activity = await request(app).get("/api/v1/stats/reports/activity").set(authHeader(manager.token));
    const back = activity.body.heatmap.reduce((n: number, d: { pieces_in: number }) => n + d.pieces_in, 0);
    expect(back).toBe(1);
    expect(activity.body.pieces.on_site).toBe(0);
    expect(activity.body.pieces.days_on_site_recent.count).toBe(1);
    expect(activity.body.pieces.days_on_site_recent.avg_days).toBeGreaterThanOrEqual(0);
  });
});
