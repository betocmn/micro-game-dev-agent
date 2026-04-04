# Agent Harness

In this repo, "agent harness" means the code that turns a weak prompt into a sequence of explicit, typed artifacts instead of one opaque model response.

The harness is intentionally simple:

```text
prompt
  -> structured spec
  -> mechanic code
  -> compiled game
  -> eval suite
  -> persisted result
```

That shape matters more than the number of model calls. The value is in the contracts between stages.

## What counts as the harness here

The harness spans two layers:

```text
generation harness
  expandIntent -> buildMechanic -> compileGame

eval harness
  runtimeEval -> interactionEval -> judgeEval -> summaryScore
```

The live product path is orchestrated from `convex/generations.ts`.

The local development entry points are:

- `src/pipeline/testPipeline.ts`
- `src/evals/testEvals.ts`

There is also a shared standalone orchestrator in `src/pipeline/runGeneration.ts`, but the Convex action currently wires the stages inline instead of calling that function directly.

## Stage map

```text
Stage 0  queue the run
Stage 1  expand intent
Stage 2  build mechanic
Stage 3  compile game
Stage 4  dispatch eval worker
Stage 5  runtime eval
Stage 6  interaction eval
Stage 7  judge eval
Stage 8  persist summary and surface in UI
```

## Stage-by-stage

### Stage 0: Queue the run

File:

- `convex/generations.ts`

What it does:

- inserts a `generations` row with `status: "queued"`
- schedules the internal `runPipeline` action

Why it exists:

- separates user-triggered writes from long-running work
- gives the UI a durable record immediately

Current optimization opportunities:

- add timestamps and attempt counters
- store lightweight per-stage logs
- support retries without creating a brand-new generation row

### Stage 1: Expand intent

Files:

- `src/agents/expandIntent.ts`
- `src/lib/openrouter.ts`
- `src/lib/schemas.ts`

Input:

- vague prompt like `"space dodge rocks"`

Output:

- typed `GameSpec`

What it does:

- sends the prompt to OpenRouter
- constrains the model with a strict JSON contract
- validates the result with Zod

Why it exists:

- converts underspecified user intent into a stable intermediate artifact
- gives downstream steps something machine-checkable to build from

Current optimization opportunities:

- move prompts into versioned files instead of inline strings
- add a repair loop for invalid JSON
- make the model configurable per environment or run
- store raw prompt and response traces for later comparison

### Stage 2: Build mechanic

Files:

- `src/agents/buildMechanic.ts`
- `src/lib/openrouter.ts`

Input:

- `GameSpec`

Output:

- JavaScript that defines exactly:
  - `initMechanic(state)`
  - `updateMechanic(state, input)`
  - `renderMechanic(ctx, state)`

What it does:

- asks the model for game logic only
- strips markdown fences if needed
- validates that the three required functions exist

Why it exists:

- keeps the model focused on the part with the highest variance
- avoids letting the model generate HTML boilerplate, routing, or DOM setup

Current optimization opportunities:

- replace substring checks with stronger parsing or sandbox validation
- add repair prompts when one function is missing
- capture token/cost/latency metadata per run
- test generated code against a richer contract before compile

### Stage 3: Compile game

Files:

- `src/compile/compileGame.ts`
- `src/compile/engineShell.ts`

Input:

- mechanic code

Output:

- self-contained HTML document

What it does:

- injects generated mechanic code into a fixed engine shell
- provides canvas setup, score UI, input handling, game loop, and eval hooks

Why it exists:

- makes every artifact structurally comparable
- gives evals a stable runtime surface
- centralizes engine fixes in one place

Current optimization opportunities:

- make shell versions explicit so runs can be compared across engine changes
- expand instrumentation beyond `ready`, `snapshot()`, and simple metrics
- add stricter compile-time checks that the injected code is safe to run

### Stage 4: Dispatch eval worker

Files:

- `src/evals/evalWorkerClient.ts`
- `src/app/api/evals/run/route.ts`

Input:

- `prompt`
- `spec`
- `mechanicCode`
- `html`

Output:

- full eval suite result

What it does:

- posts the compiled artifact to a browser-capable worker endpoint
- validates both request and response with Zod

Why it exists:

- keeps Playwright out of the Convex runtime boundary
- makes the worker transport explicit

Current optimization opportunities:

- move from the demo route handler to a dedicated worker service
- add queue semantics and retry policies
- support partial result streaming instead of returning the whole suite at once

### Stage 5: Runtime eval

File:

- `src/evals/runtimeEval.ts`

Input:

- compiled HTML

Output:

- `RuntimeEvalResult`

What it does:

- loads the game in Playwright
- waits for `window.__gameEval.ready`
- captures page errors
- tries to read a snapshot

Why it exists:

- this is the cheapest high-signal gate
- if the game does not boot, nothing else matters

Current optimization opportunities:

- capture console warnings separately from hard errors
- store load timings
- persist richer failure diagnostics for debugging

### Stage 6: Interaction eval

File:

- `src/evals/interactionEval.ts`

Input:

- compiled HTML

Output:

- `InteractionEvalResult`

What it does:

- drives arrow-key input through Playwright
- samples snapshots over time
- checks for basic liveness and state change

Why it exists:

- catches games that technically boot but do nothing useful
- tests the runtime behavior rather than just startup

Current optimization opportunities:

- make input policies configurable by genre
- use shell metrics more heavily instead of simple before/after comparisons
- add deterministic seeds for reproducible interaction runs
- record traces or videos for failed cases

### Stage 7: Judge eval

File:

- `src/evals/judgeEval.ts`

Input:

- original prompt
- `GameSpec`
- mechanic code
- runtime result
- interaction result

Output:

- `JudgeEvalResult`

What it does:

- asks a model to score spec adherence across several dimensions
- validates and normalizes the structured response

Why it exists:

- runtime and interaction are not enough to tell whether the game is the right game
- it closes the semantic gap between "works" and "matches intent"

Current optimization opportunities:

- use rubric versioning
- compare multiple judge prompts or models
- add example calibrations so score drift is easier to detect
- cache shared prompt prefixes to cut latency and cost

### Stage 8: Persist summary and surface in UI

Files:

- `convex/generations.ts`
- `convex/schema.ts`
- `src/app/page.tsx`
- `src/app/g/[id]/page.tsx`

What it does:

- stores each eval result in `evalRuns`
- copies summary fields onto the parent `generations` row
- exposes the current state through realtime Convex queries

Why it exists:

- keeps artifacts inspectable after the run finishes
- lets the UI render history and not just the latest in-memory result

Current optimization opportunities:

- persist per-eval lifecycle states such as `queued`, `running`, `done`, `failed`
- show partial eval progress as each stage completes
- reduce the amount of eval-specific branching in the UI with a registry-driven renderer

## Why this harness shape works

```text
each stage narrows uncertainty

prompt         = ambiguous human input
GameSpec       = structured intent
mechanic code  = executable logic contract
compiled HTML  = stable runtime artifact
eval results   = measurable quality signals
Convex rows    = durable history
```

The system is easier to debug because each boundary has a visible artifact.

## Current rough edges

These are the main places where the harness is still intentionally MVP-shaped:

- `convex/generations.ts` duplicates orchestration logic instead of calling `runGenerationPipeline()` directly
- prompts live inline in TypeScript files
- repair and retry loops do not exist yet
- eval persistence is explicit per eval type, not registry-driven
- the worker returns a complete suite in one shot instead of incrementally

None of that blocks the demo. It just means the next round of work should focus more on harness ergonomics than on adding more model calls.

## Best next optimizations

If you want to improve the harness without changing the product idea, the highest-leverage moves are:

1. Unify the Convex action with `src/pipeline/runGeneration.ts` so the generation path has one orchestrator.
2. Add repair loops for invalid `GameSpec` output and incomplete mechanic code.
3. Version prompts, rubrics, and engine shell changes so runs are comparable over time.
4. Move Playwright execution into a dedicated worker and persist per-eval progress.
5. Add richer artifact logging so failures can be clustered and compared.

## Mental model

Do not think of this repo as "a model that writes games."

Think of it as:

```text
a typed workflow
that uses models at a few high-variance steps
and surrounds them with deterministic scaffolding,
measurement, and persistence
```

That is the real harness.
