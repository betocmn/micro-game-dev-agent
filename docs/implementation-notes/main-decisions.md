# Main Architectural Decisions

This document covers the core concepts, design decisions, and implementation details of the Roblox Harness MVP. Each section includes pointers to the relevant source files.

---

## 1. Claude Agent SDK Integration

The harness uses `@anthropic-ai/claude-agent-sdk` to orchestrate AI-powered game generation. Rather than a single monolithic agent, the system defines three specialized agents with different tool sets and permission levels.

### Agent definitions

All three agents are defined in a single `AGENTS` record:

- **`roblox_intent_planner`** — Pure reasoning agent with no tools. Takes a vague prompt and expands it into a structured `RobloxGameSpec` via `json_schema` output format. Runs in `permissionMode: "plan"` so it cannot modify files. Limited to 8 turns and 25 seconds.
- **`rojo_builder`** — File-editing agent with 6 tools (Read, Edit, Write, Glob, Grep, LS). Reads the spec and scaffold, then implements the game logic. Runs in `permissionMode: "acceptEdits"` so edits are auto-approved. Limited to 12 turns and 45 seconds.
- **`eval_repair`** — Same tools as the builder but receives eval failure context. Makes minimum changes to fix failing checks. Limited to 6 turns and 30 seconds.

### Core SDK wrapper

All agent calls go through a single `runClaudeQuery()` function that handles:

- Streaming messages via the SDK's async iterator (`for await (const message of queryRun)`)
- Timeout enforcement via `AbortController`
- Message summarization into `AgentEventSummary` objects for the UI trace
- Result extraction: session ID, cost, turn count, stop reason, permission denials

### Key files

- `src/worker/harness.ts` — Agent definitions (lines 65-90), `runClaudeQuery()` (lines 364-431), planner call (lines 512-546), builder call (lines 548-590)
- `src/worker/jsonSchemas.ts` — JSON Schema objects passed to the SDK's `outputFormat` for structured output
- `src/types.ts` — `AgentRunSummary` (lines 53-60), `AgentEventSummary` (lines 62-66)

---

## 2. Proxy Eval Suite

The system cannot run Roblox games to verify them, so it uses static analysis checks that act as proxies for "would this game actually work?" These run in real-time before returning results to the user.

### Three evals

**Artifact eval (30 points)** — Structural integrity check:

- Are all 6 required files present in the bundle?
- Does `GameSpec.json` validate against the Zod schema?
- Are fixed scaffold files byte-identical to the template (SHA-256 checksum)?
- Are editable boundaries respected (only 3 files marked editable)?

All four checks must pass. This is a pure deterministic eval with no LLM involvement.

**Roblox eval (30 points)** — Roblox-specific code quality check:

- Server/client split: both Luau files must call `game:GetService` and have `return` statements
- No banned APIs: scans for `HttpService:GetAsync`, `loadstring(`, `os.execute(`, etc.
- Contract exports: server must define `MechanicServer.start`, client must define `MechanicClient.start`
- Social signals: regex scan for keywords like `friend`, `party`, `social`, `team`, `emote`

All four checks must pass. Also deterministic with no LLM involvement.

**Judge eval (40 points)** — Qualitative assessment using Claude as a judge:

- Calls Claude Sonnet via the Agent SDK with `json_schema` output format
- Scores four dimensions 1-5: `robloxFit`, `promptFidelity`, `socialLoopQuality`, `clarity`
- The average is normalized to 40 points: `Math.round((average / 5) * 40)`
- Receives the roblox eval results as input so the judge has grounded evidence
- 20-second timeout with a deterministic fallback that uses heuristic scoring based on prompt-token matches, social signal count, and remote event presence

### Eval orchestration and repair flow

The three evals run sequentially (roblox results feed into the judge). If artifact or roblox evals fail, a repair pass is triggered:

```
build → eval → pass? → done
               fail? → repair agent → re-eval → pass? → done
                                                fail? → deterministic fallback → done
```

Every generation always completes. The repair agent gets the eval failure JSON as context.

### Key files

- `src/evals/artifactEval.ts` — Artifact eval implementation
- `src/evals/robloxEval.ts` — Roblox eval implementation
- `src/evals/robloxJudgeEval.ts` — Judge eval with Claude call and deterministic fallback
- `src/evals/robloxRunEvals.ts` — Orchestrator that runs all three and computes `summaryScore`
- `src/worker/constants.ts` — `REQUIRED_ARTIFACT_FILES`, `EDITABLE_ARTIFACT_FILES`, `FORBIDDEN_LUA_PATTERNS`
- `src/types.ts` — `ArtifactEvalResult` (lines 68-76), `RobloxEvalResult` (lines 78-86), `RobloxJudgeEvalResult` (lines 88-95), `RobloxEvalSuiteResult` (lines 97-102)

---

## 3. Roblox Game Generation

The system generates Roblox game projects using a fixed scaffold with constrained editable files. This is not a free-form code generator — it operates within a tight sandbox that the eval suite can verify.

### Scaffold structure

The template lives at `src/worker/template/` and contains 6 files:

| File | Editable | Purpose |
|------|----------|---------|
| `default.project.json` | No | Rojo config mapping folders to Roblox services |
| `README.generated.md` | No | Documentation for the generated project |
| `src/server/Mechanic.server.luau` | Yes | Server-side game logic |
| `src/client/Mechanic.client.luau` | Yes | Client-side game logic |
| `src/shared/GameSpec.json` | Yes | The game design specification |
| `src/shared/MechanicContract.luau` | No | Fixed API contract both sides must implement |

### Rojo file mapping

`default.project.json` maps the file system to the Roblox data model:

- `src/server/` → `ServerScriptService` (runs on server only)
- `src/client/` → `StarterPlayerScripts` (runs on each player's client)
- `src/shared/` → `ReplicatedStorage` (visible to both server and client)

### The contract pattern

`MechanicContract.luau` is immutable and defines:

- `remoteEventName = "SocialLoopEvent"` — the single communication channel
- `requiredServerExports = { "start" }` — server must export `MechanicServer.start()`
- `requiredClientExports = { "start" }` — client must export `MechanicClient.start()`

Using a single `RemoteEvent` is a deliberate constraint. It forces the agent to multiplex via payload types (`payload.kind`), simplifies eval verification, reduces the security surface, and keeps the contract checksummable.

### RobloxGameSpec

The planner agent outputs a structured spec with fields: `title`, `experienceType` (hangout, social-sim, obby, minigame, tycoon-lite), `fantasy`, `coreLoop`, `socialLoop`, `progressionHook`, `serverAuthoritativeRules`, `clientFeedback`, `worldObjects`, and `acceptanceTests`. This spec is written to `GameSpec.json` and guides the builder agent.

### Deterministic fallback generation

When agents fail, `fallback.ts` generates working code deterministically:

- `deriveRobloxSpecFromPrompt()` — Keyword heuristics to infer experience type and generate a spec
- `materializeFallbackProject()` — Template-based Luau generation using string interpolation. Creates a RemoteEvent, tracks player state, handles rewards, and implements a basic social pulse loop. Designed to always pass evals.

### Key files

- `src/worker/template/` — All 6 scaffold template files
- `src/worker/workspace.ts` — `createRunWorkspace()`, `loadArtifactBundle()`, `writeSpecToWorkspace()`, `getFixedScaffoldChecksum()`
- `src/worker/fallback.ts` — `deriveRobloxSpecFromPrompt()`, `materializeFallbackProject()`, `renderServerScript()`, `renderClientScript()`
- `src/worker/constants.ts` — File lists and forbidden Lua patterns
- `src/types.ts` — `RobloxGameSpec` (lines 27-38), `ArtifactBundle` (lines 47-51), `ArtifactFile` (lines 40-45)

---

## 4. Convex — State and Orchestration

Convex serves as both the database and the orchestration layer. It owns the generation lifecycle, persists all artifacts and traces, and provides real-time subscriptions to the frontend.

### Schema (4 tables)

| Table | Purpose | Key fields |
|-------|---------|------------|
| `generations` | One row per prompt-to-game run | `prompt`, `status`, `spec`, `artifactBundle`, `summaryScore` |
| `agentRuns` | One row per Claude SDK session | `sessionId`, `model`, `numTurns`, `totalCostUsd`, `permissionDenials` |
| `agentEvents` | Trace messages from each agent run | `type`, `summary`, `payload` |
| `evalRuns` | Individual eval results | `type` (artifact/roblox/judge), `status`, `result` |

All tables are linked by `generationId`. `agentRuns`, `agentEvents`, and `evalRuns` have `by_generation` indexes for efficient lookups.

### Convex function types

Convex enforces a strict separation between pure database operations and side effects:

- **`mutation`** — Transactional, deterministic writes. No HTTP calls, no file I/O. Replayable. Example: `enqueueGeneration()` inserts a row and schedules the pipeline.
- **`internalMutation`** — Same as mutation but not callable from the frontend. Example: `updateGeneration()`, `saveAgentRun()`, `saveEvalResult()`.
- **`query`** — Reactive reads that auto-push updates to subscribed UI components. Example: `listGenerations()`, `getGeneration()`.
- **`internalAction`** — Can perform side effects (HTTP calls to the worker) but must call mutations to persist data. Example: `runPipeline()`.

### Pipeline orchestration

`runPipeline` is an `internalAction` that drives the full lifecycle:

1. Read generation row, set status → `expanding`
2. Set status → `building`
3. Call worker `POST /runs/materialize` → get spec + artifact bundle
4. Persist agent run + events via `saveAgentRun()` and `saveAgentEvents()`
5. Set status → `evaluating`, persist initial artifact bundle
6. Call worker `POST /runs/evaluate` → get eval results (may include repair)
7. Persist 3 eval result rows (artifact, roblox, judge)
8. Set status → `done` with final scores

If anything throws, the catch block sets status → `failed` with the error message and failure stage.

### Real-time UI updates

`ctx.scheduler.runAfter(0, ...)` triggers the pipeline asynchronously after `enqueueGeneration()` returns. The frontend subscribes to `getGeneration()` which re-fires on every mutation to the generation row, giving real-time status updates with no websocket setup.

### JSON storage pattern

Complex objects like `spec`, `artifactBundle`, and eval `result` are stored as `v.string()` containing JSON, not as nested Convex objects. This keeps the schema flat and avoids Convex's nested object validation limitations.

### Key files

- `convex/schema.ts` — Table definitions with indexes
- `convex/generations.ts` — All mutations, queries, and the `runPipeline` action
- `src/worker/workerClient.ts` — HTTP client that Convex uses to call the worker (180s timeout for generation, 120s for materialize/evaluate)

---

## 5. Context Management and Security

The system implements defense-in-depth to sandbox the Claude agent, preventing it from accessing secrets, escaping the workspace, or modifying protected files.

### Layer 1: Workspace isolation

Each generation gets an isolated directory at `.context/runs/<generationId>/workspace/`. The `createRunWorkspace()` function deletes any previous workspace for that ID, creates a fresh directory, and copies the template into it. The agent only ever sees files inside this workspace. When done, files are collected into an `ArtifactBundle` and persisted to Convex — the workspace is ephemeral.

### Layer 2: Run ID validation

The generation ID itself is validated to prevent path traversal attacks:

- **Character whitelist**: only `A-Za-z0-9._-` (no slashes, no special characters)
- **Resolved path check**: after `path.resolve()`, the result must still be inside the runs directory
- **`isPathWithinDirectory()`**: reusable guard that checks `path.relative()` doesn't start with `..`

A malicious ID like `../../etc/passwd` is caught at multiple levels.

### Layer 3: Tool policy enforcement via hooks

`createWorkspaceHooks()` registers a `PreToolUse` hook that intercepts every tool call the Claude agent makes. Two policy checks run on every call:

**`pathViolatesPolicy()`** (all tools):

- Blocks `.env` files — prevents secret leakage
- Blocks `.git` paths — prevents repo metadata access
- Blocks `..` path traversal
- Verifies the resolved path is within the workspace directory

**`editViolatesPolicy()`** (mutating tools only — Edit, Write, NotebookEdit):

- Resolves the target file to a relative path within the workspace
- Checks it against the editable file set (only 3 files)
- Denies edits to any other file

Additionally, `Bash` and `WebFetch` tools are completely denied at the `disallowedTools` level — the agent cannot run shell commands or make HTTP requests.

### Path input extraction

`getPathInputs()` recursively walks the tool input object, finding any key named `path` or ending in `_path`. This catches path arguments regardless of which tool is being called or how the input is structured.

### Key files

- `src/worker/workspace.ts` — `createRunWorkspace()` (lines 38-48), `loadArtifactBundle()` (lines 100-110), `getFixedScaffoldChecksum()` (lines 120-132)
- `src/lib/runId.ts` — `isValidRunId()`, `resolveRunDir()`, `isPathWithinDirectory()`
- `src/worker/harness.ts` — `pathViolatesPolicy()` (lines 255-275), `editViolatesPolicy()` (lines 277-307), `createWorkspaceHooks()` (lines 320-362)

---

## 6. Worker HTTP Server

The worker is a stateless HTTP server that acts as the execution boundary. It owns the Anthropic API key, workspace file I/O, and Claude Agent SDK calls. Convex treats it as a black-box service.

### Endpoints

| Method | Path | Handler | Timeout |
|--------|------|---------|---------|
| POST | `/runs/materialize` | `materializeRobloxRun()` | 120s |
| POST | `/runs/generate` | `generateRobloxRun()` | 180s |
| POST | `/runs/evaluate` | `evaluateRobloxRun()` | 120s |

All requests are validated with Zod schemas before processing. Errors include a `failureStage` field so the caller knows where things went wrong.

### Deployment boundary

The worker is designed to be independently deployable. It communicates with Convex only via the HTTP interface defined in `workerClient.ts`. In production, it could move to Fly.io or Docker without changing the Convex orchestration layer.

### Key files

- `src/worker/server.ts` — HTTP server with endpoint routing and Zod validation
- `src/worker/workerClient.ts` — Client used by Convex to call the worker, with per-endpoint timeouts
- `src/worker/errors.ts` — `HarnessStageError` class for typed failure reporting

---

## 7. Fallback Architecture

The system is designed to never fail silently. At every stage where an LLM call might fail, a deterministic fallback exists:

| Stage | LLM path | Fallback |
|-------|----------|----------|
| Spec planning | Claude planner agent | `deriveRobloxSpecFromPrompt()` — keyword heuristics |
| Scaffold authoring | Claude builder agent | `materializeFallbackProject()` — template Luau code |
| Eval repair | Claude repair agent | `materializeFallbackProject()` again |
| Judge scoring | Claude judge call | `createFallbackJudgeResult()` — heuristic scoring |

Fallback usage is always recorded as an event with type `"fallback"` so it's visible in the UI trace. This means every generation completes — the system degrades gracefully rather than failing catastrophically.

### Key files

- `src/worker/fallback.ts` — Deterministic spec and Luau generation
- `src/evals/robloxJudgeEval.ts` — `createFallbackJudgeResult()` (lines 46-124)
- `src/worker/harness.ts` — `createFallbackEvent()` (lines 176-185), `createFallbackAgentRun()` (lines 187-199)

---

## 8. Benchmark Runner

The `pnpm benchmark` command runs the full pipeline against a curated dataset to measure and track quality over time.

### How it works

1. Loads test cases from `src/evals/datasets/roblox-social-v1.json` (12 prompts with expected focus areas)
2. Runs each through the complete harness pipeline (planner → builder → evals)
3. Calculates `averageScore` and `passRate` from the eval results
4. Writes a timestamped JSON report to `.context/benchmarks/`
5. Compares the new average score with the most recent previous benchmark
6. Reports the score delta to detect regressions or improvements

### Key files

- `src/benchmark/runBenchmark.ts` — Dataset runner
- `src/benchmark/benchmarkReport.ts` — Report generation and comparison
- `src/evals/datasets/roblox-social-v1.json` — Curated test dataset

---

## 9. Schema Validation at Every Boundary

The codebase uses a triple-schema pattern to maintain type safety across process boundaries:

| Format | Purpose | Used by |
|--------|---------|---------|
| TypeScript `interface` | Compile-time type checking | All source files |
| Zod schema | Runtime validation at API boundaries | Worker requests/responses, Convex I/O, UI parsing |
| JSON Schema object | Claude SDK `outputFormat` for structured output | Planner and judge agent calls |

The same logical type (e.g., `RobloxGameSpec`) is defined in three places because each consumer needs a different format. TypeScript interfaces can't validate at runtime, Zod can't be passed to the Claude SDK, and JSON Schema objects don't provide TypeScript types.

### Key files

- `src/types.ts` — TypeScript interfaces (single source of truth)
- `src/lib/schemas.ts` — Zod schemas mirroring the interfaces
- `src/worker/jsonSchemas.ts` — JSON Schema objects for Claude SDK

---

## 10. Generation State Machine

Each generation progresses through a well-defined lifecycle:

```
queued → expanding → building → evaluating → done
                                              ↓
                                            failed
```

Each transition is a Convex mutation that patches the `status` field. The UI subscribes to the generation query and updates in real-time as the status changes.

When a generation fails, `failureStage` records exactly where: `setup`, `expanding`, `building`, or `evaluating`. This makes debugging straightforward — you know which stage broke and can look at the corresponding agent events.

### Key files

- `convex/generations.ts` — Status transitions in `runPipeline` (lines 207-375)
- `src/types.ts` — `GenerationStatus` (lines 156-162), `GenerationFailureStage` (lines 164-168)

---

## 11. Agent Observability

Every Claude SDK interaction is fully persisted for debugging and cost tracking:

**Agent runs** (`agentRuns` table):

- `sessionId` — Claude SDK session identifier
- `model` — Which model was used
- `numTurns` — How many turns the agent took
- `totalCostUsd` — API cost for the run
- `stopReason` — Why the agent stopped (success, timeout, error)
- `permissionDenials` — Any tool calls that were blocked by hooks

**Agent events** (`agentEvents` table):

- `tool_use_summary` — What each tool call did
- `tool_progress` — Long-running tool status
- `task_progress` / `task_started` — Agent planning updates
- `result` — Final outcome with turn count
- `fallback` — Records when a deterministic fallback was used

The UI renders these as a trace timeline for each generation, making it possible to understand exactly what the agent did, what it tried to do that was denied, and how much it cost.

### Key files

- `convex/schema.ts` — `agentRuns` and `agentEvents` table definitions (lines 52-77)
- `convex/generations.ts` — `saveAgentRun()` (lines 120-140), `saveAgentEvents()` (lines 142-163)
- `src/worker/harness.ts` — `summarizeMessage()` (lines 103-160) converts SDK messages to event summaries
