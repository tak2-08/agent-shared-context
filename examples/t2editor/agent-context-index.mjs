#!/usr/bin/env node
// Path: tools/agent-context-index.mjs
// T2Editor/agent-context/*.md frontmatter → index.json + graph.json 갱신
// 저용량 에이전트가 index.json 1회로 전체를 파악하도록 L1 캐시를 재생성한다.
// 사용: node tools/agent-context-index.mjs [--check]

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../T2Editor/agent-context', import.meta.url).pathname;
const INDEX_PATH = join(ROOT, 'index.json');
const GRAPH_PATH = join(ROOT, 'graph.json');

function parseFrontmatter(src) {
  const m = src.match(/---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!m) return null;
  const fm = {};
  let currentKey = null;
  let inList = false;
  let listKey = null;
  for (const raw of m[1].split('\n')) {
    // skip nested keywords block (indented 2+ spaces, not list item)
    if (/^\s{2,}\S/.test(raw) && !/^\s*-\s+/.test(raw)) continue;
    const line = raw.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    // list item
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
    // reset list tracking
    inList = false;
    listKey = null;
    if (v === '' || v === '[]') {
      // start of list
      if (line.trimEnd().endsWith(':')) {
        // look ahead: if next lines are list, init
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
    currentKey = k;
    // detect that this key expects list on next lines (value empty)
    if (fm[k] && Array.isArray(fm[k]) && fm[k].length === 0) {
      inList = true;
      listKey = k;
    }
  }
  return fm;
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

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
  // derive preview from summary or first body line
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

const shouldCompress = totalChars > 200000 || entries.length > 1000;

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
  _path: 'T2Editor/agent-context/index.json',
  description: 'L1 압축 카탈로그 — 저용량 에이전트가 가장 먼저 읽는 파일. preview 60자 + summary 120자로 본문 Read 없이 관련성 판단.',
  soft_limits: {
    soft_limit_chars: 200000,
    max_entries: 1000,
    should_compress: shouldCompress,
    total_chars: totalChars,
    total_entries: entries.length,
  },
  counts,
  entries,
};

const isCheck = process.argv.includes('--check');
if (isCheck) {
  const cur = JSON.stringify(indexData.entries);
  const nxt = JSON.stringify(nextIndex.entries);
  if (cur !== nxt) {
    console.error('index.json drift detected: run node tools/agent-context-index.mjs to regenerate');
    console.error(`current: ${indexData.entries?.length || 0} entries, next: ${entries.length} entries`);
    process.exit(1);
  } else {
    console.log(`index.json synced: ${entries.length} entries, ${totalChars} chars, should_compress=${shouldCompress}`);
    process.exit(0);
  }
}

writeFileSync(INDEX_PATH, JSON.stringify(nextIndex, null, 2) + '\n', 'utf8');
console.log(`index.json regenerated: ${entries.length} entries, ${totalChars} chars, should_compress=${shouldCompress}`);

// also touch graph.json generated_at
try {
  const graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
  graph.generated_at = new Date().toISOString();
  writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2) + '\n', 'utf8');
  console.log('graph.json timestamp updated');
} catch (e) {
  console.warn('graph.json update skipped:', e.message);
}
