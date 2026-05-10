import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const tasks = await prisma.task.findMany({
  where: { proofSubmittedAt: { not: null } },
  orderBy: { proofSubmittedAt: "desc" },
  select: {
    id: true,
    title: true,
    status: true,
    proofSubmittedAt: true,
    aiVerdict: true,
    aiConfidence: true,
    aiReasoning: true,
    proofImages: { select: { url: true } },
  },
  take: 5,
});

console.log(JSON.stringify(tasks, null, 2));

await prisma.$disconnect();
