# Running The Worker

This is the practical runbook for the Roblox worker that uses Anthropic Agent SDK for authoring and OpenRouter GPT for judge evals.

## Required env

Set these in `.env.local`:

- `NEXT_PUBLIC_CONVEX_URL`
- `ANTHROPIC_API_KEY`
- `OPENROUTER_API_KEY`

Optional:

- `HARNESS_WORKER_URL`

As of April 4, 2026, the worker, benchmark CLI, and direct harness entry point all load `.env.local` automatically through `@next/env`.

## Start the worker

```bash
pnpm worker:dev
```

Expected output:

```text
Harness worker listening on http://127.0.0.1:3200
```

## Smoke test the generate endpoint

With the worker running:

```bash
curl -sS -X POST http://127.0.0.1:3200/runs/generate \
  -H 'Content-Type: application/json' \
  -d '{"generationId":"smoke-http-1","prompt":"mall hang vibes"}'
```

What to inspect in the response:

- `spec`
- `artifactBundle.files`
- `agentRun`
- `evalSuite`
- `events`

## Inspect the workspace

Each run writes a local workspace to:

```text
.context/runs/<generationId>/workspace
```

That is the fastest way to inspect the actual generated Luau files.

## Read the trace correctly

If `events` contains entries like:

- `planner fallback used`
- `builder fallback used`
- `repair fallback used`

then the run completed through deterministic recovery rather than Claude-authored file edits.

That is still a valid run. It means the harness contract worked and the fallback path preserved availability.

## Current behavior

As of April 6, 2026, the worker codepath is wired so that:

- planner, builder, and repair use `ANTHROPIC_API_KEY`
- the Roblox judge uses `OPENROUTER_API_KEY`
- the Roblox judge model is hardcoded to `openai/gpt-5-mini`
- a missing OpenRouter judge key fails the request in the `evaluating` stage
- judge provider failures fall back to the deterministic heuristic score instead of aborting the run

## Run benchmarks

```bash
pnpm benchmark
```

Reports are written to:

```text
.context/benchmarks/
```

Use benchmark output to compare harness changes by:

- `harnessVersion`
- `evalProfile`
- average score
- pass rate

## If a run fails

Check these in order:

1. `ANTHROPIC_API_KEY` is present in `.env.local`
2. `OPENROUTER_API_KEY` is present in `.env.local`
3. the worker process started from the repo root
4. `.context/runs/<generationId>/workspace` exists
5. the response contains fallback events
6. `artifact` and `roblox` eval notes explain the failure

If the worker completes but always falls back, the next problem is steerability, not plumbing.
