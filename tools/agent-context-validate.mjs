#!/usr/bin/env node
// Path: tools/agent-context-validate.mjs
// frontmatter lint — agent-context.config.json schema + required 10 검증
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function resolveConfig(explicit) {
  const candidates = [
    explicit,
    new URL('../agent-context.config.json', import.meta.url).pathname,
    new URL('../agent-context/agent-context.config.json', import.meta.url).pathname,
  ].filter(Boolean);
  for (const p of candidates) if (existsSync(p)) return JSON.parse(readFileSync(p,'utf8'));
  return { contextRoot: 'agent-context', features: {}, types: ["note","memo","idea","learning","bug","decision","diary","code-history","todo"], agents: { allow: ["claude","codex","opencode","human","system"] } };
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

for (const f of files) {
  if (f.endsWith('README.md')) continue;
  const src = readFileSync(f,'utf8');
  const fm = parseFrontmatter(src);
  if (!fm) continue;
  if (!fm.id) continue;
  for (const r of required) {
    if (!(r in fm) || String(fm[r]).trim()==='' ) { console.error(`FAIL ${f}: missing required '${r}'`); errors++; }
  }
  if (fm.id && !new RegExp(schema.properties?.id?.pattern || "^[a-z-]+-[0-9]{8}-[a-z0-9]{8}$").test(fm.id)) {
    console.error(`FAIL ${f}: id pattern mismatch '${fm.id}'`); errors++;
  }
  if (fm.type && schema.properties?.type?.enum && !schema.properties.type.enum.includes(fm.type)) {
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
