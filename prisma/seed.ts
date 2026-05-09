// Seed: create the first admin user from ADMIN_EMAIL + ADMIN_PASSWORD
// (or sensible defaults). Idempotent — safe to re-run.
//
// Usage:  npx tsx prisma/seed.ts
//
// Pass overrides via env:
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret npx tsx prisma/seed.ts

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
  const name = process.env.ADMIN_NAME ?? "Admin";

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: Role.ADMIN, passwordHash, name },
    create: {
      email,
      name,
      passwordHash,
      role: Role.ADMIN,
    },
  });

  console.log("─".repeat(60));
  console.log("Seeded admin user:");
  console.log(`  email:    ${user.email}`);
  console.log(`  password: ${password}`);
  console.log(`  role:     ${user.role}`);
  console.log("─".repeat(60));
  console.log("Sign in at /login with the email + password above.");
  console.log("Change the password from /admin/users → Reset password.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
