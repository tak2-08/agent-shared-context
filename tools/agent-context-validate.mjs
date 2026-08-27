#!/usr/bin/env node
// Path: tools/agent-context-validate.mjs
// frontmatter lint — agent-context.config.json schema + required 10 검증
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

function resolveConfig(explicit) {
  const candidates = [
    explicit,
    new URL('../agent-context.config.json', import.meta.url).pathname,
    new URL('../agent-context/agent-context.config.json', import.meta.url).pathname,
  ].filter(Boolean);
  for (const p of candidates) if (existsSync(p)) return JSON.parse(readFileSync(p,'utf8'));
  return { contextRoot: 'agent-context', features: {}, types: ["note","memo","idea","learning","bug","decision","diary","code-history","todo","issue","work-history","overall-flow","handoff"], agents: { allow: ["claude","codex","opencode","human","system"] } };
}

const configArgIndex = process.argv.indexOf('--config');
const CONFIG = resolveConfig(configArgIndex !== -1 ? process.argv[configArgIndex+1] : null);
// Issue #3 fix: cwd-first — operate on the user's project, fall back to script-relative only inside the source repo
const ROOT = (existsSync(join(process.cwd(), 'agent-context.config.json')) || existsSync(join(process.cwd(), CONFIG.contextRoot || 'agent-context')))
  ? join(process.cwd(), CONFIG.contextRoot || 'agent-context')
  : new URL(`../${CONFIG.contextRoot || 'agent-context'}`, import.meta.url).pathname;
const SCHEMA_PATH = join(ROOT, 'schema.json');

let schema;
try { schema = JSON.parse(readFileSync(SCHEMA_PATH,'utf8')); } catch { console.error(`schema.json not found at ${SCHEMA_PATH}`); process.exit(1); }

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
    inList = false; listKey = null;
    if (v === '' || v === '[]') {
      if (line.trimEnd().endsWith(':')) { fm[k]=[]; inList=true; listKey=k; continue; }
      fm[k]=v;
    } else if (v.startsWith('[') && v.endsWith(']')) {
      const inner = v.slice(1,-1).trim();
      fm[k]= inner ? inner.split(',').map(s=>s.trim().replace(/^["']|["']$/g,'')).filter(Boolean) : [];
    } else fm[k]=v.replace(/^["']|["']$/g,'');
    if (fm[k] && Array.isArray(fm[k]) && fm[k].length===0){ inList=true; listKey=k; }
  }
  return fm;
}

function walk(dir, out=[]) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir,{withFileTypes:true})) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir,e.name);
    if (e.isDirectory()) walk(full,out);
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
let errors = 0;
const required = schema.required || ["id","type","title","tags","feature","agent","created","updated","status","summary"];
// Issue #10 fix: CURRENT.md is a generated pointer file without frontmatter — exempt
// from the no-frontmatter check. README.md already skipped.
const EXEMPT_NO_FM = new Set(['CURRENT.md','README.md']);

for (const f of files) {
  if (f.endsWith('README.md')) continue;
  const src = readFileSync(f,'utf8');
  const fm = parseFrontmatter(src);
  // Issue #10 fix: files without frontmatter are not valid entries — FAIL (except
  // CURRENT.md pointer). Previously silently passed, causing validator/indexer
  // count mismatch.
  if (!fm) {
    if (!EXEMPT_NO_FM.has(basename(f))) {
      console.error(`FAIL ${f}: no frontmatter`);
      errors++;
    }
    continue;
  }
  // Issue #10 fix: removed `if (!fm.id) continue;` — missing id now caught by
  // required-field check below (id is in required[]).
  for (const r of required) {
    if (!(r in fm) || String(fm[r]).trim()==='' ) { console.error(`FAIL ${f}: missing required '${r}'`); errors++; }
  }
  if (fm.id && !new RegExp(schema.properties?.id?.pattern || "^[a-z-]+-[0-9]{8}-[a-z0-9]{8}$").test(fm.id)) {
    console.error(`FAIL ${f}: id pattern mismatch '${fm.id}'`); errors++;
  }
  // typesFluid=true (기본)면 유동 타입 허용 — 구버전 scaffold의 stale enum도 통과시킴
  const typeEnum = schema.properties?.type?.enum;
  if (fm.type && CONFIG.typesFluid === true) {
    if (!/^[a-z0-9-]+$/.test(fm.type)) { console.error(`FAIL ${f}: fluid type pattern mismatch '${fm.type}'`); errors++; }
  } else if (fm.type && typeEnum && !typeEnum.includes(fm.type)) {
    console.error(`FAIL ${f}: type '${fm.type}' not in enum`); errors++;
  }
  if (fm.feature && schema.properties?.feature?.enum && !schema.properties.feature.enum.includes(fm.feature)) {
    console.error(`FAIL ${f}: feature '${fm.feature}' not in enum ${schema.properties.feature.enum.join(',')}`); errors++;
  }
  if (fm.priority && (Number(fm.priority) < 1 || Number(fm.priority) > 5)) {
    console.error(`FAIL ${f}: priority out of range`); errors++;
  }
}

if (errors) {
  console.error(`\nvalidate: ${errors} errors in ${files.length} files`);
  process.exit(1);
} else {
  console.log(`validate: ok ${files.length} files`);
}
