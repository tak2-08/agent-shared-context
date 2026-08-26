#!/usr/bin/env node
// Path: tools/agent-context-index.mjs
// agent-context/*.md frontmatter → index.json + graph.json 갱신 (universal, config-aware)
// 사용: node tools/agent-context-index.mjs [--check] [--init] [--config <path>] [--dry-run] [--to-sqlite]

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { check: false, init: false, dryRun: false, toSqlite: false, config: null, help: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--check') out.check = true;
    else if (a === '--init') out.init = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--to-sqlite') out.toSqlite = true;
    else if (a === '--config') out.config = args[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function resolveConfig(explicit) {
  const candidates = [
    explicit,
    new URL('../agent-context.config.json', import.meta.url).pathname,
    new URL('../agent-context/agent-context.config.json', import.meta.url).pathname,
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const data = JSON.parse(readFileSync(p, 'utf8'));
        return { path: p, data };
      } catch (e) {
        console.error(`config parse failed at ${p}: ${e.message}`);
        process.exit(1);
      }
    }
  }
  // fallback defaults (universal minimal)
  return {
    path: null,
    data: {
      contextRoot: 'agent-context',
      archiveDir: 'archive',
      privateMirror: null,
      features: {},
      graph: { edges: [] },
      storage: { softLimits: { softLimitChars: 200000, maxEntries: 1000 } },
      schema: { required: ["id","type","title","tags","feature","agent","created","updated","status","summary"] },
    },
  };
}

const ARGS = parseArgs();
if (ARGS.help) {
  console.log(`Usage: agent-context-index.mjs [options]
  (no flag)            regenerate index.json + bump graph.json timestamp
  --config <path>      config file (default: ./agent-context.config.json)
  --init               scaffold features.json + graph.json + schema.json from config
  --check              exit 1 if index/graph/features drift
  --to-sqlite          build FTS5 db at <privateMirror>/search.db (requires storage.backend=sqlite)
  --dry-run            print what would be written, write nothing
  --help               show this help`);
  process.exit(0);
}

const { path: CONFIG_PATH, data: CONFIG } = resolveConfig(ARGS.config);
const CONTEXT_ROOT = CONFIG.contextRoot || 'agent-context';
const ROOT = new URL(`../${CONTEXT_ROOT}`, import.meta.url).pathname;
const INDEX_PATH = join(ROOT, 'index.json');
const GRAPH_PATH = join(ROOT, 'graph.json');
const FEATURES_PATH = join(ROOT, 'features.json');
const SCHEMA_PATH = join(ROOT, 'schema.json');

function parseFrontmatter(src) {
  const m = src.match(/---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!m) return null;
  const fm = {};
  let inList = false;
  let listKey = null;
  for (const raw of m[1].split('\n')) {
    if (/^\s{2,}\S/.test(raw) && !/^\s*-\s+/.test(raw)) continue;
    const line = raw.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s*-\s+/.test(line) && inList && listKey) {
      const val = line.replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, '');
      if (!Array.isArray(fm[listKey])) fm[listKey] = [];
      fm[listKey].push(val);
      continue;
    }
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const k = line.slice(0, colon).trim();
    let v = line.slice(colon + 1).trim();
    inList = false;
    listKey = null;
    if (v === '' || v === '[]') {
      if (line.trimEnd().endsWith(':')) {
        fm[k] = [];
        inList = true;
        listKey = k;
        continue;
      }
      fm[k] = v;
    } else if (v.startsWith('[') && v.endsWith(']')) {
      const inner = v.slice(1, -1).trim();
      if (!inner) fm[k] = [];
      else fm[k] = inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      fm[k] = v.replace(/^["']|["']$/g, '');
    }
    if (fm[k] && Array.isArray(fm[k]) && fm[k].length === 0) {
      inList = true;
      listKey = k;
    }
  }
  return fm;
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// --init: scaffold features/graph/schema from config
if (ARGS.init) {
  const softLimits = CONFIG.storage?.softLimits || { softLimitChars: 200000, maxEntries: 1000 };
  const features = CONFIG.features || {};
  const edges = CONFIG.graph?.edges || [];
  const types = CONFIG.types || ["note","memo","idea","learning","bug","decision","diary","code-history","todo"];
  const featureEnum = Object.keys(features).length ? [...Object.keys(features), "global"] : ["global"];
  const agents = CONFIG.agents?.allow || ["claude","codex","opencode","human","system"];

  // features.json
  const expectedFeatures = {
    version: 1,
    generated_at: new Date().toISOString(),
    _path: `${CONTEXT_ROOT}/features.json`,
    description: "기능 레지스트리 — 각 기능의 파일:라인, 연관 결정, 최근 이슈를 한곳에. graph.json과 함께 L2 탐색용. agent-context.config.json features로부터 생성됨.",
    features,
  };
  // graph.json: edges → depends_on/affects
  const graphNodes = {};
  for (const k of Object.keys(features)) {
    graphNodes[k] = { depends_on: [], affects: [], files: features[k].files || [], decisions: [], learnings: [] };
  }
  for (const [a, b] of edges) {
    if (graphNodes[a] && !graphNodes[a].affects.includes(b)) graphNodes[a].affects.push(b);
    if (graphNodes[b] && !graphNodes[b].depends_on.includes(a)) graphNodes[b].depends_on.push(a);
  }
  const expectedGraph = {
    version: 1,
    generated_at: new Date().toISOString(),
    _path: `${CONTEXT_ROOT}/graph.json`,
    description: "기능 연관 그래프 — depends_on/affects로 영향 범위 추적. agent-context.config.json graph.edges로부터 생성됨.",
    graph: graphNodes,
    edges,
  };
  // schema.json: featureEnum + types
  let schema = {};
  try { schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')); } catch {}
  const expectedSchema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "agent-context frontmatter schema",
    _path: `${CONTEXT_ROOT}/schema.json`,
    description: "모든 *.md frontmatter가 따라야 할 스키마. id/type/title/tags/feature/agent/created/updated/status/summary는 필수.",
    type: "object",
    required: CONFIG.schema?.required || ["id","type","title","tags","feature","agent","created","updated","status","summary"],
    properties: {
      ...(schema.properties || {}),
      type: { type: "string", enum: types },
      feature: { type: "string", enum: featureEnum, description: "graph.json/features.json 키와 연결" },
      agent: { type: "string", enum: agents },
    },
  };
  // keep other properties from existing schema if present
  if (schema.properties) {
    for (const k of ["id","title","tags","scope","created","updated","status","priority","summary","preview","related","affects","cause","fix","lesson","repro","keywords"]) {
      if (schema.properties[k] && !expectedSchema.properties[k]) expectedSchema.properties[k] = schema.properties[k];
    }
  } else {
    // minimal fallback
    expectedSchema.properties = {
      id: { type: "string", pattern: CONFIG.schema?.idPattern || "^[a-z-]+-[0-9]{8}-[a-z0-9]{8}$" },
      type: { type: "string", enum: types },
      title: { type: "string", minLength: 5, maxLength: 80 },
      tags: { type: "array", items: { type: "string", pattern: "^[a-z0-9-]+$" }, minItems: 1, maxItems: 8 },
      feature: { type: "string", enum: featureEnum },
      scope: { type: "string", pattern: "^(global|page|custom:.+)$", default: "global" },
      agent: { type: "string", enum: agents },
      created: { type: "string", format: "date-time" },
      updated: { type: "string", format: "date-time" },
      status: { type: "string", enum: ["open","doing","done","archived","proposed","adopted","rejected","superseded"] },
      priority: { type: "integer", minimum: 1, maximum: 5 },
      summary: { type: "string", maxLength: CONFIG.schema?.maxSummary || 200 },
      preview: { type: "string", maxLength: CONFIG.schema?.maxPreview || 60 },
      related: { type: "array", items: { type: "string" } },
      affects: { type: "array", items: { type: "string" } },
    };
  }

  const toWrite = [
    [FEATURES_PATH, expectedFeatures],
    [GRAPH_PATH, expectedGraph],
    [SCHEMA_PATH, expectedSchema],
  ];
  let drift = [];
  for (const [p, exp] of toWrite) {
    let cur = null;
    try { cur = JSON.parse(readFileSync(p, 'utf8')); } catch {}
    const curStr = cur ? JSON.stringify(cur.features || cur.graph || cur.properties) : null;
    const expStr = JSON.stringify(exp.features || exp.graph || exp.properties);
    if (curStr !== expStr) drift.push(relative(ROOT, p));
  }
  if (ARGS.check) {
    if (drift.length) {
      console.error(`drift: ${drift.join(', ')} — run --init to scaffold`);
      process.exit(1);
    } else {
      console.log(`config synced: ${Object.keys(features).length} features, ${edges.length} edges`);
      process.exit(0);
    }
  }
  if (ARGS.dryRun) {
    console.log(`would scaffold ${drift.length} files: ${drift.join(', ') || 'none (up-to-date)'}`);
    for (const [p, exp] of toWrite) console.log(`→ ${p} (${Object.keys(exp.features || exp.graph || {}).length} keys)`);
    process.exit(0);
  }
  for (const [p, exp] of toWrite) {
    // merge: if exists, keep files field? for now overwrite with config-driven
    writeFileSync(p, JSON.stringify(exp, null, 2) + '\n', 'utf8');
    console.log(`scaffolded ${relative(dirname(ROOT), p)}`);
  }
  if (!drift.length) console.log('already up-to-date');
  // continue to index regeneration after scaffold
}

// index regeneration
const files = walk(ROOT);
const entries = [];
let totalChars = 0;

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const fm = parseFrontmatter(src);
  if (!fm || !fm.id) continue;
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  const fmMatch = src.match(/---\s*\n[\s\S]*?\n---\s*\n/);
  const body = fmMatch ? src.slice(fmMatch.index + fmMatch[0].length) : src;
  const chars = src.length;
  totalChars += chars;
  const previewSrc = fm.summary || body.split('\n').find((l) => l.trim()) || '';
  const preview = previewSrc.slice(0, 60);
  entries.push({
    id: String(fm.id || ''),
    type: String(fm.type || ''),
    title: String(fm.title || '').slice(0, 80),
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    feature: String(fm.feature || 'global'),
    scope: String(fm.scope || 'global'),
    agent: String(fm.agent || 'system'),
    created: String(fm.created || ''),
    updated: String(fm.updated || fm.created || ''),
    status: String(fm.status || 'open'),
    priority: Number(fm.priority || 3),
    summary: String(fm.summary || '').slice(0, 120),
    preview,
    path: rel,
    related: Array.isArray(fm.related) ? fm.related : [],
    affects: Array.isArray(fm.affects) ? fm.affects : [],
    chars,
  });
}

entries.sort((a, b) => {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return String(b.updated).localeCompare(String(a.updated));
});

const counts = {};
for (const e of entries) counts[e.type] = (counts[e.type] || 0) + 1;
counts.total = entries.length;

const softLimitsCfg = CONFIG.storage?.softLimits || { softLimitChars: 200000, maxEntries: 1000 };
const softLimitChars = softLimitsCfg.softLimitChars || 200000;
const maxEntries = softLimitsCfg.maxEntries || 1000;
const shouldCompress = totalChars > softLimitChars || entries.length > maxEntries;

let indexData;
try {
  indexData = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
} catch {
  indexData = { version: 1 };
}

const nextIndex = {
  version: 1,
  generated_at: new Date().toISOString(),
  generated_by: 'agent-context-index.mjs',
  _path: `${CONTEXT_ROOT}/index.json`,
  description: 'L1 압축 카탈로그 — 저용량 에이전트가 가장 먼저 읽는 파일. preview 60자 + summary 120자로 본문 Read 없이 관련성 판단.',
  soft_limits: {
    soft_limit_chars: softLimitChars,
    max_entries: maxEntries,
    should_compress: shouldCompress,
    total_chars: totalChars,
    total_entries: entries.length,
  },
  counts,
  entries,
};

if (ARGS.check && !ARGS.init) {
  const cur = JSON.stringify(indexData.entries);
  const nxt = JSON.stringify(nextIndex.entries);
  if (cur !== nxt) {
    console.error('index.json drift detected: run node tools/agent-context-index.mjs to regenerate');
    console.error(`current: ${indexData.entries?.length || 0} entries, next: ${entries.length} entries`);
    process.exit(1);
  } else {
    console.log(`index.json synced: ${entries.length} entries, ${totalChars} chars, should_compress=${shouldCompress}`);
    // also check graph timestamp not needed
    if (ARGS.toSqlite) console.log('--to-sqlite: not implemented in check mode');
    process.exit(0);
  }
}

if (ARGS.dryRun && !ARGS.init) {
  console.log(`would regenerate index.json: ${entries.length} entries, ${totalChars} chars`);
  process.exit(0);
}

if (ARGS.toSqlite) {
  const privateMirror = CONFIG.privateMirror;
  if (!privateMirror) {
    console.error('--to-sqlite requires config.privateMirror to be set');
    process.exit(1);
  }
  if (CONFIG.storage?.backend !== 'sqlite') {
    console.warn(`storage.backend is ${CONFIG.storage?.backend}, but --to-sqlite forced`);
  }
  // minimal sqlite generation would require better-sqlite3; here we just stub
  console.log(`--to-sqlite: would build FTS5 db at ${privateMirror}/search.db with ${entries.length} entries (requires better-sqlite3)`);
  // TODO: implement actual FTS5 creation when dependency available
}

writeFileSync(INDEX_PATH, JSON.stringify(nextIndex, null, 2) + '\n', 'utf8');
console.log(`index.json regenerated: ${entries.length} entries, ${totalChars} chars, should_compress=${shouldCompress}`);

// bump graph.json timestamp
try {
  const graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
  graph.generated_at = new Date().toISOString();
  writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2) + '\n', 'utf8');
  console.log('graph.json timestamp updated');
} catch (e) {
  console.warn('graph.json update skipped:', e.message);
}
