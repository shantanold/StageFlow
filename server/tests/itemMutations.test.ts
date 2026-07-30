import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { cleanDb, registerUser, authHeader } from "./helpers";

describe("item qr_printed toggle + delete/dispose", () => {
  beforeEach(cleanDb);
  afterAll(async () => {
    await cleanDb();
    await rawPrisma.$disconnect();
  });

  it("managers can toggle qr_printed via PUT", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const created = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Toggle Sofa", category: "Sofa", purchase_cost: 10 });

    expect(created.body.qr_printed).toBe(false);

    const marked = await request(app)
      .put(`/api/v1/items/${created.body.id}`)
      .set(authHeader(manager.token))
      .send({ qr_printed: true });
    expect(marked.status).toBe(200);
    expect(marked.body.qr_printed).toBe(true);

    const unmarked = await request(app)
      .put(`/api/v1/items/${created.body.id}`)
      .set(authHeader(manager.token))
      .send({ qr_printed: false });
    expect(unmarked.status).toBe(200);
    expect(unmarked.body.qr_printed).toBe(false);
  });

  it("disposes an available item (soft remove) and blocks staged items", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const item = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Dispose Me", category: "Chair", purchase_cost: 20 });

    const disposed = await request(app)
      .post(`/api/v1/items/${item.body.id}/dispose`)
      .set(authHeader(manager.token));
    expect(disposed.status).toBe(200);
    expect(disposed.body.status).toBe("disposed");

    // Staged item cannot be disposed
    const stagedItem = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Staged Sofa", category: "Sofa", purchase_cost: 30 });
    const job = await request(app)
      .post("/api/v1/jobs")
      .set(authHeader(manager.token))
      .send({
        address: "9 Block St", city: "Houston", state: "TX", zip: "77001",
        client_name: "C", client_contact: "1",
        start_date: "2025-01-01", expected_end_date: "2025-06-01",
      });
    await request(app)
      .post(`/api/v1/jobs/${job.body.id}/assign`)
      .set(authHeader(manager.token))
      .send({ itemIds: [stagedItem.body.id] });
    await request(app)
      .post(`/api/v1/jobs/${job.body.id}/scan-out`)
      .set(authHeader(manager.token))
      .send({ itemId: stagedItem.body.id });

    const blocked = await request(app)
      .post(`/api/v1/items/${stagedItem.body.id}/dispose`)
      .set(authHeader(manager.token));
    expect(blocked.status).toBe(400);
  });

  it("permanently deletes an item and frees the SKU", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const item = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Delete Me", category: "Lamp", purchase_cost: 15 });
    const sku = item.body.sku as string;

    const del = await request(app)
      .delete(`/api/v1/items/${item.body.id}`)
      .set(authHeader(manager.token));
    expect(del.status).toBe(200);

    const gone = await request(app)
      .get(`/api/v1/items/${item.body.id}`)
      .set(authHeader(manager.token));
    expect(gone.status).toBe(404);

    // SKU can be reused via auto-increment after delete of last item — at least item is gone
    const list = await request(app).get("/api/v1/items").set(authHeader(manager.token));
    expect(list.body.find((i: { sku: string }) => i.sku === sku)).toBeUndefined();
  });

  it("staff cannot dispose or delete", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const staff = await registerUser(app, { role: "staff" });
    const item = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Protected", category: "Decor", purchase_cost: 5 });

    const dispose = await request(app)
      .post(`/api/v1/items/${item.body.id}/dispose`)
      .set(authHeader(staff.token));
    expect(dispose.status).toBe(403);

    const del = await request(app)
      .delete(`/api/v1/items/${item.body.id}`)
      .set(authHeader(staff.token));
    expect(del.status).toBe(403);
  });
});
