# Agent Harness

In this repo, the harness is the code that turns a vague Roblox prompt into a durable run with typed artifacts, traces, and evals.

The live path is:

```text
prompt
  -> Convex generation row
  -> worker run workspace
  -> RobloxGameSpec
  -> Rojo + Luau artifact bundle
  -> artifact / roblox / judge eval suite
  -> persisted run, events, and files
```

The important point is not "one model call." The important point is that every stage produces something explicit and inspectable.

## Live entry point

The direct combined harness entry point is `generateRobloxRun()` in `src/worker/harness.ts`.

Convex calls it indirectly through the local worker:

```text
convex/generations.ts
  -> src/worker/workerClient.ts
  -> POST /runs/materialize
  -> POST /runs/evaluate
  -> src/worker/server.ts
  -> src/worker/harness.ts
```

## Stages

### 1. Create a run workspace

`createRunWorkspace()` copies the fixed scaffold into:

```text
.context/runs/<generationId>/workspace
```

The scaffold comes from `src/worker/template/` and always contains:

- `default.project.json`
- `src/server/Mechanic.server.luau`
- `src/client/Mechanic.client.luau`
- `src/shared/GameSpec.json`
- `src/shared/MechanicContract.luau`
- `README.generated.md`

Only three files are editable by the authoring agent:

- `src/server/Mechanic.server.luau`
- `src/client/Mechanic.client.luau`
- `src/shared/GameSpec.json`

### 2. Plan a strict `RobloxGameSpec`

The planner asks Claude Agent SDK for structured JSON that matches the `RobloxGameSpec` schema.

If the planner errors or times out, the harness falls back to `deriveRobloxSpecFromPrompt()` in `src/worker/fallback.ts`.

That keeps the run alive and makes the failure explicit in `events`.

### 3. Materialize the editable scaffold files

The builder uses Claude Agent SDK with:

- the `rojo_builder` subagent
- `permissionMode: "acceptEdits"`
- a tool allowlist
- hooks that deny `Bash`, `WebFetch`, `.env`, `.git`, path traversal, and writes outside the run workspace

If the builder errors or times out, the harness falls back to deterministic Luau generation in `materializeFallbackProject()`.

If proxy evals fail, the harness gives Claude one repair pass. If repair fails, it falls back again.

### 4. Run the eval suite

The worker runs three evals:

- `artifact` in `src/evals/artifactEval.ts`
- `roblox` in `src/evals/robloxEval.ts`
- `judge` in `src/evals/robloxJudgeEval.ts`

Weights are:

- `artifact`: 30
- `roblox`: 30
- `judge`: 40

The judge runs through OpenRouter using `OPENROUTER_API_KEY` and defaults to `openai/gpt-5-mini`. It also has a deterministic fallback so a provider failure does not kill the generation.

### 5. Persist the run

Convex stores:

- the top-level generation row
- the artifact bundle
- the latest agent run summary
- agent events
- one row per eval result

The UI reads those records and renders:

- the file tree
- code viewer
- spec summary
- trace summary
- eval results

## Why the fallback exists

The repo still uses Anthropic Agent SDK for planner, builder, and repair, but the judge is now a separate OpenRouter GPT call. The fallback path is there to guarantee a complete run and make the failure mode measurable instead of opaque.

As of April 6, 2026, the current harness codepath expects:

- `.env.local` is loaded for direct harness calls, `pnpm worker:dev`, and `pnpm benchmark`
- `ANTHROPIC_API_KEY` for planner, builder, and repair
- `OPENROUTER_API_KEY` for the Roblox judge
- `OPENROUTER_JUDGE_MODEL` optionally overrides the default `openai/gpt-5-mini`

That is acceptable for the MVP because the contract, trace surface, and eval surface are all working. The next quality step is improving the Claude-authored hit rate, not replacing the harness shape.
