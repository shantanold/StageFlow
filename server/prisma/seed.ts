
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // ─── Users ────────────────────────────────────────────────────────────────

  const managerHash = await bcrypt.hash("staging123", 10);
  const staffHash   = await bcrypt.hash("staging123", 10);

  const manager = await prisma.user.upsert({
    where:  { email: "manager@stageflow.app" },
    update: {},
    create: {
      name:          "Sarah Kim",
      email:         "manager@stageflow.app",
      password_hash: managerHash,
      role:          "manager",
    },
  });

  const staff = await prisma.user.upsert({
    where:  { email: "staff@stageflow.app" },
    update: {},
    create: {
      name:          "Mike Torres",
      email:         "staff@stageflow.app",
      password_hash: staffHash,
      role:          "staff",
    },
  });

  console.log(`✓ Users: ${manager.email}, ${staff.email}`);

  // ─── Sets ─────────────────────────────────────────────────────────────────

  const modernLiving =
    (await prisma.set.findFirst({ where: { name: "Modern Living Set" } })) ??
    (await prisma.set.create({
      data: { name: "Modern Living Set", description: "Contemporary neutral-palette living room" },
    }));

  const coastalBedroom =
    (await prisma.set.findFirst({ where: { name: "Coastal Bedroom Set" } })) ??
    (await prisma.set.create({
      data: { name: "Coastal Bedroom Set", description: "Light and airy coastal bedroom staging" },
    }));

  console.log(`✓ Sets: ${modernLiving.name}, ${coastalBedroom.name}`);

  // ─── Items ────────────────────────────────────────────────────────────────

  const itemsData = [
    // Modern Living Set
    { sku: "STG-ITM-0001", name: "Modern Gray Sofa",       category: "Sofa",    set_id: modernLiving.id,   purchase_cost: 1200, purchase_date: new Date("2024-06-15"), status: "available" as const },
    { sku: "STG-ITM-0002", name: "Glass Coffee Table",     category: "Table",   set_id: modernLiving.id,   purchase_cost: 450,  purchase_date: new Date("2024-06-15"), status: "available" as const },
    { sku: "STG-ITM-0003", name: "White Linen Armchair",   category: "Chair",   set_id: modernLiving.id,   purchase_cost: 680,  purchase_date: new Date("2024-06-15"), status: "available" as const },
    { sku: "STG-ITM-0004", name: "Abstract Canvas Art",    category: "Art",     set_id: modernLiving.id,   purchase_cost: 220,  purchase_date: new Date("2024-06-15"), status: "available" as const },
    { sku: "STG-ITM-0005", name: "Floor Lamp Brass",       category: "Lamp",    set_id: modernLiving.id,   purchase_cost: 290,  purchase_date: new Date("2024-07-01"), status: "available" as const },
    { sku: "STG-ITM-0006", name: "Woven Area Rug 8x10",    category: "Rug",     set_id: modernLiving.id,   purchase_cost: 520,  purchase_date: new Date("2024-07-01"), status: "available" as const },
    // Coastal Bedroom Set
    { sku: "STG-ITM-0007", name: "Queen Upholstered Bed",  category: "Bed",     set_id: coastalBedroom.id, purchase_cost: 890,  purchase_date: new Date("2024-08-10"), status: "available" as const },
    { sku: "STG-ITM-0008", name: "Coastal Nightstand",     category: "Table",   set_id: coastalBedroom.id, purchase_cost: 240,  purchase_date: new Date("2024-08-10"), status: "available" as const },
    { sku: "STG-ITM-0009", name: "Coastal Nightstand #2",  category: "Table",   set_id: coastalBedroom.id, purchase_cost: 240,  purchase_date: new Date("2024-08-10"), status: "available" as const },
    { sku: "STG-ITM-0010", name: "Driftwood Mirror",       category: "Mirror",  set_id: coastalBedroom.id, purchase_cost: 310,  purchase_date: new Date("2024-08-10"), status: "available" as const },
    // Standalone items
    { sku: "STG-ITM-0011", name: "Faux Fiddle Leaf Fig",   category: "Plant",   set_id: null,              purchase_cost: 120,  purchase_date: new Date("2024-04-01"), status: "available" as const },
    { sku: "STG-ITM-0012", name: "Gold Geometric Vase",    category: "Decor",   set_id: null,              purchase_cost: 65,   purchase_date: new Date("2024-04-01"), status: "available" as const },
    { sku: "STG-ITM-0013", name: "Throw Blanket Cream",    category: "Textile", set_id: null,              purchase_cost: 70,   purchase_date: new Date("2024-09-15"), status: "available" as const },
  ];

  for (const item of itemsData) {
    await prisma.item.upsert({
      where:  { sku: item.sku },
      update: {},
      create: item,
    });
  }

  console.log(`✓ Items: ${itemsData.length} seeded`);

  // ─── Sample active job ────────────────────────────────────────────────────

  const job = await prisma.job.upsert({
    where: { id: "seed-job-001" },
    update: {},
    create: {
      id:               "seed-job-001",
      address:          "4821 Elm Creek Dr",
      city:             "Pearland",
      state:            "TX",
      zip:              "77584",
      client_name:      "Jennifer Walsh",
      client_contact:   "jennifer.walsh@realty.com",
      status:           "planning",
      start_date:       new Date(),
      expected_end_date: new Date(Date.now() + 30 * 86_400_000),
      notes:            "Master bedroom + living room staging",
      created_by:       manager.id,
    },
  });

  console.log(`✓ Job: ${job.address}`);
  console.log("\nSeed complete.");
  console.log("\nTest credentials:");
  console.log("  Manager — manager@stageflow.app / staging123");
  console.log("  Staff   — staff@stageflow.app   / staging123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
