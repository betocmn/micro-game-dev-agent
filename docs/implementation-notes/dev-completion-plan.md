# Dev Completion Plan

## Purpose

Turn the repo into something founder-ready under a one-hour timebox while making the architecture easier to explain against the Lemonade stack.

This document now reflects the repo state after the April 4, 2026 completion pass.

## What Shipped

The repo now demonstrates the full demo loop:
- vague prompt -> structured `GameSpec`
- `GameSpec` -> mechanic code
- mechanic code -> playable HTML5 canvas game
- compiled game -> persisted eval suite
- persisted eval suite -> live UI updates on the home page and detail page

## Completion Summary

### 1. Repo runnable and documented

Completed:
- `.env.local.example` exists and documents the required local env vars
- `README.md` matches the actual local setup flow
- Playwright browser installation is documented
- the repo already includes generated Convex client files, and the README now explains how they fit into local bootstrapping

Outcome:
- a fresh clone has a clearer path to `pnpm install`, `pnpm exec playwright install`, `cp .env.local.example .env.local`, and `pnpm dev`

### 2. Live eval persistence wired into the product

Completed:
- after compile, generations now move to `evaluating`
- Convex calls a browser-capable eval worker path
- runtime, interaction, and judge evals are persisted with `saveEvalResult()`
- summary fields are written back onto the generation row
- the home page and detail page both surface persisted eval results

Files touched for this:
- `convex/generations.ts`
- `src/app/api/evals/run/route.ts`
- `src/evals/evalWorkerClient.ts`
- `src/app/page.tsx`
- `src/app/g/[id]/page.tsx`
- `src/types.ts`

Outcome:
- the biggest product mismatch is closed; the live app now reaches scored generations instead of stopping immediately after compile

### 3. Worker boundary made explicit

Completed:
- Playwright runs through a Node worker path exposed by Next.js
- Convex remains the system of record and orchestration layer
- the README explains that this route-handler worker is the demo implementation, not the final production architecture

Current demo split:
- `Convex`: generation lifecycle and persistence
- `Next.js route handler`: browser-capable eval execution
- `Playwright`: runtime and interaction checks

Remaining production step:
- move eval execution into a dedicated Fly or Docker worker queue that reads jobs from Convex and writes results back

### 4. Easy drift and robustness fixes landed

Completed:
- shared pipeline modules in `src/` are reused from `convex/` instead of duplicating prompt and compile logic there
- LLM outputs are validated with Zod instead of relying on a few ad hoc checks
- frontend JSON parsing is guarded with safe helpers
- generations record `failureStage`, not only a final error string
- UI status and failure rendering are centralized and typed

Outcome:
- the repo is easier to explain and less fragile during live demos

## Definition Of Complete Enough

The repo now meets the original demo bar:

1. A fresh clone can be installed and booted with documented environment setup.
2. The UI can generate a playable game end to end.
3. Eval results are visible in a repeatable demo path.
4. The architecture clearly shows the split between Convex orchestration and a browser-capable worker.
5. The stack can be explained as an intentional system instead of a pile of partial features.

## Remaining Backlog After This Pass

### Agent Harness

- Move prompt templates into versioned files instead of inline strings.
- Add a repair loop for invalid JSON or missing mechanic functions.
- Make the model configurable from env instead of hard-coding a single default everywhere.
- Store intermediate artifacts and prompt traces for comparison across runs.

### Evals

- Move Playwright execution into a dedicated Fly or Docker worker.
- Persist eval lifecycle states such as `queued`, `running`, `done`, and `failed`.
- Store per-eval timing, browser errors, and key metrics.
- Add retry policies for flaky browser failures.
- Show partial eval progress as each eval completes.

### Convex

- Add timestamps and attempt counters to generation and eval rows.
- Consider an explicit job table if worker-based eval execution becomes more complex.
- Support retries or resumable eval runs instead of a single pass.

### Frontend

- Add curated demo prompts and clearer empty-state guidance.
- Surface more granular progress history for long-running generations.
- Improve typing on the remaining optimistic UI surfaces.

### Deployment

- Add a Dockerfile for the browser worker.
- Split deployment responsibilities clearly across the web app, Convex backend, and worker.
- Verify hosted deployment instructions against an actual deployed environment.

## What This Teaches About Lemonade's Stack

This repo now shows the intended system more clearly:

- `Agent harness`: the real work is output contracts, intermediate artifacts, and recovery, not just calling a model.
- `Convex`: best used as realtime state and orchestration glue for visible multi-stage work.
- `Browser worker`: Playwright belongs in a browser-capable runtime, not in Convex cloud actions.
- `Evals`: runtime, interaction, and judge signals make generated games inspectable.
- `Extensibility`: cleaner boundaries make it easier to swap models, worker implementations, and eval strategies.

## Founder-Ready Summary

The repo now proves the core loop of vague prompt -> structured intent -> mechanic code -> playable game -> persisted evals -> reactive UI, and the main remaining production step is moving the demo worker route into a dedicated worker that writes results back into Convex.
