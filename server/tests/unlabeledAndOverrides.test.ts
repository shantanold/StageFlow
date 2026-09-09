import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDb, registerUser, authHeader } from "./helpers";

describe("unlabeled blanks, claim, duplicate, manual status", () => {
  beforeEach(cleanDb);
  afterAll(async () => {
    await cleanDb();
    await prisma.$disconnect();
  });

  it("bulk-unlabeled creates is_unlabeled items and claim fills them in", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const bulk = await request(app)
      .post("/api/v1/items/bulk-unlabeled")
      .set(authHeader(manager.token))
      .send({ count: 2 });
    expect(bulk.status).toBe(201);
    expect(bulk.body.created).toBe(2);
    expect(bulk.body.items.every((i: { is_unlabeled: boolean }) => i.is_unlabeled)).toBe(true);
    expect(bulk.body.items.every((i: { name: string }) => i.name === "Red Dot Home Services")).toBe(true);

    const list = await request(app)
      .get("/api/v1/items?is_unlabeled=true")
      .set(authHeader(manager.token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);

    const job = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(manager.token))
      .send({
        address: "1 Placeholder St",
        city: "Pearland",
        state: "TX",
        zip: "77584",
        client_name: "Client",
        client_contact: "555",
        start_date: "2025-02-01",
        expected_end_date: "2025-05-01",
      });
    const blocked = await request(app)
      .post(`/api/v1/jobs/${job.body.id}/assign`)
      .set(authHeader(manager.token))
      .send({ itemIds: [bulk.body.items[0].id] });
    expect(blocked.status).toBe(400);

    const id = bulk.body.items[0].id as string;
    const claim = await request(app)
      .post(`/api/v1/items/${id}/claim`)
      .set(authHeader(manager.token))
      .send({ name: "Grey Sofa", category: "Sofa", notes: "Living room" });
    expect(claim.status).toBe(200);
    expect(claim.body.is_unlabeled).toBe(false);
    expect(claim.body.name).toBe("Grey Sofa");

    const filtered = await request(app)
      .get("/api/v1/items?is_unlabeled=true")
      .set(authHeader(manager.token));
    expect(filtered.body).toHaveLength(1);
  });

  it("claim can optionally assign the item to a planning job", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const bulk = await request(app)
      .post("/api/v1/items/bulk-unlabeled")
      .set(authHeader(manager.token))
      .send({ count: 1 });
    expect(bulk.status).toBe(201);
    const id = bulk.body.items[0].id as string;

    const job = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(manager.token))
      .send({
        address: "9 Claim St",
        city: "Houston",
        state: "TX",
        zip: "77002",
        client_name: "Client",
        client_contact: "555",
        start_date: "2025-02-01",
        expected_end_date: "2025-05-01",
      });
    expect(job.status).toBe(201);
    const jobId = job.body.id as string;

    const claim = await request(app)
      .post(`/api/v1/items/${id}/claim`)
      .set(authHeader(manager.token))
      .send({ name: "Claimed Sofa", category: "Sofa", job_id: jobId });
    expect(claim.status).toBe(200);
    expect(claim.body.is_unlabeled).toBe(false);
    expect(claim.body.status).toBe("staged");

    const rows = await request(app)
      .get(`/api/v1/jobs/${jobId}/items`)
      .set(authHeader(manager.token));
    expect(rows.status).toBe(200);
    expect(rows.body).toHaveLength(1);
    expect(rows.body[0].item_id).toBe(id);
    expect(rows.body[0].status).toBe("loaded");
  });

  it("duplicate copies description fields with a new SKU", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const created = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({
        name: "Navy Armchair",
        category: "Chair",
        purchase_cost: 200,
        purchase_date: "2025-01-01",
        width_in: 30,
        depth_in: 32,
        height_in: 36,
        notes: "Velvet",
      });
    expect(created.status).toBe(201);

    const dup = await request(app)
      .post(`/api/v1/items/${created.body.id}/duplicate`)
      .set(authHeader(manager.token));
    expect(dup.status).toBe(201);
    expect(dup.body.sku).not.toBe(created.body.sku);
    expect(dup.body.name).toBe("Navy Armchair");
    expect(dup.body.category).toBe("Chair");
    expect(dup.body.width_in == null ? null : Number(dup.body.width_in)).toBe(30);
    expect(dup.body.status).toBe("available");
    expect(dup.body.is_unlabeled).toBe(false);
    expect(Number(dup.body.purchase_cost)).toBe(0);
    expect(dup.body.purchase_date).toBeNull();
  });

  it("assign stages the item immediately; undo-load returns it to assigned", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const item = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Lamp", category: "Lamp", purchase_cost: 40 });
    const itemId = item.body.id as string;

    const job = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(manager.token))
      .send({
        address: "1 Test St",
        city: "Pearland",
        state: "TX",
        zip: "77584",
        client_name: "Client",
        client_contact: "555",
        start_date: "2025-02-01",
        expected_end_date: "2025-05-01",
      });
    const jobId = job.body.id as string;

    const assigned = await request(app)
      .post(`/api/v1/jobs/${jobId}/assign`)
      .set(authHeader(manager.token))
      .send({ itemIds: [itemId] });
    expect(assigned.status).toBe(200);
    expect(assigned.body.status).toBe("active");

    const afterAssign = await request(app)
      .get(`/api/v1/items/${itemId}`)
      .set(authHeader(manager.token));
    expect(afterAssign.body.status).toBe("staged");

    const rowsAfterAssign = await request(app)
      .get(`/api/v1/jobs/${jobId}/items`)
      .set(authHeader(manager.token));
    expect(rowsAfterAssign.body.find((r: { item_id: string }) => r.item_id === itemId).status).toBe("loaded");

    const undone = await request(app)
      .post(`/api/v1/jobs/${jobId}/undo-load`)
      .set(authHeader(manager.token))
      .send({ itemId });
    expect(undone.status).toBe(200);
    expect(undone.body.item.status).toBe("available");

    const rows = await request(app)
      .get(`/api/v1/jobs/${jobId}/items`)
      .set(authHeader(manager.token));
    expect(rows.body.find((r: { item_id: string }) => r.item_id === itemId).status).toBe("assigned");
  });

  it("set-status available closes a loaded job item", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const item = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Table", category: "Table", purchase_cost: 100 });
    const itemId = item.body.id as string;

    const job = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(manager.token))
      .send({
        address: "2 Test St",
        city: "Pearland",
        state: "TX",
        zip: "77584",
        client_name: "Client",
        client_contact: "555",
        start_date: "2025-02-01",
        expected_end_date: "2025-05-01",
      });
    const jobId = job.body.id as string;

    await request(app)
      .post(`/api/v1/jobs/${jobId}/assign`)
      .set(authHeader(manager.token))
      .send({ itemIds: [itemId] });

    const override = await request(app)
      .post(`/api/v1/items/${itemId}/set-status`)
      .set(authHeader(manager.token))
      .send({ status: "available", condition: "good", notes: "Mistake fix" });
    expect(override.status).toBe(200);
    expect(override.body.status).toBe("available");

    const rows = await request(app)
      .get(`/api/v1/jobs/${jobId}/items`)
      .set(authHeader(manager.token));
    expect(rows.body.find((r: { item_id: string }) => r.item_id === itemId).status).toBe("returned");
  });
});
