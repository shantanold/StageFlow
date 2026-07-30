import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { cleanDb, registerUser, authHeader } from "./helpers";

describe("items CSV import", () => {
  beforeEach(cleanDb);
  afterAll(async () => {
    await cleanDb();
    await rawPrisma.$disconnect();
  });

  it("imports dimensions when present, leaves them null when absent", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const res = await request(app)
      .post("/api/v1/items/import")
      .set(authHeader(manager.token))
      .send({
        items: [
          {
            name: "Grey Sofa", category: "sofa", purchase_cost: 500, purchase_date: "2025-01-01",
            width_in: 84, depth_in: 36, height_in: 32, notes: "living room",
          },
          {
            name: "Side Table", category: "table", purchase_cost: 80, purchase_date: "2025-01-01",
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
    expect(res.body.errors).toEqual([]);

    const items = await request(app).get("/api/v1/items").set(authHeader(manager.token));
    const sofa = items.body.find((i: any) => i.name === "Grey Sofa");
    const table = items.body.find((i: any) => i.name === "Side Table");

    expect(Number(sofa.width_in)).toBe(84);
    expect(Number(sofa.depth_in)).toBe(36);
    expect(Number(sofa.height_in)).toBe(32);

    expect(table.width_in).toBeNull();
    expect(table.depth_in).toBeNull();
    expect(table.height_in).toBeNull();
  });

  it("still enforces required fields and reports row errors (dimensions didn't break existing validation)", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const res = await request(app)
      .post("/api/v1/items/import")
      .set(authHeader(manager.token))
      .send({
        items: [
          { name: "Valid Lamp", category: "lamp", purchase_cost: 50, purchase_date: "2025-01-01" },
          { category: "chair", purchase_cost: 10, purchase_date: "2025-01-01" }, // missing name
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].row).toBe(2);
  });

  it("staff cannot import items (manager-only route unaffected)", async () => {
    const staff = await registerUser(app, { role: "staff" });
    const res = await request(app)
      .post("/api/v1/items/import")
      .set(authHeader(staff.token))
      .send({ items: [{ name: "X", category: "sofa", purchase_cost: 1, purchase_date: "2025-01-01" }] });
    expect(res.status).toBe(403);
  });
});
