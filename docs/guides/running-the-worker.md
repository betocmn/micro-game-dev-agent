# Running The Worker

This is the practical runbook for the Anthropic-native Roblox worker.

## Required env

Set these in `.env.local`:

- `NEXT_PUBLIC_CONVEX_URL`
- `ANTHROPIC_API_KEY`

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

## Verified behavior

Verified on April 4, 2026 with a real `ANTHROPIC_API_KEY`:

- direct `generateRobloxRun()` completed successfully
- `POST /runs/generate` completed successfully
- the `mall hang vibes` smoke test passed `artifact` and `roblox` evals
- the current planner and builder timed out on that short prompt, so the run used deterministic fallback files

The response still persisted a valid Roblox scaffold, trace events, and eval output. That is the current expected MVP behavior.

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
2. the worker process started from the repo root
3. `.context/runs/<generationId>/workspace` exists
4. the response contains fallback events
5. `artifact` and `roblox` eval notes explain the failure

If the worker completes but always falls back, the next problem is steerability, not plumbing.
