# Dev Completion Plan

## Purpose

Turn the current repo into something founder-ready under a one-hour timebox while also making the architecture easier to explain against the Lemonade stack.

This plan is based on the repo state reviewed on April 4, 2026, not the idealized target state from the original plan docs.

## Current Starting Point

What already exists:
- a two-step agent harness in TypeScript
- OpenRouter-backed LLM calls
- a deterministic game compiler with a fixed HTML5 canvas shell
- Convex schema, mutations, queries, and a live-updating UI
- three eval implementations in `src/evals/`
- local CLI scripts for pipeline and eval testing

What is still incomplete:
- the live app flow never runs evals
- Convex marks generations `done` immediately after compile
- `saveEvalResult()` exists but is unused
- Playwright has no worker runtime even though the README correctly says it should not run inside Convex cloud actions
- repo bootstrap is rough: this workspace has no `node_modules/`, `convex/_generated/` is absent, and `.env.local.example` is referenced but missing
- some product surfaces are still optimistic MVP code rather than robust code paths

## Definition Of Complete Enough

For the next hour, "complete" should mean:

1. A fresh clone can be installed and booted with documented environment setup.
2. The UI can generate a playable game end to end.
3. At least one eval result is visible in a repeatable demo path.
4. The architecture clearly shows which work belongs in Convex versus a browser-capable worker.
5. You can explain the stack as an intentional system, not a pile of partial features.

## Highest-Leverage Plan For The Next Hour

### 1. Make The Repo Runnable First

Timebox: 10 minutes

Do this before adding features:
- run `pnpm install`
- run `pnpm convex dev` to generate `convex/_generated/`
- add `.env.local.example` with `NEXT_PUBLIC_CONVEX_URL` and `OPENROUTER_API_KEY`
- fix README setup steps to match the actual repo state
- verify `pnpm lint` and `pnpm build`

Why this matters:
- right now the repo is harder to trust than it needs to be
- founder-facing demos fall apart fast if setup is ambiguous
- this is also the cleanest way to understand how Next.js, Convex, and generated Convex client types fit together

### 2. Close The Biggest Product Gap: Live Eval Persistence

Timebox: 20-25 minutes

Do not try to perfect the entire eval architecture in this window. Close the most visible loop first.

Minimum viable target:
- after compile, move the generation to `evaluating`
- run at least the runtime eval in a repeatable environment
- persist its result with `saveEvalResult()`
- write summary fields back onto the generation row
- show the result on both the home page and detail page

Files most likely involved:
- `convex/generations.ts`
- `src/evals/runtimeEval.ts`
- `src/app/page.tsx`
- `src/app/g/[id]/page.tsx`
- `src/types.ts`

Why this matters:
- the biggest mismatch in the repo is not "lack of features", it is that the app promises scored generations but the live flow stops before scoring
- even one real eval in the product is a stronger story than three eval modules that only run from the CLI

### 3. Be Honest About The Worker Boundary

Timebox: 10-15 minutes

The architecture lesson here is important:
- Convex is a strong system of record and orchestration layer
- Playwright needs a browser-capable runtime
- that browser-capable runtime should live in a Fly or Docker worker, not in Convex cloud actions

If there is not enough time to build the worker properly, do this instead:
- leave the runtime eval integrated through a local or server-side path that works for the demo
- add a short note in the README describing the intended worker split
- make it explicit that the next production step is a worker queue that reads jobs from Convex, runs Playwright, then writes results back

This is not a weakness. It is one of the main architectural insights behind the Lemonade stack.

### 4. Remove A Few Easy Sources Of Drift

Timebox: 10 minutes

Tighten the system where it is currently duplicated or fragile:
- stop duplicating prompt and pipeline logic between `src/` and `convex/` where possible
- add schema validation for LLM outputs instead of only checking a few fields
- guard JSON parsing in the frontend so malformed data does not break rendering
- record which stage failed, not only the final error string

These are small changes, but they make the repo easier to reason about when talking through it live.

## Robustness Backlog After The Hour

### Agent Harness

- Move prompt templates into versioned files instead of inline strings.
- Validate `GameSpec` and judge outputs with Zod.
- Add a repair loop for invalid JSON or missing mechanic functions.
- Make the model configurable from env instead of hard-coding a single default everywhere.
- Store intermediate artifacts and prompt traces for comparison across runs.

### Evals

- Move Playwright execution into a dedicated Fly or Docker worker.
- Persist eval lifecycle states: `queued`, `running`, `done`, `failed`.
- Store per-eval timing, browser errors, and key metrics.
- Add retry policies for flaky browser failures.
- Keep runtime, interaction, and judge evals independently inspectable.

### Convex

- Use Convex as the source of truth for generation state transitions and eval jobs.
- Add timestamps, attempt counters, and failure-stage metadata.
- Make the action an orchestrator, not a place where logic is duplicated.
- Consider an explicit job table if worker-based eval execution becomes more complex.

### Frontend

- Replace `any` usage with typed query results.
- Replace inline `JSON.parse` calls with safe parsing helpers.
- Add clearer progress states for `queued`, `expanding`, `building`, `compiling`, and `evaluating`.
- Show partial eval progress as each eval completes.
- Add curated demo prompts and clearer failure states.

### Deployment

- Add a Dockerfile for the browser worker.
- Split deployment responsibilities clearly:
  - Next.js app
  - Convex backend
  - Playwright worker
- Document required env vars once, in one place.
- Verify Fly deployment instructions against the actual repo before claiming deployment readiness.

## What This Teaches About Lemonade's Stack

This repo is already useful as a learning exercise because it shows the main moving parts:

- `Agent harness`: the real work is output contracts, intermediate artifacts, and failure recovery, not just calling a model.
- `Convex`: best used as realtime state and orchestration glue, especially when long-running work has multiple visible stages.
- `Fly + Docker`: this is where browser-based evals and heavier agent jobs should live.
- `Evals`: game-generation systems need runtime, interaction, and spec-match signals, not only text outputs.
- `Extensibility`: the more isolated the model adapter, eval runner, and worker boundary are, the easier it is to swap models or evaluation strategies after a frontier shift.

## Founder-Ready Summary

If you want one honest sentence to carry into the email, use this:

The repo already proves the core loop of vague prompt -> structured intent -> mechanic code -> playable game -> reactive UI, and the main remaining engineering gap is moving browser-based evals out of Convex into a worker that writes results back into the realtime system.
