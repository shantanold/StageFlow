import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { cleanDb, createOrg, registerUser, authHeader } from "./helpers";

// Every route that writes items.set_id must reject a set that doesn't exist
// in the caller's org — a deleted set should be a clean 404 (not an FK-violation
// 500), and another org's set must never be attachable.
describe("item set_id validation", () => {
  beforeEach(cleanDb);
  afterAll(async () => {
    await cleanDb();
    await rawPrisma.$disconnect();
  });

  const MISSING_SET_ID = "00000000-0000-0000-0000-00000000dead";

  async function createSet(token: string, name = "Living Room A") {
    const res = await request(app)
      .post("/api/v1/sets")
      .set(authHeader(token))
      .send({ name });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function createItem(token: string, body: Record<string, unknown> = {}) {
    return request(app)
      .post("/api/v1/items")
      .set(authHeader(token))
      .send({ name: "Sofa", category: "Sofa", purchase_cost: 100, ...body });
  }

  async function createBlank(token: string) {
    const res = await request(app)
      .post("/api/v1/items/bulk-unlabeled")
      .set(authHeader(token))
      .send({ count: 1 });
    expect(res.status).toBe(201);
    return res.body.items[0].id as string;
  }

  async function otherOrgSet() {
    const orgB = await createOrg("Org B");
    const orgBManager = await registerUser(app, { role: "manager", code: orgB.invite_code! });
    return createSet(orgBManager.token, "Org B Set");
  }

  describe("PUT /items/:id", () => {
    it("moves an item between sets and clears it with null", async () => {
      const manager = await registerUser(app);
      const setA = await createSet(manager.token, "Set A");
      const setB = await createSet(manager.token, "Set B");
      const item = await createItem(manager.token, { set_id: setA });

      const moved = await request(app)
        .put(`/api/v1/items/${item.body.id}`)
        .set(authHeader(manager.token))
        .send({ set_id: setB });
      expect(moved.status).toBe(200);
      expect(moved.body.set_id).toBe(setB);
      expect(moved.body.set).toEqual({ id: setB, name: "Set B" });

      const cleared = await request(app)
        .put(`/api/v1/items/${item.body.id}`)
        .set(authHeader(manager.token))
        .send({ set_id: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.set_id).toBeNull();
      expect(cleared.body.set).toBeNull();
    });

    it("treats an empty-string set_id as clearing the set", async () => {
      const manager = await registerUser(app);
      const setA = await createSet(manager.token);
      const item = await createItem(manager.token, { set_id: setA });

      const res = await request(app)
        .put(`/api/v1/items/${item.body.id}`)
        .set(authHeader(manager.token))
        .send({ set_id: "" });
      expect(res.status).toBe(200);
      expect(res.body.set_id).toBeNull();
    });

    it("leaves the set untouched when set_id is omitted", async () => {
      const manager = await registerUser(app);
      const setA = await createSet(manager.token);
      const item = await createItem(manager.token, { set_id: setA });

      const res = await request(app)
        .put(`/api/v1/items/${item.body.id}`)
        .set(authHeader(manager.token))
        .send({ name: "Renamed Sofa" });
      expect(res.status).toBe(200);
      expect(res.body.set_id).toBe(setA);
    });

    it("returns 404 for a nonexistent set and leaves the item unchanged", async () => {
      const manager = await registerUser(app);
      const setA = await createSet(manager.token);
      const item = await createItem(manager.token, { set_id: setA });

      const res = await request(app)
        .put(`/api/v1/items/${item.body.id}`)
        .set(authHeader(manager.token))
        .send({ name: "Should Not Save", set_id: MISSING_SET_ID });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Set not found");

      const after = await rawPrisma.item.findUnique({ where: { id: item.body.id } });
      expect(after!.set_id).toBe(setA);
      expect(after!.name).toBe("Sofa");
    });

    it("returns 404 for a set that was deleted after the client loaded it", async () => {
      const manager = await registerUser(app);
      const doomed = await createSet(manager.token, "Doomed");
      const item = await createItem(manager.token);

      const del = await request(app)
        .delete(`/api/v1/sets/${doomed}`)
        .set(authHeader(manager.token));
      expect(del.status).toBeLessThan(300);

      const res = await request(app)
        .put(`/api/v1/items/${item.body.id}`)
        .set(authHeader(manager.token))
        .send({ set_id: doomed });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Set not found");
    });

    it("rejects another org's set", async () => {
      const manager = await registerUser(app);
      const foreignSet = await otherOrgSet();
      const item = await createItem(manager.token);

      const res = await request(app)
        .put(`/api/v1/items/${item.body.id}`)
        .set(authHeader(manager.token))
        .send({ set_id: foreignSet });
      expect(res.status).toBe(404);

      const after = await rawPrisma.item.findUnique({ where: { id: item.body.id } });
      expect(after!.set_id).toBeNull();
    });
  });

  describe("POST /items", () => {
    it("creates an item in an existing set", async () => {
      const manager = await registerUser(app);
      const setA = await createSet(manager.token);

      const res = await createItem(manager.token, { set_id: setA });
      expect(res.status).toBe(201);
      expect(res.body.set_id).toBe(setA);
    });

    it("returns 404 for a nonexistent set and creates nothing", async () => {
      const manager = await registerUser(app);

      const res = await createItem(manager.token, { set_id: MISSING_SET_ID });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Set not found");
      expect(await rawPrisma.item.count()).toBe(0);
    });

    it("rejects another org's set", async () => {
      const manager = await registerUser(app);
      const foreignSet = await otherOrgSet();

      const res = await createItem(manager.token, { set_id: foreignSet });
      expect(res.status).toBe(404);
      expect(await rawPrisma.item.count({ where: { set_id: foreignSet } })).toBe(0);
    });
  });

  describe("POST /items/:id/claim", () => {
    it("claims a blank into an existing set", async () => {
      const manager = await registerUser(app);
      const setA = await createSet(manager.token);
      const blankId = await createBlank(manager.token);

      const res = await request(app)
        .post(`/api/v1/items/${blankId}/claim`)
        .set(authHeader(manager.token))
        .send({ name: "Claimed Chair", category: "Chair", set_id: setA });
      expect(res.status).toBe(200);
      expect(res.body.set_id).toBe(setA);
    });

    it("returns 404 for a nonexistent set and leaves the blank unclaimed", async () => {
      const manager = await registerUser(app);
      const blankId = await createBlank(manager.token);

      const res = await request(app)
        .post(`/api/v1/items/${blankId}/claim`)
        .set(authHeader(manager.token))
        .send({ name: "Claimed Chair", category: "Chair", set_id: MISSING_SET_ID });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Set not found");

      const after = await rawPrisma.item.findUnique({ where: { id: blankId } });
      expect(after!.is_unlabeled).toBe(true);
      expect(after!.set_id).toBeNull();
    });

    it("rejects another org's set", async () => {
      const manager = await registerUser(app);
      const foreignSet = await otherOrgSet();
      const blankId = await createBlank(manager.token);

      const res = await request(app)
        .post(`/api/v1/items/${blankId}/claim`)
        .set(authHeader(manager.token))
        .send({ name: "Claimed Chair", category: "Chair", set_id: foreignSet });
      expect(res.status).toBe(404);

      const after = await rawPrisma.item.findUnique({ where: { id: blankId } });
      expect(after!.set_id).toBeNull();
    });
  });
});
