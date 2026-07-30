import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { cleanDb, registerUser, authHeader } from "./helpers";

describe("optional purchase_date", () => {
  beforeEach(cleanDb);
  afterAll(async () => {
    await cleanDb();
    await rawPrisma.$disconnect();
  });

  it("creates an item without purchase_date", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const res = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "No Date Chair", category: "Chair", purchase_cost: 75 });

    expect(res.status).toBe(201);
    expect(res.body.purchase_date).toBeNull();
    expect(res.body.name).toBe("No Date Chair");
  });

  it("still accepts purchase_date when provided", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const res = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({
        name: "Dated Sofa",
        category: "Sofa",
        purchase_cost: 500,
        purchase_date: "2024-06-15",
      });

    expect(res.status).toBe(201);
    expect(res.body.purchase_date).toBeTruthy();
    expect(String(res.body.purchase_date).startsWith("2024-06-15")).toBe(true);
  });

  it("imports rows without purchase_date", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const res = await request(app)
      .post("/api/v1/items/import")
      .set(authHeader(manager.token))
      .send({
        items: [
          { name: "Imported Lamp", category: "Lamp", purchase_cost: 40 },
          { name: "Imported Rug", category: "Rug", purchase_cost: 90, purchase_date: "2025-01-01" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
    expect(res.body.errors).toEqual([]);

    const list = await request(app).get("/api/v1/items").set(authHeader(manager.token));
    const lamp = list.body.find((i: { name: string }) => i.name === "Imported Lamp");
    const rug = list.body.find((i: { name: string }) => i.name === "Imported Rug");

    expect(lamp.purchase_date).toBeNull();
    expect(rug.purchase_date).toBeTruthy();
  });

  it("clears purchase_date on update when null is sent", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const created = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({
        name: "Clearable",
        category: "Decor",
        purchase_cost: 20,
        purchase_date: "2023-01-01",
      });

    const updated = await request(app)
      .put(`/api/v1/items/${created.body.id}`)
      .set(authHeader(manager.token))
      .send({ purchase_date: null });

    expect(updated.status).toBe(200);
    expect(updated.body.purchase_date).toBeNull();
  });
});
