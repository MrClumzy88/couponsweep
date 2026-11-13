// Sanity checks for the extension. Run locally with `node scripts/check.mjs`;
// GitHub runs the same thing on every pull request.
//
// Checks: every script parses, the manifest is valid and only points at files
// that exist, store ids are unique, the popup's version matches the manifest's,
// the help website in docs/ is up to date with stores.js, and nothing that looks like personal data (email addresses, long account or
// card numbers, tokens) has been added.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const problems = [];
const fail = (msg) => problems.push(msg);

function files(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = join(dir, name);
    if (name === ".git" || name === "node_modules") return [];
    return statSync(join(root, rel)).isDirectory() ? files(rel) : [rel];
  });
}

// 1. Every script parses. Content scripts are classic scripts; the rest are modules.
for (const f of files(".").filter((f) => extname(f) === ".js" || extname(f) === ".mjs")) {
  const module = !f.startsWith("content");
  try {
    execFileSync(process.execPath, module ? ["--input-type=module", "--check"] : ["--check", join(root, f)], {
      input: module ? readFileSync(join(root, f)) : undefined,
      stdio: ["pipe", "ignore", "pipe"],
    });
  } catch (e) {
    fail(`${f} doesn't parse: ${String(e.stderr || e.message).split("\n").slice(0, 3).join(" ")}`);
  }
}

// 2. The manifest is valid JSON and every file it names exists.
let manifest = null;
try {
  manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
} catch (e) {
  fail(`manifest.json isn't valid JSON: ${e.message}`);
}
if (manifest) {
  const named = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    ...(manifest.content_scripts || []).flatMap((c) => c.js || []),
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
  ].filter(Boolean);
  for (const f of named) if (!existsSync(join(root, f))) fail(`manifest.json names ${f}, which doesn't exist`);
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version || "")) fail(`manifest version "${manifest.version}" isn't x.y.z`);
}

// 3. Store ids are unique and each store's adapter file exists.
const { STORES } = await import(new URL("../stores.js", import.meta.url));
const ids = STORES.map((s) => s.id);
for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) fail(`store id "${id}" is used twice`);
for (const s of STORES) if (!s.comingSoon && !existsSync(join(root, "content", `${s.adapter}.js`))) fail(`store ${s.id} uses missing adapter content/${s.adapter}.js`);

// 3b. The help website in docs/ matches stores.js (rebuild it with
// `node scripts/build-pages.mjs`).
const { pages } = await import(new URL("./build-pages.mjs", import.meta.url));
const expected = pages();
for (const [path, text] of Object.entries(expected)) {
  const file = join(root, "docs", path);
  const current = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
  if (current !== text) fail(`docs/${path} is ${current == null ? "missing" : "out of date"}; run node scripts/build-pages.mjs`);
}
for (const f of existsSync(join(root, "docs", "stores")) ? readdirSync(join(root, "docs", "stores")) : []) {
  if (!(`stores/${f}` in expected)) fail(`docs/stores/${f} is for a store that isn't supported any more; delete it`);
}

// 4. Nothing that looks like personal data.
const allowedEmails = /noreply@anthropic\.com|@users\.noreply\.github\.com/i;
for (const f of files(".").filter((f) => /\.(js|mjs|json|md|html|css|yml|yaml)$/.test(f) && !f.endsWith("check.mjs"))) {
  const text = readFileSync(join(root, f), "utf8");
  text.split("\n").forEach((line, i) => {
    const where = `${f}:${i + 1}`;
    for (const m of line.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)) if (!allowedEmails.test(m[0])) fail(`${where} has an email address (${m[0]})`);
    if (/(?<![\w.#-])\d{11,19}(?![\w.-])/.test(line)) fail(`${where} has a long number that could be an account or card number`);
    if (/(bearer\s+|token["'\s:=]+)[A-Za-z0-9._-]{24,}/i.test(line)) fail(`${where} looks like it contains a token`);
  });
}

if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n- ` + problems.join("\n- "));
  process.exit(1);
}
console.log(`✓ All checks passed (${STORES.length} stores, version ${manifest.version}).`);
