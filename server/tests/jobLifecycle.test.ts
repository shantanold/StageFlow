import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDb, registerUser, authHeader } from "./helpers";

describe("core job lifecycle", () => {
  beforeEach(cleanDb);
  afterAll(async () => {
    await cleanDb();
    await prisma.$disconnect();
  });

  it("create item, create job, assign, scan out, scan return, dashboard reflects it", async () => {
    const manager = await registerUser(app, { role: "manager" });

    // Create item
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
    const itemId = itemRes.body.id as string;
    expect(itemRes.body.status).toBe("available");

    // Create job
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
      });
    expect(jobRes.status).toBe(201);
    const jobId = jobRes.body.id as string;
    expect(jobRes.body.status).toBe("planning");

    // Assign item to job
    const assignRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/assign`)
      .set(authHeader(manager.token))
      .send({ itemIds: [itemId] });
    expect(assignRes.status).toBe(200);

    // Scan out — stages the item, activates the job
    const scanOutRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/scan-out`)
      .set(authHeader(manager.token))
      .send({ itemId });
    expect(scanOutRes.status).toBe(200);

    const jobAfterScanOut = await request(app)
      .get(`/api/v1/jobs/${jobId}`)
      .set(authHeader(manager.token));
    expect(jobAfterScanOut.body.status).toBe("active");

    const itemAfterScanOut = await request(app)
      .get(`/api/v1/items/${itemId}`)
      .set(authHeader(manager.token));
    expect(itemAfterScanOut.body.status).toBe("staged");
    expect(itemAfterScanOut.body.current_job.id).toBe(jobId);

    // Dashboard reflects the staged item
    const dashboardMidway = await request(app)
      .get("/api/v1/stats/dashboard")
      .set(authHeader(manager.token));
    expect(dashboardMidway.body.staged_count).toBe(1);

    // Scan return — good condition, job auto-completes since it's the only item
    const scanReturnRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/scan-return`)
      .set(authHeader(manager.token))
      .send({ itemId, condition: "good" });
    expect(scanReturnRes.status).toBe(200);
    expect(scanReturnRes.body.job_completed).toBe(true);

    const itemAfterReturn = await request(app)
      .get(`/api/v1/items/${itemId}`)
      .set(authHeader(manager.token));
    expect(itemAfterReturn.body.status).toBe("available");

    const dashboardFinal = await request(app)
      .get("/api/v1/stats/dashboard")
      .set(authHeader(manager.token));
    expect(dashboardFinal.body.available_count).toBe(1);
    expect(dashboardFinal.body.staged_count).toBe(0);
  });

  it("force-completing a job with unreturned items marks them missing, and they can be found", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const itemRes = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Coffee Table", category: "table", purchase_cost: 150, purchase_date: "2025-01-01" });
    const itemId = itemRes.body.id as string;

    const jobRes = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(manager.token))
      .send({
        address: "456 Oak Ave", client_name: "Bob Realtor",
        start_date: "2025-02-01", expected_end_date: "2025-05-01",
      });
    const jobId = jobRes.body.id as string;

    await request(app).post(`/api/v1/jobs/${jobId}/assign`).set(authHeader(manager.token)).send({ itemIds: [itemId] });
    await request(app).post(`/api/v1/jobs/${jobId}/scan-out`).set(authHeader(manager.token)).send({ itemId });

    // Never scanned back — force complete instead
    const forceRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/force-complete`)
      .set(authHeader(manager.token));
    expect(forceRes.status).toBe(200);
    expect(forceRes.body.missing_count).toBe(1);

    const jobAfter = await request(app).get(`/api/v1/jobs/${jobId}`).set(authHeader(manager.token));
    expect(jobAfter.body.status).toBe("completed");

    const itemAfterForce = await request(app).get(`/api/v1/items/${itemId}`).set(authHeader(manager.token));
    expect(itemAfterForce.body.status).toBe("missing");

    // Mark found — back to available
    const foundRes = await request(app)
      .post(`/api/v1/items/${itemId}/found`)
      .set(authHeader(manager.token));
    expect(foundRes.status).toBe(200);
    expect(foundRes.body.status).toBe("available");
  });

  it("staff cannot create a job (manager-only route)", async () => {
    const staff = await registerUser(app, { role: "staff" });

    const jobRes = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(staff.token))
      .send({
        address: "1 Nowhere Ln", client_name: "X",
        start_date: "2025-02-01", expected_end_date: "2025-05-01",
      });
    expect(jobRes.status).toBe(403);
  });

  it("manager can unassign items that have not been scanned out", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const itemA = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Lamp A", category: "lamp", purchase_cost: 40 });
    const itemB = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Lamp B", category: "lamp", purchase_cost: 40 });

    const job = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(manager.token))
      .send({
        address: "789 Pine St",
        client_name: "Sam Realtor",
        start_date: "2025-02-01",
        expected_end_date: "2025-05-01",
      });

    await request(app)
      .post(`/api/v1/jobs/${job.body.id}/assign`)
      .set(authHeader(manager.token))
      .send({ itemIds: [itemA.body.id, itemB.body.id] });

    // Scan out only B — A stays "assigned"
    await request(app)
      .post(`/api/v1/jobs/${job.body.id}/scan-out`)
      .set(authHeader(manager.token))
      .send({ itemId: itemB.body.id });

    // Cannot unassign a loaded item
    const blocked = await request(app)
      .post(`/api/v1/jobs/${job.body.id}/unassign`)
      .set(authHeader(manager.token))
      .send({ itemIds: [itemB.body.id] });
    expect(blocked.status).toBe(400);

    // Can unassign the still-assigned item
    const unassign = await request(app)
      .post(`/api/v1/jobs/${job.body.id}/unassign`)
      .set(authHeader(manager.token))
      .send({ itemIds: [itemA.body.id] });
    expect(unassign.status).toBe(200);
    expect(unassign.body.unassigned_count).toBe(1);
    expect(unassign.body.item_count).toBe(1);

    const items = await request(app)
      .get(`/api/v1/jobs/${job.body.id}/items`)
      .set(authHeader(manager.token));
    expect(items.body).toHaveLength(1);
    expect(items.body[0].item_id).toBe(itemB.body.id);

    // Item A is still available and free to assign elsewhere
    const a = await request(app)
      .get(`/api/v1/items/${itemA.body.id}`)
      .set(authHeader(manager.token));
    expect(a.body.status).toBe("available");
  });
});
