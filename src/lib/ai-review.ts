// Optional AI Vision check on a submitted proof image.
//
// Tries providers in this order, using whichever is configured:
//   1. Google Gemini  (GEMINI_API_KEY)  — free tier, no card needed
//   2. Anthropic      (ANTHROPIC_API_KEY) — paid, $5 free credit on signup
//
// Returns a hint the admin sees in the review dialog: match / mismatch /
// uncertain plus a one-line reason. Never auto-decides — the admin still
// approves or rejects.
//
// If neither key is set, the feature is silently disabled.

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type AiVerdict = {
  verdict: "match" | "mismatch" | "uncertain";
  confidence: number; // 0-100
  reasoning: string;
};

export const aiReviewEnabled = () =>
  !!process.env.GEMINI_API_KEY || !!process.env.ANTHROPIC_API_KEY;

export async function reviewProofWithAi(args: {
  taskTitle: string;
  taskDescription?: string | null;
  imageUrls: string[];
}): Promise<AiVerdict | null> {
  if (args.imageUrls.length === 0) return null;

  // Fetch up to 4 images once; both providers consume base64.
  const images = await fetchImagesAsBase64(args.imageUrls.slice(0, 4));
  if (images.length === 0) return null;

  if (process.env.GEMINI_API_KEY) {
    return reviewWithGemini(args, images).catch((err) => {
      console.warn("[ai-review/gemini] failed:", (err as Error).message);
      return null;
    });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return reviewWithAnthropic(args, images).catch((err) => {
      console.warn("[ai-review/anthropic] failed:", (err as Error).message);
      return null;
    });
  }
  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type FetchedImage = { data: string; mediaType: string };

async function fetchImagesAsBase64(
  urls: string[],
): Promise<FetchedImage[]> {
  const results = await Promise.all(
    urls.map(async (u) => {
      try {
        const r = await fetch(u);
        if (!r.ok) return null;
        const buf = Buffer.from(await r.arrayBuffer());
        const ct = r.headers.get("content-type") ?? "image/jpeg";
        return { data: buf.toString("base64"), mediaType: ct };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is FetchedImage => r != null);
}

function buildPrompt(args: {
  taskTitle: string;
  taskDescription?: string | null;
}): string {
  return (
    `You're helping a workplace admin review a "completed task" submission.\n\n` +
    `Task: ${args.taskTitle}\n` +
    (args.taskDescription ? `Details: ${args.taskDescription}\n` : "") +
    `\nLook at the photo(s). Decide if they plausibly show the task is done.\n\n` +
    `Reply with JSON only, no prose. Schema:\n` +
    `{ "verdict": "match" | "mismatch" | "uncertain", ` +
    `"confidence": 0-100, "reasoning": "one short sentence" }`
  );
}

function parseVerdict(raw: string): AiVerdict | null {
  try {
    // Strip markdown code fences if the model wraps the JSON.
    const cleaned = raw
      .replace(/```json\s*/g, "")
      .replace(/```\s*$/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
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
    return { verdict, confidence, reasoning };
  } catch {
    return null;
  }
}

// ─── Provider: Google Gemini (free tier) ───────────────────────────────────

async function reviewWithGemini(
  args: { taskTitle: string; taskDescription?: string | null },
  images: FetchedImage[],
): Promise<AiVerdict | null> {
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = client.getGenerativeModel({
    // gemini-2.5-flash is the current stable vision-capable model on the
    // free tier. (`gemini-2.0-flash-exp` was retired.) The 2.5-series uses
    // hidden "thinking" tokens — give a generous output budget so the
    // actual JSON reply isn't truncated.
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 1024,
    },
  });

  const result = await model.generateContent([
    buildPrompt(args),
    ...images.map((img) => ({
      inlineData: { data: img.data, mimeType: img.mediaType },
    })),
  ]);
  const text = result.response.text();
  return parseVerdict(text);
}

// ─── Provider: Anthropic (paid, $5 free signup credit) ─────────────────────

async function reviewWithAnthropic(
  args: { taskTitle: string; taskDescription?: string | null },
  images: FetchedImage[],
): Promise<AiVerdict | null> {
  const client = new Anthropic();

  const imageBlocks = images.map((img) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.mediaType as
        | "image/jpeg"
        | "image/png"
        | "image/gif"
        | "image/webp",
      data: img.data,
    },
  }));

  const res = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: [...imageBlocks, { type: "text", text: buildPrompt(args) }],
      },
    ],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseVerdict(text);
}
