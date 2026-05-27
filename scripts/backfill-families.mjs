// One-time backfill for the multi-tenancy migration.
//
// Before this script:
//   - Family / FamilyMember / FamilyInvite tables exist (empty)
//   - Every owned entity (Task, TaskTemplate, ShoppingItem,
//     AllowanceEntry) has a nullable `familyId`
//   - User.activeFamilyId is nullable
//
// After this script:
//   - One default family is created
//   - All existing users are members of it (User.role=ADMIN → FamilyRole=ADMIN,
//     User.role=USER → FamilyRole=MEMBER)
//   - User.activeFamilyId is set to that family for everyone
//   - Every Task / Template / ShoppingItem / AllowanceEntry has familyId set
//
// Safe to re-run: it skips work that's already done.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FAMILY_NAME = process.env.DEFAULT_FAMILY_NAME ?? "My Family";

async function main() {
  // 1. Find or create the default family. Use the oldest admin's name
  //    if available so the placeholder family has identity.
  const firstAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true },
  });

  // If there's no admin at all (fresh DB), nothing to backfill.
  if (!firstAdmin) {
    console.log("No users yet — nothing to backfill.");
    return;
  }

  const defaultName = firstAdmin.name
    ? `${firstAdmin.name.split(" ")[0]}'s family`
    : FAMILY_NAME;

  let family = await prisma.family.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!family) {
    family = await prisma.family.create({ data: { name: defaultName } });
    console.log(`✓ Created default family "${family.name}" (${family.id})`);
  } else {
    console.log(`Using existing family "${family.name}" (${family.id})`);
  }

  // 2. Membership: ensure every existing user has a FamilyMember row.
  const users = await prisma.user.findMany({
    select: { id: true, role: true, activeFamilyId: true },
  });

  let created = 0;
  for (const u of users) {
    const existing = await prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId: family.id, userId: u.id } },
    });
    if (!existing) {
      await prisma.familyMember.create({
        data: {
          familyId: family.id,
          userId: u.id,
          role: u.role === "ADMIN" ? "ADMIN" : "MEMBER",
        },
      });
      created++;
    }
    if (!u.activeFamilyId) {
      await prisma.user.update({
        where: { id: u.id },
        data: { activeFamilyId: family.id },
      });
    }
  }
  console.log(`✓ ${created} new FamilyMember rows · activeFamilyId set on all`);

  // 3. Backfill familyId on every owned entity in parallel batches.
  const [tasks, templates, shop, allow] = await Promise.all([
    prisma.task.updateMany({
      where: { familyId: null },
      data: { familyId: family.id },
    }),
    prisma.taskTemplate.updateMany({
      where: { familyId: null },
      data: { familyId: family.id },
    }),
    prisma.shoppingItem.updateMany({
      where: { familyId: null },
      data: { familyId: family.id },
    }),
    prisma.allowanceEntry.updateMany({
      where: { familyId: null },
      data: { familyId: family.id },
    }),
  ]);
  console.log(
    `✓ Backfilled · ${tasks.count} tasks · ${templates.count} templates · ${shop.count} shopping · ${allow.count} allowance`,
  );

  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
