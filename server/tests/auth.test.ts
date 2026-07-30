import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { cleanDb, registerUser, authHeader, uniqueEmail } from "./helpers";

describe("auth", () => {
  beforeEach(cleanDb);
  afterAll(async () => {
    await cleanDb();
    await rawPrisma.$disconnect();
  });

  it("rejects registration without the correct signup code", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      name: "No Code",
      email: uniqueEmail(),
      password: "password123",
      role: "manager",
      code: "wrong-code",
    });
    expect(res.status).toBe(403);
  });

  it("rejects registration with no code at all", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      name: "No Code",
      email: uniqueEmail(),
      password: "password123",
      role: "manager",
    });
    expect(res.status).toBe(403);
  });

  it("allows registration with the correct signup code", async () => {
    const email = uniqueEmail();
    const res = await request(app).post("/api/v1/auth/register").send({
      name: "Correct Code",
      email,
      password: "password123",
      role: "staff",
      code: process.env.SIGNUP_CODE,
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
  });

  it("blocks login for a deactivated user", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const staff = await registerUser(app, { role: "staff" });

    // Deactivate the staff account
    const patchRes = await request(app)
      .patch(`/api/v1/users/${staff.userId}`)
      .set(authHeader(manager.token))
      .send({ is_active: false });
    expect(patchRes.status).toBe(200);

    const staffUser = await rawPrisma.user.findUnique({ where: { id: staff.userId } });
    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: staffUser!.email,
      password: "password123",
    });
    expect(loginRes.status).toBe(403);
  });

  it("a manager cannot change their own role or deactivate themselves", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const res = await request(app)
      .patch(`/api/v1/users/${manager.userId}`)
      .set(authHeader(manager.token))
      .send({ is_active: false });
    expect(res.status).toBe(400);
  });
});
