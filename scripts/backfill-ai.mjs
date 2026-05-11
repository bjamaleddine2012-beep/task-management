// One-off backfill: run AI review on any SUBMITTED tasks that don't have a
// verdict yet. Useful right after enabling GEMINI_API_KEY for the first
// time so previously submitted proofs get reviewed without resubmission.
//
// Usage: node --env-file=.env scripts/backfill-ai.mjs

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY not set. Aborting.");
  process.exit(1);
}

const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = client.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
    maxOutputTokens: 1024,
  },
});

const tasks = await prisma.task.findMany({
  where: {
    status: "SUBMITTED",
    aiVerdict: null,
  },
  select: {
    id: true,
    title: true,
    description: true,
    proofImages: { select: { url: true } },
  },
});

console.log(`Found ${tasks.length} tasks needing backfill`);

for (const t of tasks) {
  if (t.proofImages.length === 0) continue;

  console.log(`\n[${t.id}] "${t.title}" — ${t.proofImages.length} photos`);

  const fetched = await Promise.all(
    t.proofImages.slice(0, 4).map(async (img) => {
      const r = await fetch(img.url);
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      return {
        data: buf.toString("base64"),
        mimeType: r.headers.get("content-type") || "image/jpeg",
      };
    }),
  );
  const images = fetched.filter(Boolean);
  if (images.length === 0) continue;

  const prompt =
    `You're helping a workplace admin review a "completed task" submission.\n\n` +
    `Task: ${t.title}\n` +
    (t.description ? `Details: ${t.description}\n` : "") +
    `\nLook at the photo(s). Decide if they plausibly show the task is done.\n\n` +
    `Reply with JSON only, no prose. Schema:\n` +
    `{ "verdict": "match" | "mismatch" | "uncertain", ` +
    `"confidence": 0-100, "reasoning": "one short sentence" }`;

  try {
    const result = await model.generateContent([
      prompt,
      ...images.map((img) => ({
        inlineData: { data: img.data, mimeType: img.mimeType },
      })),
    ]);
    const text = result.response.text();
    const parsed = JSON.parse(
      text.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim(),
    );
    const verdict =
      parsed.verdict === "match" ||
      parsed.verdict === "mismatch" ||
      parsed.verdict === "uncertain"
        ? parsed.verdict
        : "uncertain";
    const confidence = Math.max(
      0,
      Math.min(100, Math.round(Number(parsed.confidence ?? 0))),
    );
    const reasoning = String(parsed.reasoning ?? "").slice(0, 500);

    await prisma.task.update({
      where: { id: t.id },
      data: { aiVerdict: verdict, aiConfidence: confidence, aiReasoning: reasoning },
    });
    console.log(`  → ${verdict} (${confidence}%) — ${reasoning}`);
  } catch (err) {
    console.error(`  ✗ failed:`, err.message);
  }
}

await prisma.$disconnect();
console.log("\nDone.");
