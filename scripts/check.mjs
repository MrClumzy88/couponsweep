// Sanity checks for the extension. Run locally with `node scripts/check.mjs`;
// GitHub runs the same thing on every pull request.
//
// Checks: every script parses, the manifest is valid and only points at files
// that exist, ES imports and HTML asset links resolve, release.yml packages all
// runtime files, store ids are unique and covered by manifest.json, the help
// website in docs/ is up to date with stores.js, and nothing that looks like
// personal data (email addresses, long account or card numbers, tokens) has been added.

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

// 1b. Root ES module relative imports and HTML local src/href assets exist.
const rootEntries = readdirSync(root).filter((name) => statSync(join(root, name)).isFile());
for (const f of rootEntries.filter((name) => extname(name) === ".js")) {
  const text = readFileSync(join(root, f), "utf8");
  for (const m of text.matchAll(/\b(?:import|export)\b[^;]*?\bfrom\s*["'](\.[^"']+)["']/g)) {
    if (!existsSync(join(root, m[1]))) fail(`${f} imports missing file ${m[1]}`);
  }
}
for (const f of rootEntries.filter((name) => extname(name) === ".html")) {
  const text = readFileSync(join(root, f), "utf8");
  for (const m of text.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const ref = m[1];
    if (/^(?:https?:|data:|#|mailto:)/i.test(ref)) continue;
    if (!existsSync(join(root, ref))) fail(`${f} references missing file ${ref}`);
  }
}

// 1c. release.yml copies every root .js, .html, and .css runtime file.
const releaseYmlPath = join(root, ".github", "workflows", "release.yml");
if (existsSync(releaseYmlPath)) {
  const releaseYml = readFileSync(releaseYmlPath, "utf8");
  const cpLine = releaseYml.split(/\r?\n/).find((l) => /^\s*cp\s+-r\s+/.test(l)) || "";
  const packaged = new Set(cpLine.trim().split(/\s+/));
  for (const f of rootEntries.filter((name) => /\.(js|html|css)$/.test(name))) {
    if (!packaged.has(f)) fail(`release.yml doesn't package ${f}`);
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

// 3. Store ids are unique, each store's adapter file exists, and manifest covers runnable stores.
const { STORES } = await import(new URL("../stores.js", import.meta.url));
const ids = STORES.map((s) => s.id);
for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) fail(`store id "${id}" is used twice`);
for (const s of STORES) if (!s.comingSoon && !existsSync(join(root, "content", `${s.adapter}.js`))) fail(`store ${s.id} uses missing adapter content/${s.adapter}.js`);
if (manifest) {
  const hostPerms = manifest.host_permissions || [];
  const csMatches = (manifest.content_scripts || []).flatMap((c) => c.matches || []);
  for (const s of STORES.filter((x) => !x.comingSoon)) {
    const prefix = `https://${s.host}/`;
    if (!hostPerms.some((p) => p.startsWith(prefix))) fail(`manifest.json host_permissions missing ${prefix} (for ${s.id})`);
    if (!csMatches.some((p) => p.startsWith(prefix))) fail(`manifest.json content_scripts missing ${prefix} (for ${s.id})`);
  }
}

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
