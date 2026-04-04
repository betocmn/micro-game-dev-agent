# Architecture

This repo now has three live boundaries:

1. `Next.js 16` renders the product UI.
2. `Convex` owns durable state and orchestration.
3. The local worker owns Anthropic generation and eval execution.

## System map

```text
user
  |
  v
Next.js UI
  src/app/page.tsx
  src/app/g/[id]/page.tsx
  |
  | enqueue prompt / subscribe to updates
  v
Convex
  convex/generations.ts
  convex/schema.ts
  |
  | POST /runs/generate
  v
harness worker
  src/worker/server.ts
  src/worker/harness.ts
  |
  | creates .context/runs/<generationId>/workspace
  | plans RobloxGameSpec
  | materializes editable Luau files
  | runs eval suite
  v
Convex persistence
  generations
  agentRuns
  agentEvents
  evalRuns
  |
  v
Next.js UI updates through Convex queries
```

## Request lifecycle

```text
prompt
  -> enqueueGeneration()
  -> generation.status = queued
  -> runPipeline()
  -> status = expanding
  -> worker creates run workspace
  -> planner produces RobloxGameSpec or fallback spec
  -> status = building
  -> builder edits scaffold or fallback builder writes deterministic files
  -> status = evaluating
  -> artifact + roblox + judge evals run in the worker
  -> Convex persists bundle, trace, and eval rows
  -> status = done or failed
```

If any stage throws before a valid response is produced, Convex marks the generation as `failed` and stores `failureStage`.

## Runtime responsibilities

### Next.js

Owns:

- the home page
- the generation detail page
- user mutations and realtime reads through Convex hooks

Does not own:

- model execution
- eval execution
- workspace file writes

### Convex

Owns:

- generation lifecycle
- retry bookkeeping
- persistent artifact bundle storage
- agent run and event storage
- eval row storage

Convex is the source of truth. The worker is stateless between requests except for the run workspace directory under `.context/`.

### Worker

Owns:

- loading `.env.local`
- Anthropic SDK calls
- workspace creation and artifact loading
- file access policy enforcement
- proxy eval execution

Endpoints:

- `POST /runs/generate`
- `POST /runs/evaluate`

## Artifact contract

The live artifact is no longer playable browser HTML. It is a fixed Rojo-style bundle:

```text
ArtifactBundle {
  artifactType: "roblox-rojo"
  scaffoldVersion: "claude-rojo-v1"
  files: ArtifactFile[]
}
```

That contract keeps runs comparable across harness versions and makes proxy evals deterministic.

## Eval contract

The live eval profile is `roblox-social-v1`.

The suite is:

- `artifact`: required files, schema validity, scaffold checksum, editable boundaries
- `roblox`: server/client split, banned APIs, contract exports, remote-signal heuristics, social-loop heuristics
- `judge`: Anthropic-backed scoring with deterministic fallback

## Known current behavior

As of April 4, 2026:

- the Anthropic auth path is healthy
- direct harness runs and HTTP worker runs complete successfully
- short prompts may still hit planner and builder timeouts, then finish through the deterministic fallback path

That means the architecture is correct and durable, but the current model-steerability is still conservative. The obvious next improvement is raising the rate of successful Claude-authored scaffold edits without changing the worker or persistence boundaries.
