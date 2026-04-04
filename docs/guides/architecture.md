# Architecture

This repo is a small vertical slice with three cooperating parts:

1. `Next.js` renders the UI and hosts the demo eval worker route.
2. `Convex` owns durable state, scheduling, and realtime subscriptions.
3. `src/` holds the shared generation and eval logic used by both.

## System map

```text
user
  |
  v
Next.js UI
  src/app/page.tsx
  src/app/g/[id]/page.tsx
  |
  | submit prompt / subscribe to updates
  v
Convex
  convex/generations.ts
  convex/schema.ts
  |
  | enqueueGeneration()
  | -> schedules runPipeline()
  v
generation pipeline
  src/agents/expandIntent.ts
  src/agents/buildMechanic.ts
  src/compile/compileGame.ts
  src/compile/engineShell.ts
  |
  | produces
  | - GameSpec JSON
  | - mechanic code
  | - compiled HTML game
  v
eval worker client
  src/evals/evalWorkerClient.ts
  |
  | POST /api/evals/run
  v
Next.js route handler worker
  src/app/api/evals/run/route.ts
  |
  v
eval harness
  src/evals/runEvals.ts
  |-- src/evals/runtimeEval.ts
  |-- src/evals/interactionEval.ts
  `-- src/evals/judgeEval.ts
  |
  v
Convex persistence
  saveEvalResult()
  updateGeneration()
  |
  v
Next.js UI updates live through Convex queries
```

## Request lifecycle

```text
prompt
  -> enqueueGeneration()
  -> status: queued
  -> runPipeline()
  -> status: expanding
  -> expandIntent() -> structured GameSpec
  -> status: building
  -> buildMechanic() -> 3 JS functions
  -> status: compiling
  -> compileGame() -> HTML with fixed engine shell
  -> status: evaluating
  -> runEvalWorker()
  -> runtime + interaction + judge results saved
  -> summary fields saved on generation
  -> status: done
```

If any stage throws, Convex marks the generation as `failed` and records the `failureStage`.

## Directory responsibilities

```text
convex/
  schema, mutations, queries, internal actions

src/app/
  Next.js App Router UI and the demo eval worker route

src/agents/
  LLM-backed generation steps
  - expand vague prompt into GameSpec
  - build mechanic code from GameSpec

src/compile/
  deterministic assembly layer
  - fixed engine shell
  - mechanic code insertion

src/evals/
  eval harness, Playwright checks, judge pass, worker client

src/lib/
  shared schemas, OpenRouter wrapper, safe JSON parsing, UI status labels

src/pipeline/
  standalone pipeline entry points for local CLI testing
```

## Core design decisions

### 1. The model does not generate the whole app

The LLM only generates:

- a structured `GameSpec`
- three mechanic functions:
  - `initMechanic(state)`
  - `updateMechanic(state, input)`
  - `renderMechanic(ctx, state)`

Everything else comes from the fixed shell in `src/compile/engineShell.ts`.

That keeps the artifact shape stable and makes failures easier to localize.

### 2. The game is instrumented for evaluation

Every compiled game exposes:

```text
window.__gameEval = {
  ready,
  snapshot(),
  metrics: {
    collisions,
    pickups,
    scoreTicks
  }
}
```

This is the contract the Playwright evals depend on. The harness measures state, not screenshots.

### 3. Convex is the source of truth

Convex owns:

- generation rows
- per-eval rows
- status transitions
- error state
- realtime reads for the UI

The frontend does not poll. It subscribes with `useQuery()` and mutates with `useMutation()`.

### 4. Playwright stays outside the Convex runtime boundary

`runtimeEval.ts` and `interactionEval.ts` need a browser-capable environment. For the demo, that environment is a Next.js route handler with `export const runtime = "nodejs"` in `src/app/api/evals/run/route.ts`.

The current split is:

```text
Convex = orchestration and persistence
Next.js route handler = browser-capable demo worker
Playwright = runtime and interaction execution
OpenRouter = generation and judge model calls
```

For production, the obvious next move is a dedicated worker service that reads jobs from Convex and writes results back.

## Important files to read first

- `convex/generations.ts`
- `convex/schema.ts`
- `src/app/page.tsx`
- `src/app/g/[id]/page.tsx`
- `src/app/api/evals/run/route.ts`
- `src/agents/expandIntent.ts`
- `src/agents/buildMechanic.ts`
- `src/compile/engineShell.ts`
- `src/evals/runEvals.ts`

## Mental model

```text
UI asks for a run
Convex records and advances the run
agents produce explicit intermediate artifacts
compile turns those artifacts into one playable HTML document
evals score the document
Convex persists the results
UI reflects the current truth
```
