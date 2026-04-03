import {
  PrismaClient,
  UserRole,
  AccountStatus,
  ProductCategory,
  TransactionType,
  PaymentMethod,
  FuelGrade,
  FoodserviceBrand,
  FoodserviceCategory,
  FoodserviceHotCaseStatus,
  FoodserviceWasteReason,
  Prisma,
} from "@prisma/client";
import type { Inventory, Product } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function d(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

async function hashPassword(plain: string, saltRounds: number) {
  return bcrypt.hash(plain, saltRounds);
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)]!;
}

function randomPastDateWithinDays(days: number): Date {
  const now = Date.now();
  const ms = randomInt(0, days * 24 * 60 * 60 * 1000);
  return new Date(now - ms);
}

function utcNoonFromYmdSeed(ymd: string): Date {
  const parts = ymd.split("-").map(Number);
  const y = parts[0]!;
  const mo = parts[1]!;
  const day = parts[2]!;
  return new Date(Date.UTC(y, mo - 1, day, 12, 0, 0, 0));
}

function formatLocalYmdFromDate(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const CATEGORIES: ProductCategory[] = [
  ProductCategory.tobacco,
  ProductCategory.beverages,
  ProductCategory.snacks,
  ProductCategory.candy,
  ProductCategory.grocery,
  ProductCategory.foodservice,
  ProductCategory.lottery,
  ProductCategory.fuel,
  ProductCategory.other,
];

async function main() {
  const saltRounds = Number(requireEnv("BCRYPT_SALT_ROUNDS"));
  if (!Number.isFinite(saltRounds) || saltRounds < 12) {
    throw new Error("BCRYPT_SALT_ROUNDS must be >= 12");
  }

  const adminEmail = "admin@company.com";
  const adminTempPassword = requireEnv("TEMP_ADMIN_PASSWORD");
  const seedPassword = requireEnv("SEED_USER_PASSWORD");

  const stores = [
    { id: "store_001", name: "Mock Store 1", location: "Austin, TX", hatchEnabled: true },
    { id: "store_002", name: "Mock Store 2", location: "Charlotte, NC", hatchEnabled: false },
    { id: "store_003", name: "Mock Store 3", location: "Denver, CO", hatchEnabled: false },
  ];

  // Clear business data first (FK order), then auth.
  await prisma.productionPlanLine.deleteMany();
  await prisma.productionPlan.deleteMany();
  await prisma.foodserviceWasteLog.deleteMany();
  await prisma.foodserviceHotCaseEntry.deleteMany();
  await prisma.foodserviceMenuItem.deleteMany();
  await prisma.recipeIngredient.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.transactionLineItem.deleteMany();
  await prisma.storeProductPriceOverride.deleteMany();
  await prisma.productChangeLog.deleteMany();
  await prisma.posTransaction.deleteMany();
  await prisma.purchaseOrderLineItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.fuelDelivery.deleteMany();
  await prisma.fuelPriceHistory.deleteMany();
  await prisma.fuelDailyVolumeSnapshot.deleteMany();
  await prisma.fuelData.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.shrinkageRecord.deleteMany();
  await prisma.lotterySettlement.deleteMany();
  await prisma.lotteryPack.deleteMany();
  await prisma.lotteryDailySummary.deleteMany();
  await prisma.scanDataSubmission.deleteMany();
  await prisma.scanDataProgramProduct.deleteMany();
  await prisma.scanDataProgram.deleteMany();
  await prisma.product.deleteMany();
  await prisma.vendor.deleteMany();

  await prisma.notification.deleteMany();
  await prisma.userNotificationPreference.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.shiftTemplate.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.user.deleteMany();
  await prisma.store.deleteMany();

  await prisma.store.createMany({ data: stores });

  const passwordHashAdmin = await hashPassword(adminTempPassword, saltRounds);
  const passwordHashSeed = await hashPassword(seedPassword, saltRounds);

  const users: Array<{
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    assignedStoreId: string | null;
    accountStatus: AccountStatus;
    passwordHash: string;
  }> = [
    {
      email: adminEmail,
      firstName: "RDI",
      lastName: "Admin",
      role: UserRole.admin,
      assignedStoreId: "store_001",
      accountStatus: AccountStatus.active,
      passwordHash: passwordHashAdmin,
    },
    { email: "manager1@company.com", firstName: "Mina", lastName: "Khan", role: UserRole.manager, assignedStoreId: "store_001", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "manager2@company.com", firstName: "Diego", lastName: "Silva", role: UserRole.manager, assignedStoreId: "store_002", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "manager3@company.com", firstName: "Ava", lastName: "Chen", role: UserRole.manager, assignedStoreId: "store_003", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "manager4@company.com", firstName: "Noah", lastName: "Johnson", role: UserRole.manager, assignedStoreId: "store_001", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "manager5@company.com", firstName: "Fatima", lastName: "Omar", role: UserRole.manager, assignedStoreId: "store_002", accountStatus: AccountStatus.disabled, passwordHash: passwordHashSeed },
    { email: "emp1@company.com", firstName: "Liam", lastName: "Brown", role: UserRole.employee, assignedStoreId: "store_001", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp2@company.com", firstName: "Emma", lastName: "Davis", role: UserRole.employee, assignedStoreId: "store_001", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp3@company.com", firstName: "Olivia", lastName: "Wilson", role: UserRole.employee, assignedStoreId: "store_001", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp4@company.com", firstName: "Ethan", lastName: "Martinez", role: UserRole.employee, assignedStoreId: "store_002", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp5@company.com", firstName: "Sophia", lastName: "Anderson", role: UserRole.employee, assignedStoreId: "store_002", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp6@company.com", firstName: "Mason", lastName: "Taylor", role: UserRole.employee, assignedStoreId: "store_002", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp7@company.com", firstName: "Amelia", lastName: "Thomas", role: UserRole.employee, assignedStoreId: "store_003", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp8@company.com", firstName: "Lucas", lastName: "Moore", role: UserRole.employee, assignedStoreId: "store_003", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp9@company.com", firstName: "Isabella", lastName: "Jackson", role: UserRole.employee, assignedStoreId: "store_003", accountStatus: AccountStatus.disabled, passwordHash: passwordHashSeed },
  ];

  if (users.length !== 15) throw new Error(`Seed user count must be 15, got ${users.length}`);

  await prisma.user.createMany({
    data: users.map((u) => ({
      email: u.email,
      passwordHash: u.passwordHash,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      assignedStoreId: u.assignedStoreId,
      accountStatus: u.accountStatus,
      mfaEnabled: false,
      mfaSecret: null,
      forcePasswordChange: u.email === adminEmail,
    })),
  });

  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) throw new Error("Admin seed failed");

  // --- Vendors (5) ---
  const vendorData = [
    { companyName: "Summit Wholesale Co.", contactName: "Jordan Lee", contactEmail: "jordan@summitwholesale.example", contactPhone: "555-0101", accountNumber: "VND-10001", paymentTerms: "Net 30" },
    { companyName: "Blue Ridge Distributors", contactName: "Sam Rivera", contactEmail: "s.billing@blueridge.example", contactPhone: "555-0102", accountNumber: "VND-10002", paymentTerms: "Net 15" },
    { companyName: "Metro Snack Supply", contactName: "Priya Shah", contactEmail: "accounts@metrosnack.example", contactPhone: "555-0103", accountNumber: "VND-10003", paymentTerms: "Net 30" },
    { companyName: "Lone Star Tobacco & More", contactName: "Chris Ortiz", contactEmail: "orders@lonestar.example", contactPhone: "555-0104", accountNumber: "VND-10004", paymentTerms: "COD" },
    { companyName: "Front Range Grocery", contactName: "Taylor Kim", contactEmail: "ap@frontrange.example", contactPhone: "555-0105", accountNumber: "VND-10005", paymentTerms: "Net 45" },
  ];

  const vendors = await prisma.$transaction(
    vendorData.map((v) =>
      prisma.vendor.create({
        data: { ...v, active: true },
      })
    )
  );

  // --- 50 products ---
  const productRows: Array<{
    upc: string;
    name: string;
    description: string | null;
    category: ProductCategory;
    brand: string | null;
    vendorId: string;
    costPrice: Prisma.Decimal;
    retailPrice: Prisma.Decimal;
    taxEligible: boolean;
    active: boolean;
  }> = [];
  for (let i = 1; i <= 50; i++) {
    const category = CATEGORIES[(i - 1) % CATEGORIES.length];
    const vendor = vendors[(i - 1) % vendors.length]!;
    const cost = (1.25 + (i % 17) * 0.35).toFixed(2);
    const retail = (parseFloat(cost) * 1.35).toFixed(2);
    productRows.push({
      upc: `08500000${String(i).padStart(4, "0")}`,
      name: `Sample Product ${i}`,
      description: `Seeded demo SKU ${i} — ${category}`,
      category,
      brand: `Brand ${(i % 9) + 1}`,
      vendorId: vendor.id,
      costPrice: d(cost),
      retailPrice: d(retail),
      taxEligible: i % 11 !== 0,
      active: true,
    });
  }

  await prisma.product.createMany({ data: productRows });

  const products = await prisma.product.findMany({ orderBy: { upc: "asc" } });
  if (products.length !== 50) throw new Error("Expected 50 products");

  // --- Inventory: every product at every store ---
  const inventoryRows: Prisma.InventoryCreateManyInput[] = [];
  for (const store of stores) {
    for (const p of products) {
      const base = p.upc.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      inventoryRows.push({
        storeId: store.id,
        productId: p.id,
        quantityOnHand: 10 + (base % 80),
        minStockThreshold: 5 + (base % 15),
        lastCountedAt: randomPastDateWithinDays(14),
      });
    }
  }
  await prisma.inventory.createMany({ data: inventoryRows });

  // --- Foodservice: recipes, menu items, sample hot-case history ---
  const p0 = products[0]!;
  const p1 = products[1]!;
  const p2 = products[2]!;

  const recipeRoller = await prisma.recipe.create({
    data: {
      name: "Roller Grill — Hot Dogs",
      brand: FoodserviceBrand.store_brand,
      category: FoodserviceCategory.roller_grill,
      instructions: "Cook on roller grill to 160°F internal. Rotate and hold with timer.",
      prepTimeMinutes: 5,
      cookTimeMinutes: 12,
      cookTemperature: "roller",
      yieldQuantity: d(24),
    },
  });
  await prisma.recipeIngredient.create({
    data: {
      recipeId: recipeRoller.id,
      productId: p0.id,
      quantityPerBatch: d(24),
      unitOfMeasure: "each",
    },
  });

  const recipePizza = await prisma.recipe.create({
    data: {
      name: "Slice — Cheese",
      brand: FoodserviceBrand.store_brand,
      category: FoodserviceCategory.pizza,
      instructions: "Bake, slice, hold under warmer.",
      prepTimeMinutes: 3,
      cookTimeMinutes: 8,
      cookTemperature: "465°F",
      yieldQuantity: d(8),
    },
  });
  await prisma.recipeIngredient.create({
    data: {
      recipeId: recipePizza.id,
      productId: p1.id,
      quantityPerBatch: d(2),
      unitOfMeasure: "pounds",
    },
  });

  const recipeHatch = await prisma.recipe.create({
    data: {
      name: "Hatch 8pc Fried Chicken",
      brand: FoodserviceBrand.hatch,
      category: FoodserviceCategory.chicken,
      instructions: "Dredge, pressure fry, rest 2 min, hold with timer.",
      prepTimeMinutes: 10,
      cookTimeMinutes: 14,
      cookTemperature: "350°F oil",
      yieldQuantity: d(8),
    },
  });
  await prisma.recipeIngredient.createMany({
    data: [
      {
        recipeId: recipeHatch.id,
        productId: p0.id,
        quantityPerBatch: d(8),
        unitOfMeasure: "pieces",
      },
      {
        recipeId: recipeHatch.id,
        productId: p2.id,
        quantityPerBatch: d(0.5),
        unitOfMeasure: "cups",
      },
    ],
  });

  for (const store of stores) {
    const baseItems: Array<{
      itemName: string;
      category: FoodserviceCategory;
      brand: FoodserviceBrand;
      recipeId: string | null;
      retailPrice: Prisma.Decimal;
      holdTimeMinutes: number;
      prepTimeMinutes: number;
    }> = [
      {
        itemName: "Hot Dog",
        category: FoodserviceCategory.roller_grill,
        brand: FoodserviceBrand.store_brand,
        recipeId: recipeRoller.id,
        retailPrice: d("2.29"),
        holdTimeMinutes: 120,
        prepTimeMinutes: 5,
      },
      {
        itemName: "Cheese Pizza Slice",
        category: FoodserviceCategory.pizza,
        brand: FoodserviceBrand.store_brand,
        recipeId: recipePizza.id,
        retailPrice: d("3.49"),
        holdTimeMinutes: 90,
        prepTimeMinutes: 3,
      },
      {
        itemName: "Taquitos (2)",
        category: FoodserviceCategory.taquitos,
        brand: FoodserviceBrand.store_brand,
        recipeId: null,
        retailPrice: d("2.99"),
        holdTimeMinutes: 90,
        prepTimeMinutes: 2,
      },
    ];
    if (store.hatchEnabled) {
      baseItems.push({
        itemName: "Hatch 8pc Chicken",
        category: FoodserviceCategory.chicken,
        brand: FoodserviceBrand.hatch,
        recipeId: recipeHatch.id,
        retailPrice: d("9.99"),
        holdTimeMinutes: 90,
        prepTimeMinutes: 10,
      });
    }
    await prisma.foodserviceMenuItem.createMany({
      data: baseItems.map((b) => ({
        storeId: store.id,
        itemName: b.itemName,
        category: b.category,
        brand: b.brand,
        recipeId: b.recipeId,
        retailPrice: b.retailPrice,
        holdTimeMinutes: b.holdTimeMinutes,
        prepTimeMinutes: b.prepTimeMinutes,
      })),
    });
  }

  const menuStore1 = await prisma.foodserviceMenuItem.findMany({
    where: { storeId: "store_001" },
    orderBy: { itemName: "asc" },
  });
  const emp = await prisma.user.findFirst({
    where: { email: "emp1@company.com", accountStatus: AccountStatus.active },
  });
  if (emp && menuStore1[0]) {
    const past = new Date();
    past.setDate(past.getDate() - 3);
    await prisma.foodserviceHotCaseEntry.create({
      data: {
        storeId: "store_001",
        menuItemId: menuStore1[0]!.id,
        quantityPlaced: 4,
        placedAt: past,
        expiresAt: new Date(past.getTime() + 60 * 60 * 1000),
        status: FoodserviceHotCaseStatus.sold,
        placedById: emp.id,
        disposedAt: new Date(past.getTime() + 20 * 60 * 1000),
        disposedById: emp.id,
      },
    });
    await prisma.foodserviceWasteLog.create({
      data: {
        storeId: "store_001",
        menuItemId: menuStore1[1]!.id,
        quantity: 2,
        reason: FoodserviceWasteReason.overproduction,
        loggedById: emp.id,
      },
    });
  }

  // --- Fuel: 3 tanks per store ---
  const tankDefs: Array<{ tankNumber: number; grade: FuelGrade }> = [
    { tankNumber: 1, grade: FuelGrade.regular },
    { tankNumber: 2, grade: FuelGrade.midgrade },
    { tankNumber: 3, grade: FuelGrade.premium },
  ];

  for (const store of stores) {
    for (const t of tankDefs) {
      const seed = (store.id + t.tankNumber).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const cap = 12000 + (seed % 4000);
      const vol = Math.floor(cap * (0.35 + (seed % 50) / 100));
      await prisma.fuelData.create({
        data: {
          storeId: store.id,
          tankNumber: t.tankNumber,
          grade: t.grade,
          tankCapacityGallons: d(cap),
          currentVolumeGallons: d(vol),
          lastDeliveryDate: randomPastDateWithinDays(10),
          lastDeliveryVolumeGallons: d(7000 + (seed % 2000)),
          currentRetailPricePerGallon: d((2.89 + (seed % 40) / 100).toFixed(3)),
        },
      });
    }
  }

  // --- Fuel volume snapshots (14 days) for sales trend chart + sample delivery rows ---
  const tanksForTrend = await prisma.fuelData.findMany();
  const seedNow = new Date();
  for (const tank of tanksForTrend) {
    const base = Number(tank.currentVolumeGallons);
    const capN = Number(tank.tankCapacityGallons);
    const drift = 30 + (tank.tankNumber % 4) * 12;
    for (let i = 13; i >= 0; i--) {
      const dayRef = new Date(seedNow);
      dayRef.setDate(dayRef.getDate() - i);
      const ymd = formatLocalYmdFromDate(dayRef);
      const volN = Math.min(capN * 0.97, base + (13 - i) * drift);
      const sd = utcNoonFromYmdSeed(ymd);
      await prisma.fuelDailyVolumeSnapshot.upsert({
        where: { fuelDataId_snapshotDate: { fuelDataId: tank.id, snapshotDate: sd } },
        create: { fuelDataId: tank.id, snapshotDate: sd, volumeGallons: d(volN) },
        update: { volumeGallons: d(volN) },
      });
    }
  }

  for (const store of stores) {
    const logger = await prisma.user.findFirst({
      where: {
        assignedStoreId: store.id,
        accountStatus: AccountStatus.active,
        role: { in: [UserRole.manager, UserRole.employee] },
      },
    });
    if (!logger) continue;
    const stTanks = await prisma.fuelData.findMany({ where: { storeId: store.id }, orderBy: { tankNumber: "asc" } });
    const primary = stTanks[0];
    if (!primary) continue;
    const delDay = new Date(seedNow);
    delDay.setDate(delDay.getDate() - 4);
    await prisma.fuelDelivery.create({
      data: {
        storeId: store.id,
        fuelDataId: primary.id,
        volumeGallons: d(4200),
        deliveryDate: utcNoonFromYmdSeed(formatLocalYmdFromDate(delDay)),
        notes: "Seeded wholesale delivery",
        loggedById: logger.id,
      },
    });
  }

  // --- 100 transactions + line items (last 30 days) ---
  const paymentMethods = [
    PaymentMethod.cash,
    PaymentMethod.credit,
    PaymentMethod.debit,
    PaymentMethod.mobile,
  ];
  const txTypes = [TransactionType.sale, TransactionType.sale, TransactionType.sale, TransactionType.refund, TransactionType.void];

  const cashierByStore = new Map<string, string[]>();
  for (const s of stores) {
    const rows = await prisma.user.findMany({
      where: {
        assignedStoreId: s.id,
        accountStatus: AccountStatus.active,
        role: { in: [UserRole.employee, UserRole.manager] },
      },
      select: { id: true },
    });
    cashierByStore.set(
      s.id,
      rows.map((r) => r.id)
    );
  }

  const inventoryByStore = new Map<string, Array<Inventory & { product: Product }>>();
  for (const s of stores) {
    const invRows = await prisma.inventory.findMany({
      where: { storeId: s.id },
      include: { product: true },
    });
    inventoryByStore.set(s.id, invRows);
  }

  const TAX_RATE = new Prisma.Decimal("0.0825");

  for (let n = 0; n < 100; n++) {
    const storeId = stores[n % stores.length]!.id;
    const cashiers = cashierByStore.get(storeId) ?? [];
    if (cashiers.length === 0) throw new Error(`No cashier for ${storeId}`);
    const employeeId = pick(cashiers);

    const invRows = inventoryByStore.get(storeId) ?? [];
    if (invRows.length === 0) throw new Error("No inventory for store");

    const lineCount = randomInt(1, 4);
    const picked = [...invRows].sort(() => Math.random() - 0.5).slice(0, lineCount);

    let subtotal = new Prisma.Decimal(0);
    const lineData: Array<{
      productId: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
    }> = [];

    for (const row of picked) {
      const qty = randomInt(1, 3);
      const unitPrice = row.product.retailPrice;
      const discountAmount = n % 17 === 0 ? d("0.50") : d("0");
      const linePreDiscount = unitPrice.mul(new Prisma.Decimal(qty));
      const disc =
        discountAmount.comparedTo(linePreDiscount) > 0 ? linePreDiscount : discountAmount;
      const lineTotal = linePreDiscount.sub(disc);
      subtotal = subtotal.add(lineTotal);
      lineData.push({
        productId: row.productId,
        quantity: qty,
        unitPrice,
        lineTotal,
        discountAmount: disc,
      });
    }

    const taxAmount = subtotal.mul(TAX_RATE);
    const total = subtotal.add(taxAmount);
    const txType = pick(txTypes);
    const terminalId = `VF-T${storeId.slice(-1)}-${randomInt(1, 4)}`;
    const ts = randomPastDateWithinDays(30);
    const verifoneReferenceId = `VF-${storeId}-${ts.getTime()}-${n}`;

    await prisma.posTransaction.create({
      data: {
        storeId,
        terminalId,
        type: txType,
        subtotal,
        taxAmount,
        total,
        paymentMethod: pick(paymentMethods),
        verifoneReferenceId,
        employeeId,
        transactionAt: ts,
        lineItems: {
          create: lineData.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
            discountAmount: l.discountAmount,
          })),
        },
      },
    });
  }

  console.log(
    `Seeded ${stores.length} stores, ${users.length} users, ${vendors.length} vendors, ${products.length} products, inventory for all stores, foodservice recipes/menu, fuel tanks, and 100 POS transactions.`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
