import { PrismaClient, UserRole, AccountStatus } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function hashPassword(plain: string, saltRounds: number) {
  return bcrypt.hash(plain, saltRounds);
}

async function main() {
  const saltRounds = Number(requireEnv("BCRYPT_SALT_ROUNDS"));
  if (!Number.isFinite(saltRounds) || saltRounds < 12) {
    throw new Error("BCRYPT_SALT_ROUNDS must be >= 12");
  }

  const adminEmail = "admin@company.com";
  const adminTempPassword = requireEnv("TEMP_ADMIN_PASSWORD");
  const seedPassword = requireEnv("SEED_USER_PASSWORD");

  const stores = [
    { id: "store_001", name: "Mock Store 1", location: "Austin, TX" },
    { id: "store_002", name: "Mock Store 2", location: "Charlotte, NC" },
    { id: "store_003", name: "Mock Store 3", location: "Denver, CO" },
  ];

  await prisma.loginAttempt.deleteMany();
  await prisma.user.deleteMany();
  await prisma.store.deleteMany();

  await prisma.store.createMany({ data: stores });

  const passwordHashAdmin = await hashPassword(adminTempPassword, saltRounds);
  const passwordHashSeed = await hashPassword(seedPassword, saltRounds);

  // Mix roles across stores: 1 admin + 5 managers + 9 employees = 15 total.
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
      passwordHash: passwordHashAdmin
    },
    // Managers
    { email: "manager1@company.com", firstName: "Mina", lastName: "Khan", role: UserRole.manager, assignedStoreId: "store_001", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "manager2@company.com", firstName: "Diego", lastName: "Silva", role: UserRole.manager, assignedStoreId: "store_002", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "manager3@company.com", firstName: "Ava", lastName: "Chen", role: UserRole.manager, assignedStoreId: "store_003", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "manager4@company.com", firstName: "Noah", lastName: "Johnson", role: UserRole.manager, assignedStoreId: "store_001", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "manager5@company.com", firstName: "Fatima", lastName: "Omar", role: UserRole.manager, assignedStoreId: "store_002", accountStatus: AccountStatus.disabled, passwordHash: passwordHashSeed },

    // Employees (read-only)
    { email: "emp1@company.com", firstName: "Liam", lastName: "Brown", role: UserRole.employee, assignedStoreId: "store_001", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp2@company.com", firstName: "Emma", lastName: "Davis", role: UserRole.employee, assignedStoreId: "store_001", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp3@company.com", firstName: "Olivia", lastName: "Wilson", role: UserRole.employee, assignedStoreId: "store_001", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp4@company.com", firstName: "Ethan", lastName: "Martinez", role: UserRole.employee, assignedStoreId: "store_002", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp5@company.com", firstName: "Sophia", lastName: "Anderson", role: UserRole.employee, assignedStoreId: "store_002", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp6@company.com", firstName: "Mason", lastName: "Taylor", role: UserRole.employee, assignedStoreId: "store_002", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp7@company.com", firstName: "Amelia", lastName: "Thomas", role: UserRole.employee, assignedStoreId: "store_003", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp8@company.com", firstName: "Lucas", lastName: "Moore", role: UserRole.employee, assignedStoreId: "store_003", accountStatus: AccountStatus.active, passwordHash: passwordHashSeed },
    { email: "emp9@company.com", firstName: "Isabella", lastName: "Jackson", role: UserRole.employee, assignedStoreId: "store_003", accountStatus: AccountStatus.disabled, passwordHash: passwordHashSeed }
  ];

  if (users.length !== 15) throw new Error(`Seed user count must be 15, got ${users.length}`);

  // Ensure forcePasswordChange on first login for the default admin account.
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
    }))
  });

  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) throw new Error("Admin seed failed");

  console.log(`Seeded ${stores.length} stores and ${users.length} users.`);
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

