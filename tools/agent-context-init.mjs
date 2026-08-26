#!/usr/bin/env node
// Path: tools/agent-context-init.mjs
// npx entry: interactive scaffold when agent-context/ does not exist
import { existsSync, mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i+1] : null;
}
const yes = args.includes('--yes') || args.includes('-y');
const projectName = getArg('--project') || getArg('--name');
const featuresArg = getArg('--features');

async function prompt(q, def) {
  if (yes) return def;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return await new Promise(res => rl.question(`${q} [${def}]: `, ans => { rl.close(); res(ans.trim() || def); }));
}

const ROOT = new URL('..', import.meta.url).pathname;
const contextRoot = 'agent-context';

if (existsSync(join(ROOT, contextRoot)) && !args.includes('--force')) {
  // if already exists, just run --init
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [join(ROOT, 'tools/agent-context-index.mjs'), '--init', ... (getArg('--config') ? ['--config', getArg('--config')] : [])], { stdio: 'inherit' });
  process.exit(r.status ?? 0);
}

// scaffold
const name = projectName || await prompt('Project name (kebab-case)', 'my-project');
const displayName = await prompt('Display name', name);
const featsStr = featuresArg || await prompt('Features (comma-separated)', 'auth,api,ui');
const featuresList = featsStr.split(',').map(s=>s.trim()).filter(Boolean);

const config = {
  $schema: "./docs/config.schema.json",
  version: 1,
  project: { name, displayName, prefix: name.slice(0,2), description: `${displayName} — agent-context enabled` },
  contextRoot,
  archiveDir: "archive",
  privateMirror: null,
  features: Object.fromEntries(featuresList.map(f=> [f, { label: f[0].toUpperCase()+f.slice(1), files: [`src/${f}/index.ts:1`], description: `${f} feature` }])),
  graph: { edges: featuresList.length>=2 ? [[featuresList[1], featuresList[0]]] : [] },
  types: ["note","memo","idea","learning","bug","decision","diary","code-history","todo"],
  schema: { required: ["id","type","title","tags","feature","agent","created","updated","status","summary"], featureEnum: "auto", idPattern: "^[a-z-]+-[0-9]{8}-[a-z0-9]{8}$", maxSummary: 200, maxPreview: 60 },
  storage: { backend: "json", softLimits: { softLimitChars: 200000, maxEntries: 1000, archiveAfterDays: 90 } },
  lint: { onIndexRegenerate: true, forbidWriteOverwrite: true, requiredKeywords: false },
  agents: { allow: ["claude","codex","opencode","human","system"], default: "system" },
  i18n: { locales: ["ko","en"], defaultLocale: "en" },
  compliance: { law: false, cssContract: false },
};

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

console.log(`scaffolded ${contextRoot}/ with ${featuresList.length} features`);

// run --init to generate features/graph/schema
const { spawnSync } = await import('node:child_process');
const r = spawnSync(process.execPath, [join(ROOT, 'tools/agent-context-index.mjs'), '--init'], { stdio: 'inherit' });
process.exit(r.status ?? 0);
