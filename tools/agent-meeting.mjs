#!/usr/bin/env node
// Path: tools/agent-meeting.mjs
// Meeting room for agent-shared-context — corporate-style meetings with minutes.
// Supports: discussion, presentation, rebuttal, decision, standup, retrospective, planning, review.
// Minutes auto-saved as agent-context entries (type: meeting) with refs to participants/transcript.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

// ── cwd-first resolution (same pattern as other tools) ──────────────────────────
function resolveRoot() {
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'agent-context.config.json')) || existsSync(join(cwd, 'agent-context')))
    return join(cwd, 'agent-context');
  process.stderr.write("agent-context가 초기화되지 않았습니다. 먼저 'agent-context-init.mjs --yes' 를 실행하세요.\n");
  process.stderr.write("(agent-context not initialized in cwd; run 'agent-context-init.mjs --yes' first.)\n");
  process.stderr.write("cwd: " + cwd + "\n");
  process.exit(1);
}
const ROOT = resolveRoot();
const MEETINGS_DIR = join(ROOT, 'meetings');
const TRANSCRIPTS_DIR = join(ROOT, 'meetings/transcripts');
const MINUTES_DIR = join(ROOT, 'meetings/minutes');

function ensureDirs() {
  mkdirSync(MEETINGS_DIR, { recursive: true });
  mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
  mkdirSync(MINUTES_DIR, { recursive: true });
}
ensureDirs();

function today() { return new Date().toISOString().slice(0, 10); }
function now() { return new Date().toISOString(); }
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'meeting'; }
function yq(s) { return '"' + String(s).replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }

// Meeting types with Korean|English labels
const MEETING_TYPES = {
  discussion: { ko: '토론', en: 'discussion', desc: '자유 토론·의견 교환' },
  presentation: { ko: '발표', en: 'presentation', desc: '정보 공유·자료 발표' },
  rebuttal: { ko: '반박', en: 'rebuttal', desc: '주장 검증·반론 구조화' },
  decision: { ko: '의사결정', en: 'decision', desc: '의사결정·합의 도출' },
  standup: { ko: '데일리 스탠드업', en: 'standup', desc: '진행 상황·블로커 공유' },
  retrospective: { ko: '회고', en: 'retrospective', desc: '프로세스 개선·학습' },
  planning: { ko: '계획 수립', en: 'planning', desc: '목표·작업 분할·일정' },
  review: { ko: '리뷰', en: 'review', desc: '결과물 검토·피드백' },
};

// Valid roles
const ROLES = ['moderator', 'presenter', 'participant', 'observer'];

// ── Meeting state helpers ──────────────────────────────────────────────────────
function meetingPath(id) { return join(MEETINGS_DIR, `${id}.json`); }
function transcriptPath(id) { return join(TRANSCRIPTS_DIR, `${id}.jsonl`); }
function minutesPath(id) { return join(MINUTES_DIR, `${id}.md`); }

function readMeeting(id) {
  const p = meetingPath(id);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}
function writeMeeting(m) {
  writeFileSync(meetingPath(m.id), JSON.stringify(m, null, 2) + '\n', 'utf8');
}
function appendTranscript(id, entry) {
  ensureDirs();
  appendFileSync(transcriptPath(id), JSON.stringify(entry) + '\n', 'utf8');
}
function readTranscript(id) {
  const p = transcriptPath(id);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
}

// ── Create meeting ─────────────────────────────────────────────────────────────
function createMeeting(opts) {
  const { title, type = 'discussion', participants = [], moderator = 'system', agenda = '' } = opts;
  if (!MEETING_TYPES[type]) {
    console.error(`invalid type '${type}'. Valid: ${Object.keys(MEETING_TYPES).join(', ')}`);
    process.exit(1);
  }
  const id = `mtg-${today().replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8)}`;
  const meeting = {
    id,
    title,
    type,
    moderator,
    participants: [...new Set([moderator, ...participants])],
    agenda,
    status: 'open',
    created_at: now(),
    started_at: null,
    ended_at: null,
    transcript: `meetings/transcripts/${id}.jsonl`,
    minutes: null,
  };
  writeMeeting(meeting);
  // Create empty transcript file
  writeFileSync(transcriptPath(id), '', 'utf8');
  return meeting;
}

// ── Join meeting (add participant) ─────────────────────────────────────────────
function joinMeeting(id, agent, role = 'participant') {
  const m = readMeeting(id);
  if (!m) return { error: `meeting not found: ${id}` };
  if (m.status !== 'open') return { error: `meeting not open (status: ${m.status})` };
  if (!ROLES.includes(role)) return { error: `invalid role '${role}'` };
  if (!m.participants.includes(agent)) {
    m.participants.push(agent);
  }
  // Track role in a separate field
  if (!m.roles) m.roles = {};
  m.roles[agent] = role;
  writeMeeting(m);
  return { joined: true, meeting: m };
}

// ── Start meeting (moderator only) ─────────────────────────────────────────────
function startMeeting(id, agent) {
  const m = readMeeting(id);
  if (!m) return { error: `meeting not found: ${id}` };
  if (m.moderator !== agent && !m.participants.includes(agent)) return { error: 'not authorized' };
  if (m.status !== 'open') return { error: `already ${m.status}` };
  m.status = 'in-progress';
  m.started_at = now();
  writeMeeting(m);
  // Opening record
  appendTranscript(id, { type: 'system', event: 'start', agent, timestamp: now(), content: `Meeting started: ${m.title} (${MEETING_TYPES[m.type].ko}|${MEETING_TYPES[m.type].en})` });
  return { started: true, meeting: m };
}

// ── Speak (structured utterance) ───────────────────────────────────────────────
function speak(id, agent, content, opts = {}) {
  const { kind = 'statement', refs = [] } = opts; // statement, question, answer, objection, agreement, summary, action-item, decision
  const m = readMeeting(id);
  if (!m) return { error: `meeting not found: ${id}` };
  if (m.status !== 'in-progress') return { error: `meeting not in progress (status: ${m.status})` };
  if (!m.participants.includes(agent)) return { error: 'not a participant' };
  const role = m.roles?.[agent] || 'participant';
  const entry = { type: 'speech', agent, role, kind, content, refs, timestamp: now() };
  appendTranscript(id, entry);
  return { spoken: true, entry };
}

// ── End meeting (moderator only) — auto-generates minutes ──────────────────────
function endMeeting(id, agent) {
  const m = readMeeting(id);
  if (!m) return { error: `meeting not found: ${id}` };
  if (m.moderator !== agent) return { error: 'only moderator can end meeting' };
  if (m.status !== 'in-progress') return { error: `meeting not in progress (status: ${m.status})` };
  m.status = 'ended';
  m.ended_at = now();
  // Generate minutes
  const transcript = readTranscript(id);
  const minutesMd = generateMinutes(m, transcript);
  const minutesFile = `${today()}-${slug(m.title)}--${id}.md`;
  const minutesFull = join(MINUTES_DIR, minutesFile);
  writeFileSync(minutesFull, minutesMd, 'utf8');
  m.minutes = `meetings/minutes/${minutesFile}`;
  // Also save as agent-context entry (type: meeting) for search/index
  saveMeetingEntry(m, transcript);
  writeMeeting(m);
  appendTranscript(id, { type: 'system', event: 'end', agent, timestamp: now(), content: 'Meeting ended' });
  return { ended: true, meeting: m, minutes: m.minutes };
}

// ── Generate minutes markdown ──────────────────────────────────────────────────
function generateMinutes(m, transcript) {
  const speeches = transcript.filter(t => t.type === 'speech');
  const byAgent = {};
  for (const s of speeches) {
    if (!byAgent[s.agent]) byAgent[s.agent] = [];
    byAgent[s.agent].push(s);
  }
  const decisions = speeches.filter(s => s.kind === 'decision');
  const actionItems = speeches.filter(s => s.kind === 'action-item');
  const objections = speeches.filter(s => s.kind === 'objection');
  const questions = speeches.filter(s => s.kind === 'question');
  return `<!-- Path: agent-context/meetings/minutes/${today()}-${slug(m.title)}--${m.id}.md -->
---
id: meeting-${m.id}
type: meeting
title: ${yq(m.title)}
tags: [meeting, ${m.type}]
feature: global
level: diary
scope: global
agent: ${yq(m.moderator)}
created: ${m.created_at}
updated: ${now()}
status: done
priority: 4
summary: ${yq(`Meeting: ${MEETING_TYPES[m.type].ko} - ${m.title} (${m.participants.length} participants)`)}
refs:
  - ${yq(m.transcript)}
---
# 회의록: ${m.title}

**유형**: ${MEETING_TYPES[m.type].ko} (${MEETING_TYPES[m.type].en})
**사회자**: ${m.moderator}
**참석자**: ${m.participants.join(', ')}
**시작**: ${m.started_at}
**종료**: ${m.ended_at}

## 안건
${m.agenda || '(없음)'}

## 발언 요약 (참석자별)
${Object.entries(byAgent).map(([a, list]) => `### ${a} (${m.roles?.[a] || 'participant'})
${list.map(s => `- [${s.kind}] ${s.content}${s.refs.length ? ` (refs: ${s.refs.join(', ')})` : ''}`).join('\n')}`).join('\n\n')}

## 결정 사항 (${decisions.length})
${decisions.length ? decisions.map(d => `- ${d.agent}: ${d.content}`).join('\n') : '없음'}

## 액션 아이템 (${actionItems.length})
${actionItems.length ? actionItems.map(a => `- ${a.agent}: ${a.content}`).join('\n') : '없음'}

## 주요 반박/이슈 (${objections.length})
${objections.length ? objections.map(o => `- ${o.agent}: ${o.content}`).join('\n') : '없음'}

## 질문/답변 (${questions.length})
${questions.length ? questions.map(q => `- ${q.agent}: ${q.content}`).join('\n') : '없음'}

## 전체 트랜스크립트
\`${m.transcript}\` (${speeches.length} 발언)

---
*Generated by agent-meeting.mjs at ${now()}*
`;
}

// ── Save meeting as agent-context entry ────────────────────────────────────────
function saveMeetingEntry(m, transcript) {
  const speeches = transcript.filter(t => t.type === 'speech');
  const entryDir = join(ROOT, 'notes');
  mkdirSync(entryDir, { recursive: true });
  const date = today();
  const fname = `${date}-${slug(m.title)}--meeting.md`;
  const path = join(entryDir, fname);
  const content = `회의: ${m.title} (${MEETING_TYPES[m.type].ko})
참석자: ${m.participants.join(', ')}
발언 수: ${speeches.length}
결정: ${speeches.filter(s=>s.kind==='decision').length}개
액션: ${speeches.filter(s=>s.kind==='action-item').length}개
트랜스크립트: ${m.transcript}
분록: ${m.minutes}`;
  const md = [
    `<!-- Path: agent-context/notes/${fname} -->`, '---',
    `id: meeting-${date.replace(/-/g,'')}-${Math.random().toString(16).slice(2,10)}`,
    `type: meeting`, `level: diary`,
    `title: ${yq(m.title)}`,
    `tags: [meeting, ${m.type}]`, `feature: global`, `scope: global`, `agent: ${yq(m.moderator)}`,
    `created: ${m.created_at}`, `updated: ${now()}`,
    `status: done`, `priority: 4`,
    `summary: ${yq(`Meeting: ${MEETING_TYPES[m.type].ko} - ${m.title}`)}`,
    'refs:', `  - ${yq(m.transcript)}`, `  - ${yq(m.minutes)}`,
    '---', '', content,
  ].join('\n') + '\n';
  writeFileSync(path, md, 'utf8');
  // Regenerate index
  const TOOLS = new URL('.', import.meta.url).pathname;
  spawnSync(process.execPath, [join(TOOLS, 'agent-context-index.mjs')], { stdio: 'inherit' });
}

// ── List meetings ──────────────────────────────────────────────────────────────
function listMeetings() {
  if (!existsSync(MEETINGS_DIR)) return [];
  return readdirSync(MEETINGS_DIR).filter(f => f.endsWith('.json')).map(f => {
    const m = JSON.parse(readFileSync(join(MEETINGS_DIR, f), 'utf8'));
    return { id: m.id, title: m.title, type: m.type, status: m.status, participants: m.participants.length, started: m.started_at, ended: m.ended_at };
  }).sort((a,b) => String(b.started || b.created_at).localeCompare(String(a.started || a.created_at)));
}

// ── Read minutes ───────────────────────────────────────────────────────────────
function readMinutes(id) {
  const m = readMeeting(id);
  if (!m || !m.minutes) return { error: 'no minutes found' };
  const p = join(ROOT, m.minutes);
  if (!existsSync(p)) return { error: 'minutes file missing' };
  return { meeting: m, minutes: readFileSync(p, 'utf8') };
}

// ── CLI ────────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const HELP = `Usage: node tools/agent-meeting.mjs <command> [args]

Meeting types:
  discussion  (토론)      — 자유 토론·의견 교환
  presentation (발표)     — 정보 공유·자료 발표
  rebuttal    (반박)      — 주장 검증·반론 구조화
  decision    (의사결정)  — 의사결정·합의 도출
  standup     (스탠드업)  — 진행 상황·블로커 공유
  retrospective (회고)    — 프로세스 개선·학습
  planning    (계획 수립) — 목표·작업 분할·일정
  review      (리뷰)      — 결과물 검토·피드백

Commands:
  create --title "..." [--type discussion] [--moderator A] [--participants a,b] [--agenda "..."]
  join <meeting-id> <agent> [--role participant]
  start <meeting-id> <agent>
  speak <meeting-id> <agent> "content" [--kind statement|question|answer|objection|agreement|summary|action-item|decision] [--refs a,b]
  end <meeting-id> <agent>
  list
  minutes <meeting-id>

Examples:
  node tools/agent-meeting.mjs create --title "Sprint Planning" --type planning --moderator alice --participants bob,charlie --agenda "Q4 goals"
  node tools/agent-meeting.mjs join mtg-20260827-abc123 david --role presenter
  node tools/agent-meeting.mjs start mtg-20260827-abc123 alice
  node tools/agent-meeting.mjs speak mtg-20260827-abc123 bob "API needs rate limiting" --kind proposal --refs issue-123
  node tools/agent-meeting.mjs speak mtg-20260827-abc123 alice "Agreed, add to sprint" --kind agreement
  node tools/agent-meeting.mjs end mtg-20260827-abc123 alice
`;
  if (!cmd || cmd === '--help' || cmd === '-h') { console.log(HELP); process.exit(0); }

  function getFlag(name) { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; }
  function csvFlag(name) { const v = getFlag(name); return v ? v.split(',').map(s => s.trim()).filter(Boolean) : []; }

  if (cmd === 'create') {
    const title = getFlag('--title');
    if (!title) { console.error('create requires --title'); process.exit(1); }
    const m = createMeeting({
      title,
      type: getFlag('--type') || 'discussion',
      moderator: getFlag('--moderator') || 'system',
      participants: csvFlag('--participants'),
      agenda: getFlag('--agenda') || '',
    });
    console.log(JSON.stringify(m, null, 2));
  } else if (cmd === 'join') {
    const id = args[1]; const agent = args[2];
    if (!id || !agent) { console.error('join requires <meeting-id> <agent>'); process.exit(1); }
    console.log(JSON.stringify(joinMeeting(id, agent, getFlag('--role') || 'participant'), null, 2));
  } else if (cmd === 'start') {
    const id = args[1]; const agent = args[2];
    if (!id || !agent) { console.error('start requires <meeting-id> <agent>'); process.exit(1); }
    console.log(JSON.stringify(startMeeting(id, agent), null, 2));
  } else if (cmd === 'speak') {
    const id = args[1]; const agent = args[2]; const content = args[3];
    if (!id || !agent || !content) { console.error('speak requires <meeting-id> <agent> "content"'); process.exit(1); }
    console.log(JSON.stringify(speak(id, agent, content, { kind: getFlag('--kind') || 'statement', refs: csvFlag('--refs') }), null, 2));
  } else if (cmd === 'end') {
    const id = args[1]; const agent = args[2];
    if (!id || !agent) { console.error('end requires <meeting-id> <agent>'); process.exit(1); }
    console.log(JSON.stringify(endMeeting(id, agent), null, 2));
  } else if (cmd === 'list') {
    console.log(JSON.stringify(listMeetings(), null, 2));
  } else if (cmd === 'minutes') {
    const id = args[1];
    if (!id) { console.error('minutes requires <meeting-id>'); process.exit(1); }
    console.log(JSON.stringify(readMinutes(id), null, 2));
  } else {
    console.error(`unknown command ${cmd}`); process.exit(1);
  }
}