<!-- Path: BENCHMARK.md -->
# Benchmark — Hierarchical Lightweight Search vs Full Read

> **Objective, public-standard-like, critical, reproducible** — synthetic 5/50/500 scale, 20 queries, tokens = chars/4, hit = query tokens in title/tags/summary, latency = search vs est. full Read, no LLM.

## Method (close to public standard)

- **Dataset**: Synthetic 5 + 50 + 500 entries, distribution 40% post-it (15tok) 30% memo (50tok) 15% diary (200tok) 10% bookshelf (1000tok) 5% library (5000tok) — like cache workloads, not cherry-picked.
- **Queries**: 20 mixed — single word (`auth`), phrase (`auth jwt race`), overall (`overall flow`), level-specific (`post-it`), work-history/idea/overall-flow fluid types.
- **Metrics**: `tokens top` (hierarchical top 3), `tokens full` (all entries), `saving` (`1 - top/full`), `hitRate` (at least 1 hit), `latency` (ms, performance.now), `tokensPerHit`.
- **Lightweight AI**: rule-based, 0 LLM calls, 0 tokens, hierarchical `post-it→memo→diary→bookshelf→library` — like cache→HBM→DRAM→SSD, small→large, miss expands.
- **Baseline**: Full Read = sum all levels tokens (like `Glob+Read *.md`).
- **Critical**: We report **avgSaving** but also **hitRate** and **latency** — saving is meaningless if hitRate low or latency high.

## Results (run: `node tools/benchmark.mjs`)

| scale | full tokens | avg top 3 tokens | avg saving | hitRate | avg latency (search) | est. full Read latency | tokens/hit |
|---|---|---|---|---|---|---|
<<<<<<< HEAD
| 5 | 1315 | 178 | 83.1% | 80.0% | 0.11ms | 0.25ms (est. Read all md) | 223 |
| 50 | 16780 | 761 | 94.7% | 85.0% | 0.40ms | 2.50ms (est. Read all md) | 895 |
| 500 | 197940 | 1883 | 98.9% | 85.0% | 2.60ms | 25.00ms (est. Read all md) | 2216 |
=======
| 5 | 1315 | 178 | 83.1% | 80.0% | 0.16ms | 0.25ms (est. Read all md) | 223 |
| 50 | 16780 | 761 | 94.7% | 85.0% | 0.41ms | 2.50ms (est. Read all md) | 895 |
| 500 | 197940 | 1883 | 98.9% | 85.0% | 2.34ms | 25.00ms (est. Read all md) | 2216 |
>>>>>>> fix/integration-defects

### Interpretation (critical, not hype)

- **5 entries** (current repo): `full  ~1315tok` vs `top ~178tok` → saving **83.1%** but absolute saving small — overhead of hierarchy not yet amortized. At small scale, full Read is also cheap; hierarchical still wins on **latency** (`post-it` first, no need to parse large).
- **50 entries** (team, 1 month): saving **94.7%** with **85.0%** hitRate — like cache 90% hit, 10% miss expands to larger levels. This is the sweet spot: 50×200 avg ~10k full vs ~761 top.
- **500 entries** (project, 6 months): saving **98.9%** — like library scale, hierarchical is **99%** saving, but hitRate drops to **85.0%** if queries are too narrow (e.g., `post-it` query misses `library` content). **Tradeoff**: narrow query → high saving but lower hit, broad query → lower saving but higher hit. Our lightweight AI chooses starting level from query length to balance.

### Sample per-query (scale 50)

| query | assignedLevel | top tokens | saving | hit | latency |
|---|---|---|---|---|
<<<<<<< HEAD
| auth | post-it | 45 | 99.7% | ✅ | 1.38ms |
| api | post-it | 80 | 99.5% | ✅ | 0.33ms |
| jwt | post-it | 0 | n/a (miss) | ❌ | 0.32ms |
| pagination | post-it | 0 | n/a (miss) | ❌ | 0.31ms |
| cache | post-it | 0 | n/a (miss) | ❌ | 0.36ms |
=======
| auth | post-it | 45 | 99.7% | ✅ | 0.39ms |
| api | post-it | 80 | 99.5% | ✅ | 0.33ms |
| jwt | post-it | 0 | n/a (miss) | ❌ | 0.89ms |
| pagination | post-it | 0 | n/a (miss) | ❌ | 1.56ms |
| cache | post-it | 0 | n/a (miss) | ❌ | 0.64ms |
>>>>>>> fix/integration-defects

### What we learned while benchmarking (ideas & shortcomings →补)

1. **Level auto-assign is coarse**: query `auth` → `post-it` is correct for 80% but `auth overall flow` should start at `bookshelf`, not `memo` — we added keyword check (`overall`/`architecture` → `bookshelf`) after seeing 2/20 misses at 500 scale. Still crude; next: use `priority` and `affects` count to nudge larger for `overall-flow` type.
2. **Hit definition is strict**: `hit = query tokens in title/tags/summary` misses semantic synonyms (`jwt` vs `token`). Real lightweight AI should use embeddings or at least stemming, but we keep 0-install (no ML) for now — tradeoff: 0 tokens vs semantic recall. Next: optional `sqlite-fts` backend for 1000+ scale (already in config).
3. **Full Read latency est. is synthetic**: `entries*0.05ms` is placeholder for `Read md` I/O; real `Glob+Read` is higher due to git + markdown parse. Our saving is thus **conservative**.
4. **Tokens vs chars/4 is standard but not exact**: Anthropic counts 4 chars ≈ 1 token for English, Korean is ~2.5 chars/token. Our benchmark uses 4 for reproducibility; Korean-heavy repo would show higher saving.

### How to reproduce (public, no LLM)

```bash
node tools/benchmark.mjs --scale 5,50,500 --queries 20
node tools/benchmark.mjs --json > /tmp/bench.json
cat BENCHMARK.md
```

No API key, no `npm install`, Node ≥18 only — like `agent-search-lite.mjs`.

### Raw (this run)

```json
[
  {
    "scale": 5,
    "distribution": "40% post-it, 30% memo, 15% diary, 10% bookshelf, 5% library",
    "seed": 42,
    "fullTokens": 1315,
    "avgTopTokens": 178,
    "avgSaving": "83.1%",
    "hitRate": "80.0%",
<<<<<<< HEAD
    "avgLatency": "0.11ms",
=======
    "avgLatency": "0.16ms",
>>>>>>> fix/integration-defects
    "fullLatencyEst": "0.25ms (est. Read all md)",
    "tokensPerHit": 223,
    "perQuery": [
      {
        "query": "auth",
        "assignedLevel": "post-it",
        "topTokens": 50,
        "saving": "96.2%",
        "hit": true,
<<<<<<< HEAD
        "latency": "0.57ms"
=======
        "latency": "0.65ms"
>>>>>>> fix/integration-defects
      },
      {
        "query": "api",
        "assignedLevel": "post-it",
        "topTokens": 15,
        "saving": "98.9%",
        "hit": true,
        "latency": "0.25ms"
      },
      {
        "query": "jwt",
        "assignedLevel": "post-it",
        "topTokens": 0,
        "saving": "n/a (miss)",
        "hit": false,
        "latency": "0.16ms"
      },
      {
        "query": "pagination",
        "assignedLevel": "post-it",
        "topTokens": 0,
        "saving": "n/a (miss)",
        "hit": false,
        "latency": "0.13ms"
      },
      {
        "query": "cache",
        "assignedLevel": "post-it",
        "topTokens": 0,
        "saving": "n/a (miss)",
        "hit": false,
<<<<<<< HEAD
        "latency": "0.05ms"
=======
        "latency": "0.35ms"
>>>>>>> fix/integration-defects
      }
    ]
  },
  {
    "scale": 50,
    "distribution": "40% post-it, 30% memo, 15% diary, 10% bookshelf, 5% library",
    "seed": 42,
    "fullTokens": 16780,
    "avgTopTokens": 761,
    "avgSaving": "94.7%",
    "hitRate": "85.0%",
<<<<<<< HEAD
    "avgLatency": "0.40ms",
=======
    "avgLatency": "0.41ms",
>>>>>>> fix/integration-defects
    "fullLatencyEst": "2.50ms (est. Read all md)",
    "tokensPerHit": 895,
    "perQuery": [
      {
        "query": "auth",
        "assignedLevel": "post-it",
        "topTokens": 45,
        "saving": "99.7%",
        "hit": true,
<<<<<<< HEAD
        "latency": "1.38ms"
=======
        "latency": "0.39ms"
>>>>>>> fix/integration-defects
      },
      {
        "query": "api",
        "assignedLevel": "post-it",
        "topTokens": 80,
        "saving": "99.5%",
        "hit": true,
        "latency": "0.33ms"
      },
      {
        "query": "jwt",
        "assignedLevel": "post-it",
        "topTokens": 0,
        "saving": "n/a (miss)",
        "hit": false,
<<<<<<< HEAD
        "latency": "0.32ms"
=======
        "latency": "0.89ms"
>>>>>>> fix/integration-defects
      },
      {
        "query": "pagination",
        "assignedLevel": "post-it",
        "topTokens": 0,
        "saving": "n/a (miss)",
        "hit": false,
        "latency": "1.56ms"
      },
      {
        "query": "cache",
        "assignedLevel": "post-it",
        "topTokens": 0,
        "saving": "n/a (miss)",
        "hit": false,
<<<<<<< HEAD
        "latency": "0.36ms"
=======
        "latency": "0.64ms"
>>>>>>> fix/integration-defects
      }
    ]
  },
  {
    "scale": 500,
    "distribution": "40% post-it, 30% memo, 15% diary, 10% bookshelf, 5% library",
    "seed": 42,
    "fullTokens": 197940,
    "avgTopTokens": 1883,
    "avgSaving": "98.9%",
    "hitRate": "85.0%",
<<<<<<< HEAD
    "avgLatency": "2.60ms",
=======
    "avgLatency": "2.34ms",
>>>>>>> fix/integration-defects
    "fullLatencyEst": "25.00ms (est. Read all md)",
    "tokensPerHit": 2216,
    "perQuery": [
      {
        "query": "auth",
        "assignedLevel": "post-it",
        "topTokens": 45,
        "saving": "99.9%+",
        "hit": true,
<<<<<<< HEAD
        "latency": "5.40ms"
=======
        "latency": "3.82ms"
>>>>>>> fix/integration-defects
      },
      {
        "query": "api",
        "assignedLevel": "post-it",
        "topTokens": 45,
        "saving": "99.9%+",
        "hit": true,
<<<<<<< HEAD
        "latency": "2.38ms"
=======
        "latency": "1.83ms"
>>>>>>> fix/integration-defects
      },
      {
        "query": "jwt",
        "assignedLevel": "post-it",
        "topTokens": 0,
        "saving": "n/a (miss)",
        "hit": false,
<<<<<<< HEAD
        "latency": "2.32ms"
=======
        "latency": "6.05ms"
>>>>>>> fix/integration-defects
      },
      {
        "query": "pagination",
        "assignedLevel": "post-it",
        "topTokens": 0,
        "saving": "n/a (miss)",
        "hit": false,
<<<<<<< HEAD
        "latency": "2.66ms"
=======
        "latency": "4.64ms"
>>>>>>> fix/integration-defects
      },
      {
        "query": "cache",
        "assignedLevel": "post-it",
        "topTokens": 0,
        "saving": "n/a (miss)",
        "hit": false,
<<<<<<< HEAD
        "latency": "2.46ms"
=======
        "latency": "4.53ms"
>>>>>>> fix/integration-defects
      }
    ]
  }
]
```
