import dotenv from "dotenv";
import path from "path";

// Loaded before every test file — points the app + Prisma at the test DB.
dotenv.config({ path: path.resolve(__dirname, "../.env.test"), override: true });
