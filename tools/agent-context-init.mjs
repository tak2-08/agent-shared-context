#!/usr/bin/env node
// Path: tools/agent-context-init.mjs
// npx entry: interactive scaffold when agent-context/ does not exist
// Issue #3 fix: scaffold into process.cwd() (or --target), NEVER the script's
// install location. This makes `npx agent-shared-context init` write into the
// user's actual project instead of the npx cache / source clone.
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i+1] : null;
}
const yes = args.includes('--yes') || args.includes('-y');
const force = args.includes('--force');
const projectName = getArg('--project') || getArg('--name');
const featuresArg = getArg('--features');
// Issue #3 fix: default target is process.cwd(), overridable via --target
const ROOT = resolve(getArg('--target') || process.cwd());
const contextRoot = 'agent-context';

async function prompt(q, def) {
  if (yes) return def;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return await new Promise(res => rl.question(`${q} [${def}]: `, ans => { rl.close(); res(ans.trim() || def); }));
}

console.log(`target: ${ROOT}`);

if (existsSync(join(ROOT, contextRoot)) && !force) {
  // if already exists, just run --init against it
  console.log(`${contextRoot}/ already exists here — running --init (use --force to rescaffold)`);
  const { spawnSync } = await import('node:child_process');
  const self = fileURLToSelf();
  const r = spawnSync(process.execPath, [self, '--init', ...(getArg('--config') ? ['--config', getArg('--config')] : [])], { stdio: 'inherit', cwd: ROOT });
  process.exit(r.status ?? 0);
}

function fileURLToSelf() {
  // resolve this script's own path for spawning sibling tools; sibling index.mjs
  // is cwd-first so spawning by absolute path is safe.
  return new URL(import.meta.url).pathname;
}

// scaffold
const name = projectName || await prompt('Project name (kebab-case)', 'my-project');
const displayName = await prompt('Display name', name);
const featsStr = featuresArg || await prompt('Features (comma-separated)', 'auth,api,ui');
const featuresList = featsStr.split(',').map(s=>s.trim()).filter(Boolean);

// Issue #10 fix: use the repo's own agent-context.config.json as the scaffold
// template (single source of truth) so new fields (search.synonyms, hierarchy,
// live, newer types, …) automatically reach scaffolded projects instead of
// drifting behind this file's hardcoded object. Falls back to a hardcoded
// minimal config only when the sibling file is missing (e.g. trimmed package).
function loadTemplateConfig() {
  const p = new URL('../agent-context.config.json', import.meta.url).pathname;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {
      $schema: "./docs/config.schema.json",
      version: 1,
      project: {},
      contextRoot,
      archiveDir: "archive",
      privateMirror: null,
      features: {},
      graph: { edges: [] },
      types: ["note","memo","idea","learning","bug","decision","diary","code-history","todo","issue","work-history","overall-flow","handoff"],
      typesFluid: true,
      schema: { required: ["id","type","title","tags","feature","agent","created","updated","status","summary"], featureEnum: "auto", idPattern: "^[a-z-]+-[0-9]{8}-[a-z0-9]{8}$", maxSummary: 200, maxPreview: 60 },
      storage: { backend: "json", softLimits: { softLimitChars: 200000, maxEntries: 1000, archiveAfterDays: 90 } },
      lint: { onIndexRegenerate: true, forbidWriteOverwrite: true, requiredKeywords: false },
      agents: { allow: ["claude","codex","opencode","human","system"], default: "system" },
      i18n: { locales: ["ko","en"], defaultLocale: "en" },
      compliance: { law: false, cssContract: false },
    };
  }
}

const config = loadTemplateConfig();
config.version = 1;
config.project = { name, displayName, prefix: name.slice(0,2), description: `${displayName} — agent-context enabled` };
config.contextRoot = contextRoot;
config.privateMirror = null;
config.features = Object.fromEntries(featuresList.map(f=> [f, { label: f[0].toUpperCase()+f.slice(1), files: [`src/${f}/index.ts:1`], description: `${f} feature` }]));
config.graph = { edges: featuresList.length>=2 ? [[featuresList[1], featuresList[0]]] : [] };

const configPath = join(ROOT, 'agent-context.config.json');
if (!existsSync(configPath)) {
  writeFileSync(configPath, JSON.stringify(config, null, 2)+'\n','utf8');
  console.log(`created ${configPath}`);
} else {
  console.log(`exists ${configPath} — skipped (use --force to overwrite)`);
}

// ensure directories
for (const d of ["notes","learnings","bugs","decisions","ideas","diary","todos","code-history","archive"]) {
  mkdirSync(join(ROOT, contextRoot, d), { recursive: true });
  const keep = join(ROOT, contextRoot, d, '.gitkeep');
  if (!existsSync(keep)) writeFileSync(keep,'','utf8');
}

console.log(`scaffolded ${join(ROOT, contextRoot)}/ with ${featuresList.length} features`);

// run --init to generate features/graph/schema — sibling tool, but cwd-first
// resolution means it writes into ROOT (the user's project).
const { spawnSync } = await import('node:child_process');
const r = spawnSync(process.execPath, [fileURLToSelf().replace('agent-context-init.mjs','agent-context-index.mjs'), '--init'], { stdio: 'inherit', cwd: ROOT });
process.exit(r.status ?? 0);
