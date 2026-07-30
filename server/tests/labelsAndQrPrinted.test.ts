import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { cleanDb, registerUser, authHeader } from "./helpers";

describe("QR labels + qr_printed", () => {
  beforeEach(cleanDb);
  afterAll(async () => {
    await cleanDb();
    await rawPrisma.$disconnect();
  });

  it("new items default to qr_printed false", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const res = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Unprinted Sofa", category: "Sofa", purchase_cost: 100 });

    expect(res.status).toBe(201);
    expect(res.body.qr_printed).toBe(false);
  });

  it("generating labels returns a PDF and marks items qr_printed", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const a = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Label A", category: "Sofa", purchase_cost: 10 });
    const b = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Label B", category: "Table", purchase_cost: 10 });

    const pdf = await request(app)
      .get(`/api/v1/labels/generate?itemIds=${a.body.id},${b.body.id}`)
      .set(authHeader(manager.token));

    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/application\/pdf/);
    expect(pdf.body.length ?? Buffer.byteLength(pdf.body)).toBeGreaterThan(100);

    const list = await request(app).get("/api/v1/items").set(authHeader(manager.token));
    const itemA = list.body.find((i: { id: string }) => i.id === a.body.id);
    const itemB = list.body.find((i: { id: string }) => i.id === b.body.id);
    expect(itemA.qr_printed).toBe(true);
    expect(itemB.qr_printed).toBe(true);
  });

  it("filters items by qr_printed query param", async () => {
    const manager = await registerUser(app, { role: "manager" });

    const printed = await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Will Print", category: "Sofa", purchase_cost: 10 });
    await request(app)
      .post("/api/v1/items")
      .set(authHeader(manager.token))
      .send({ name: "Stay Unprinted", category: "Chair", purchase_cost: 10 });

    await request(app)
      .get(`/api/v1/labels/generate?itemIds=${printed.body.id}`)
      .set(authHeader(manager.token));

    const needsPrint = await request(app)
      .get("/api/v1/items?qr_printed=false")
      .set(authHeader(manager.token));
    const alreadyPrinted = await request(app)
      .get("/api/v1/items?qr_printed=true")
      .set(authHeader(manager.token));

    expect(needsPrint.status).toBe(200);
    expect(alreadyPrinted.status).toBe(200);
    expect(needsPrint.body.every((i: { qr_printed: boolean }) => i.qr_printed === false)).toBe(true);
    expect(alreadyPrinted.body.every((i: { qr_printed: boolean }) => i.qr_printed === true)).toBe(true);
    expect(alreadyPrinted.body.some((i: { id: string }) => i.id === printed.body.id)).toBe(true);
  });
});
