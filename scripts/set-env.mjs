// One-off helper: set a Vercel project env var via the REST API.
// Use this when `vercel env add` interactivity isn't available (e.g.
// when the CLI's --value flag stores empty strings — known bug).
//
// Usage:  node scripts/set-env.mjs ADMIN_EMAIL bjamaleddine2012@gmail.com

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [, , key, value] = process.argv;
if (!key || !value) {
  console.error("Usage: node scripts/set-env.mjs <KEY> <VALUE>");
  process.exit(1);
}

const authPath = join(
  homedir(),
  "AppData",
  "Roaming",
  "com.vercel.cli",
  "Data",
  "auth.json",
);
// .vercel/project.json sits in the repo root, not necessarily cwd.
// Walk up until we find it.
function findProjectFile(start) {
  let dir = start;
  while (true) {
    const candidate = join(dir, ".vercel", "project.json");
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      const parent = join(dir, "..");
      if (parent === dir) {
        throw new Error("Could not find .vercel/project.json walking up from " + start);
      }
      dir = parent;
    }
  }
}
const projectPath = findProjectFile(process.cwd());

const token = JSON.parse(readFileSync(authPath, "utf8")).token;
const projectId = JSON.parse(readFileSync(projectPath, "utf8")).projectId;

async function main() {
  // Delete any existing copies first so we don't get a 409 conflict on
  // create. We have to look them up via list since the IDs aren't
  // stable, and one logical key can have multiple rows (one per env).
  const listRes = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env?decrypt=false`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const list = await listRes.json();
  const existing = (list.envs ?? []).filter((e) => e.key === key);
  for (const row of existing) {
    const del = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env/${row.id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!del.ok) {
      const t = await del.text();
      throw new Error(`Delete ${row.id} failed: ${del.status} ${t}`);
    }
    console.log(`Deleted existing ${key} (${row.id}, ${row.target})`);
  }

  const createRes = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key,
        value,
        type: "encrypted",
        target: ["production", "preview", "development"],
      }),
    },
  );
  const out = await createRes.json();
  if (!createRes.ok) {
    throw new Error(`Create failed: ${createRes.status} ${JSON.stringify(out)}`);
  }
  console.log(`Set ${key} = ${value.length > 32 ? value.slice(0, 8) + "…" : value}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
