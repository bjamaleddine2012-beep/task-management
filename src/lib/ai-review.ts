// Claude Vision check on a submitted proof image.
//
// This runs server-side after a user submits proof (best-effort — we don't
// block the user if it fails). It produces a hint the admin sees in the
// review dialog: "match" / "mismatch" / "uncertain" plus a one-line reason.
// Final approve/reject is still up to a human.
//
// Skipped entirely if ANTHROPIC_API_KEY isn't set — keeps the feature opt-in.

import Anthropic from "@anthropic-ai/sdk";

export type AiVerdict = {
  verdict: "match" | "mismatch" | "uncertain";
  confidence: number; // 0-100
  reasoning: string;
};

export const aiReviewEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export async function reviewProofWithAi(args: {
  taskTitle: string;
  taskDescription?: string | null;
  imageUrls: string[];
}): Promise<AiVerdict | null> {
  if (!aiReviewEnabled()) return null;
  if (args.imageUrls.length === 0) return null;

  const client = new Anthropic();

  // Bound tokens by capping at 4 images. Pinned SDK doesn't support URL
  // image sources, so we fetch each photo and pass base64.
  const fetched = await Promise.all(
    args.imageUrls.slice(0, 4).map(async (u) => {
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
  const imageBlocks = fetched
    .filter((f): f is { data: string; mediaType: string } => f != null)
    .map((f) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: f.mediaType as
          | "image/jpeg"
          | "image/png"
          | "image/gif"
          | "image/webp",
        data: f.data,
      },
    }));
  if (imageBlocks.length === 0) return null;

  const prompt =
    `You're helping a workplace admin review a "completed task" submission.\n\n` +
    `Task: ${args.taskTitle}\n` +
    (args.taskDescription
      ? `Details: ${args.taskDescription}\n`
      : "") +
    `\nLook at the photo(s). Decide if they plausibly show the task is done.\n\n` +
    `Reply with JSON only, no prose. Schema:\n` +
    `{ "verdict": "match" | "mismatch" | "uncertain", ` +
    `"confidence": 0-100, "reasoning": "one short sentence" }`;

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    // Strip code fences if the model wraps JSON in ```json ... ```.
    const cleaned = text
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
  } catch (err) {
    console.warn("[ai-review] failed:", (err as Error).message);
    return null;
  }
}
