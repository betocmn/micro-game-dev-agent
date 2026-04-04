# "3 Words to Game" — Dev Plan

A micro agent pipeline MVP that mirrors Lemonade's stack: TypeScript + Convex + LLM agents + automated evals.

User types "space dodge rocks" -> agent expands intent -> agent generates game mechanic code -> deterministic compile into playable HTML5 canvas game -> 3 automated evals score it -> real-time UI shows everything.

Status reviewed against the current repo on April 4, 2026.

## Current Status Summary

Legend:
- `done` = implemented in the current repo
- `partial` = implemented, but incomplete or not wired end to end
- `missing` = described here, but not implemented in the live app flow

Current reality:
- `done`: project scaffolding, OpenRouter-backed agent chain, fixed engine shell, Convex schema/mutations/queries, basic realtime frontend, standalone eval modules
- `partial`: Convex orchestration, eval surfacing in the UI, repo bootstrap and deployment readiness
- `missing`: live eval execution from the app, a browser-capable worker path for Playwright, some setup artifacts referenced by the README

## Architecture Overview

```
User prompt ("space dodge rocks")
  │
  ▼
┌─────────────────────┐
│  Convex mutation     │  enqueueGeneration() — inserts row, schedules action
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  Convex action       │  runPipeline() — orchestrates the chain
│                      │
│  ┌───────────────┐   │
│  │ Intent Expand  │   │  LLM call via OpenRouter — 3 words → structured GameSpec JSON
│  └───────┬───────┘   │
│          ▼           │
│  ┌───────────────┐   │
│  │ Mechanic Build │   │  LLM call — GameSpec → 3 JS functions (init/update/render)
│  └───────┬───────┘   │
│          ▼           │
│  ┌───────────────┐   │
│  │ Compile        │   │  Deterministic — stitches mechanic code into fixed engine shell
│  └───────┬───────┘   │
│          ▼           │
│  ┌───────────────┐   │
│  │ Eval Suite     │   │  3 evals: runtime sanity, interaction survival, LLM judge
│  └───────────────┘   │
└─────────────────────┘
          │
          ▼
┌─────────────────────┐
│  React frontend      │  Real-time subscriptions via Convex queries
│  - Prompt input      │  Game rendered in iframe via srcDoc
│  - Generation list   │  Eval scores displayed alongside
│  - Game player       │
└─────────────────────┘
```

Current implemented app flow:
- `done`: `enqueueGeneration()` inserts a row and schedules `runPipeline()`
- `done`: `runPipeline()` expands intent, builds mechanic code, compiles HTML, and persists progress
- `partial`: eval modules exist in `src/evals/`, but the Convex action does not run them, save their outputs, or keep the generation in an `evaluating` state
- `partial`: the frontend renders eval data if it exists, but normal app runs never populate those fields today

## Key Design Decisions

### Fixed engine shell (not freeform HTML generation) — `done`
The LLM generates only 3 functions: `initMechanic(state)`, `updateMechanic(state, input)`, `renderMechanic(ctx, state)`. A fixed HTML scaffold provides the canvas, game loop, input handling, and score UI. This means:
- Evals are reliable (same structure every time)
- Failures are analyzable (is it the mechanic logic or the boilerplate?)
- The "context layer" is explicit — the model sees the state contract and constraints

### Self-instrumenting games — `done`
Every game exposes `window.__gameEval = { ready, snapshot(), metrics }`. This lets Playwright-based evals read structured game state instead of pixel-diffing. The insight: **you often need to shape the output so it becomes measurable**.

### OpenRouter for LLM calls — `done`
All model calls go through OpenRouter (env var `OPENROUTER_API_KEY`). Default model: `anthropic/claude-sonnet-4`. This maps conceptually to what they'd do with the Claude Agent SDK — structured prompts, JSON output parsing, chained calls.

### Convex mutation → action → query pattern — `partial`
- **Mutations**: durable writes (insert generation, update status)
- **Actions**: nondeterministic work (LLM calls, browser evals)
- **Queries**: reactive reads (frontend subscribes, gets live updates)

This is Convex's recommended split. The frontend never polls — it subscribes to queries that automatically update when mutations fire. The missing part is that browser evals are not actually running from the live app yet, so the action layer currently covers only the LLM + compile stages.

## PR Breakdown

### PR 1: Project scaffolding — `done`
- `done`: Next.js + TypeScript + Convex + Tailwind project structure exists
- `done`: Convex schema includes `generations` and `evalRuns`
- `done`: TypeScript types cover `GameSpec`, eval results, and pipeline outputs
- `done`: fixed engine shell exists and is shared by the compile step
- `done`: directories for agents, compile, evals, pipeline, frontend, and Convex backend are present
- `partial`: fresh-repo bootstrap is not fully clean yet because this workspace has no `node_modules/`, `convex/_generated/` is absent, and `.env.local.example` is referenced in the README but not present

### PR 2: Agent pipeline — `done`
- `done`: OpenRouter client exists as a thin wrapper
- `done`: Agent A expands vague prompts into structured `GameSpec` JSON
- `done`: Agent B generates the three mechanic functions
- `done`: compile step stitches mechanic code into the fixed engine shell
- `done`: standalone pipeline orchestrator exists in `src/pipeline/runGeneration.ts`
- `partial`: Convex duplicates the pipeline logic inline instead of reusing the shared orchestrator, so contracts can drift over time

### PR 3: Convex backend — `partial`
- `done`: `enqueueGeneration(prompt)` mutation inserts a row and schedules work
- `partial`: `runPipeline(generationId)` action updates statuses and builds the game, but stops after compile and marks the generation `done`
- `done`: `listGenerations()` and `getGeneration(id)` queries support the realtime UI
- `done`: `saveEvalResult()` mutation exists
- `partial`: `saveEvalResult()` is never called, `evaluating` is never reached in normal app runs, and summary eval fields are never persisted

### PR 4: React frontend — `partial`
- `done`: main page has prompt input and realtime generation list
- `done`: detail page has game iframe, spec viewer, eval viewer, and code viewer
- `done`: minimal Tailwind styling is in place
- `partial`: eval-related UI mostly renders placeholders because the backend does not populate eval data during the live flow
- `partial`: rendering is still optimistic and loosely typed in a few places (`any`, inline `JSON.parse`), which is acceptable for an MVP but not yet robust

### PR 5: Eval layer — `partial`
- `done`: Eval 1 runtime sanity exists in Playwright
- `done`: Eval 2 interaction survival exists in Playwright
- `done`: Eval 3 spec-match judge exists via LLM-as-judge
- `done`: eval runner computes a weighted summary score
- `missing`: eval execution is not wired into the Convex app flow
- `missing`: eval results are not durably written back during normal app runs
- `missing`: a browser-capable worker path is not implemented even though the README correctly notes Playwright cannot run inside Convex cloud actions
