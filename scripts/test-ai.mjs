// Run the same AI review pipeline locally against the user's actual submission.
// Reads GEMINI_API_KEY from .env. If it works here but not on Vercel,
// the issue is platform-specific (timeout, after() not firing, etc.).
import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

const url =
  "https://a2so5xag0qz1ioxx.public.blob.vercel-storage.com/task-proofs/cmozv3og80001l904fxjviv0v/1778422976319-1778422968322-8dgtxg-y3w2N9tlVfmOH4le3ZODH0sDejI8Tw.png";

console.log("[1] Fetching image…");
const t0 = Date.now();
const r = await fetch(url);
console.log(`    ${r.status} in ${Date.now() - t0}ms, ${r.headers.get("content-type")}`);
if (!r.ok) {
  console.error("Image fetch failed");
  process.exit(1);
}
const buf = Buffer.from(await r.arrayBuffer());
console.log(`    ${buf.length} bytes`);

console.log("[2] Calling Gemini…");
console.log(`    GEMINI_API_KEY set: ${!!process.env.GEMINI_API_KEY}`);
const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = client.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
    maxOutputTokens: 1024,
  },
});

const prompt =
  `You're helping a workplace admin review a "completed task" submission.\n\n` +
  `Task: CLean your room\n` +
  `\nLook at the photo(s). Decide if they plausibly show the task is done.\n\n` +
  `Reply with JSON only, no prose. Schema:\n` +
  `{ "verdict": "match" | "mismatch" | "uncertain", ` +
  `"confidence": 0-100, "reasoning": "one short sentence" }`;

const t1 = Date.now();
try {
  const result = await model.generateContent([
    prompt,
    { inlineData: { data: buf.toString("base64"), mimeType: "image/png" } },
  ]);
  const text = result.response.text();
  console.log(`    Got response in ${Date.now() - t1}ms`);
  console.log("    Raw:", text);
  const parsed = JSON.parse(
    text
      .replace(/```json\s*/g, "")
      .replace(/```\s*$/g, "")
      .trim(),
  );
  console.log("[3] Parsed verdict:", parsed);
} catch (err) {
  console.error(`    Failed in ${Date.now() - t1}ms:`, err.message);
  console.error("    Stack:", err.stack);
}
