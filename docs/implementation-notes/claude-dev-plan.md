# "3 Words to Game" — Dev Plan

A micro agent pipeline MVP that mirrors Lemonade's stack: TypeScript + Convex + LLM agents + automated evals.

User types "space dodge rocks" -> agent expands intent -> agent generates game mechanic code -> deterministic compile into playable HTML5 canvas game -> 3 automated evals score it -> real-time UI shows everything.

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

## Key Design Decisions

### Fixed engine shell (not freeform HTML generation)
The LLM generates only 3 functions: `initMechanic(state)`, `updateMechanic(state, input)`, `renderMechanic(ctx, state)`. A fixed HTML scaffold provides the canvas, game loop, input handling, and score UI. This means:
- Evals are reliable (same structure every time)
- Failures are analyzable (is it the mechanic logic or the boilerplate?)
- The "context layer" is explicit — the model sees the state contract and constraints

### Self-instrumenting games
Every game exposes `window.__gameEval = { ready, snapshot(), metrics }`. This lets Playwright-based evals read structured game state instead of pixel-diffing. The insight: **you often need to shape the output so it becomes measurable**.

### OpenRouter for LLM calls
All model calls go through OpenRouter (env var `OPENROUTER_API_KEY`). Default model: `anthropic/claude-sonnet-4`. This maps conceptually to what they'd do with the Claude Agent SDK — structured prompts, JSON output parsing, chained calls.

### Convex mutation → action → query pattern
- **Mutations**: durable writes (insert generation, update status)
- **Actions**: nondeterministic work (LLM calls, browser evals)
- **Queries**: reactive reads (frontend subscribes, gets live updates)

This is Convex's recommended split. The frontend never polls — it subscribes to queries that automatically update when mutations fire.

## PR Breakdown

### PR 1: Project scaffolding
- Next.js + TypeScript + Convex + Tailwind
- Convex schema (generations + evalRuns tables)
- TypeScript types (GameSpec, EvalResult, etc.)
- Fixed engine shell HTML template
- Directory structure for agents, compile, evals, pipeline

### PR 2: Agent pipeline
- OpenRouter client (thin fetch wrapper)
- Agent A — Intent Expander: 3 words → GameSpec JSON
- Agent B — Mechanic Builder: GameSpec → 3 JS mechanic functions
- Compile step: mechanic code + engine shell → playable HTML
- Pipeline orchestrator: chains everything together

### PR 3: Convex backend
- `enqueueGeneration(prompt)` mutation
- `runPipeline(generationId)` action (calls agent pipeline, updates status)
- `listGenerations()` / `getGeneration(id)` queries
- `saveEvalResult()` mutation

### PR 4: React frontend
- Main page: prompt input + real-time generation list
- Detail page: game iframe + spec viewer + eval results + code viewer
- Minimal Tailwind styling

### PR 5: Eval layer
- Eval 1 — Runtime sanity: loads game in Playwright, checks for errors, verifies ready state
- Eval 2 — Interaction survival: simulates keyboard input for 12s, checks state changes
- Eval 3 — Spec-match judge: LLM scores the game against the spec (1-5 per dimension)
- Eval runner: orchestrates all 3, computes weighted summary score
- Wire into Convex action
