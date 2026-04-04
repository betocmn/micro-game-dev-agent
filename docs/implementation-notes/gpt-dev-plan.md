# GPT Dev Plan

## Goal

Build a small but defensible "3 Words to Game" MVP in 2-3 hours that demonstrates the parts of Lemonade's stack worth discussing:

- a TypeScript agent harness with two chained steps
- an OpenRouter-backed LLM adapter configured from `.env`
- Convex as the system of record and real-time UI backbone
- one automated eval that proves generated games at least boot and do not immediately crash

The point of this MVP is not "best game generator." The point is to expose the engineering loop:

`prompt -> structured intent -> mechanic code -> compiled game -> stored artifacts -> reactive UI -> eval result`

## Why this scope

The original idea is directionally right, but a full agent chain + Convex app + three evals is too much for one focused session if we also want clean code and a usable demo.

For the first pass, we should optimize for:

- seeing the core agent orchestration in code
- seeing Convex updates flow into the UI without polling
- having at least one concrete eval signal to talk about
- leaving clean seams for more evals and more sophisticated agent behavior

## Architecture for the MVP

### Core flow

1. User enters a short prompt such as `space dodge rocks`.
2. Frontend calls a Convex action to start a generation run.
3. The action invokes a local TypeScript harness with two steps:
   - `expandIntent`: turn vague prompt into structured JSON
   - `buildMechanic`: turn JSON spec into constrained mechanic code
4. A deterministic compile step inserts that mechanic code into a fixed game shell and produces a single self-contained HTML game.
5. The action saves step-by-step progress back into Convex.
6. The UI subscribes to the run list and updates in real time.
7. After game HTML is generated, a simple runtime eval executes and stores its result.
8. The user can open the latest run and play the game in an iframe.

### Deliberate constraints

- Single game file output: one HTML document with inline JS and CSS
- The model only generates the mechanic layer, not the whole app shell
- Only simple mechanics: movement, collision, score, restart
- No asset pipeline, no external libraries in the game output
- One generation at a time in the UI
- One essential eval in the first pass, not a full eval platform

## Proposed PR split

## PR 1 - Agent Harness Vertical Slice

### Outcome

A local TypeScript harness can turn a vague prompt into:

- a structured game spec JSON document
- a mechanic module string
- a playable `game.html` string compiled from a fixed shell

This is the smallest piece that shows the core Lemonade problem: interpreting underspecified intent and turning it into a concrete, testable artifact.

### What to build

- Scaffold a TypeScript app with a minimal `src/agent` and `src/llm` area.
- Define a `GameSpec` schema with fields like:
  - `title`
  - `genre`
  - `playerMechanic`
  - `obstacles`
  - `goal`
  - `loseCondition`
  - `visualStyle`
  - `controls`
- Add an `OpenRouterClient` configured from `.env`.
- Implement `expandIntent(prompt): Promise<GameSpec>`.
- Implement `buildMechanic(spec): Promise<string>`.
- Implement `compileGame(spec, mechanicCode): string`.
- Add a small CLI script so the harness can be run without the UI during development.
- Save generated artifacts locally during development for quick inspection.

### Implementation notes

- Use OpenRouter for all model calls and keep the model name configurable.
- Default to a Claude model via OpenRouter if available so the behavior stays close to Lemonade's public framing.
- Put the LLM-specific code behind a thin adapter so we can swap providers or models without rewriting the pipeline.
- Force structured output for the spec step.
- Give the builder a fixed engine shell and ask it to generate only the mechanic layer.
- Add a small browser-visible eval hook such as `window.__gameEval` to the shell so runtime checks are easier later.
- Keep prompts in versioned files, not inline blobs, so they are easy to discuss and iterate on.

### Why this PR matters

This is the part most directly aligned with the job ad:

- intent recovery from bad prompts
- own harness rather than "just call an API"
- steerability via prompts and output contracts

### Timebox

About 60-75 minutes.

### Definition of done

- Running one command with `space dodge rocks` produces:
  - a valid spec JSON
  - mechanic code that fits the shell contract
  - a self-contained HTML game
- At least one sample generation is playable in a browser

## PR 2 - Convex-Backed Runs + Reactive Viewer

### Outcome

The harness is no longer just a CLI. A user can submit a prompt from a small web UI, Convex stores the run, and the UI updates as the pipeline progresses.

This is the part that makes the demo feel like a real product instead of a script.

### What to build

- Set up Convex schema for `generationRuns`.
- Store:
  - original prompt
  - current status
  - expanded spec
  - generated mechanic code
  - generated HTML
  - timestamps
  - lightweight step logs
- Add a Convex action `generateGameFromPrompt`.
- Add mutations/internal helpers to update run state after each stage.
- Build a tiny React UI with:
  - prompt input
  - runs list
  - status badges
  - spec viewer
  - iframe preview for the generated game
- Use Convex subscriptions so runs update live without polling.

### Suggested data model

One `generationRuns` document is enough for the MVP:

- `prompt: string`
- `status: "queued" | "expanding" | "building" | "evaluating" | "ready" | "failed"`
- `specJson?: string`
- `mechanicCode?: string`
- `gameHtml?: string`
- `runtimeEval?: { passed: boolean; errors: string[] }`
- `stepLogs?: Array<{ stage: string; message: string; at: number }>`

If we want cleaner modeling later, we can split evals into a separate table.

### Why this PR matters

This is the Convex story you can talk through:

- actions for long-running work
- mutations for persisted state transitions
- subscriptions for reactive UI
- no ad hoc polling or custom websocket work

### Timebox

About 45-60 minutes.

### Definition of done

- Typing a prompt in the UI creates a run
- The run status visibly transitions in the UI
- A finished run shows the generated spec and playable game

## PR 3 - First Eval + Demo Polish

### Outcome

Each generation gets a minimal but real evaluation result, which makes the system feel engineered rather than toy-like.

### What to build

- Add a runtime eval that checks whether the generated game boots without obvious JS failures.
- Use Playwright for browser automation so later interaction evals can reuse the same setup.
- Run the eval after `compileGame` completes.
- Store eval output in Convex and display it in the UI.
- Add one or two curated sample prompts for fast demoing.
- Add a short README section explaining the pipeline and tradeoffs.

### Eval choice for this session

Start with the cheapest eval that still tells us something:

- Load the generated HTML in a headless browser.
- Fail if there are uncaught exceptions or console errors during startup.
- Verify that `window.__gameEval.ready === true`.
- Optionally verify that a `canvas` exists and at least one animation frame occurs.

This is much more realistic for the time budget than trying to finish:

- LLM-as-judge spec scoring
- random-input survival testing
- side-by-side generation comparisons

Those are good follow-ups, but not first-session requirements.

### Why this PR matters

This gives you a concrete talking point for the founder:

- even in a tiny prototype, evals changed how we judged output quality
- code generation alone is not enough
- game-output systems need runtime checks, not just text-based confidence

### Timebox

About 30-45 minutes.

### Definition of done

- Every completed run has an eval result
- Failed games are visibly marked
- The demo has enough polish to walk someone through it live

## What we are intentionally not building in the first 2-3 hours

- multi-agent branching or retries
- screenshot-conditioned prompting
- multiple eval types
- ranking generations against each other
- auth, multiplayer, or sharing
- Fly or Docker deployment
- generating an entire HTML game from scratch with no fixed shell

Those are legitimate next steps, but they dilute the learning value of the first session.

## Recommended order of execution

1. Build PR 1 first and do not touch Convex until the harness works locally.
2. Add PR 2 once the harness can reliably produce a spec and HTML game.
3. Add PR 3 only after the UI loop is functioning end to end.

This order reduces risk because it keeps each layer testable in isolation.

## What this MVP will let you talk about

- how you structured the agent harness around explicit intermediate artifacts
- why Convex is useful when agent work produces multiple state transitions
- where evals start paying off immediately
- what you would measure next if you were turning this into the real product

## Follow-up PRs after the MVP

If the first session goes well, the next meaningful extensions are:

1. Add an LLM-as-judge spec adherence eval with structured scoring.
2. Add a random-input interaction eval in headless browser automation.
3. Add prompt and generation trace inspection so prompt changes are easier to compare.
4. Add retries or repair prompts when runtime eval fails.
5. Add screenshot or image reference input to better match Lemonade's real use case.

## Recommended framing when discussing it

The strongest framing is not "I built a game generator." It is:

"I built a small vertical slice to pressure-test the hardest parts of your stack: recovering intent from weak prompts, keeping intermediate artifacts explicit, using Convex for reactive progress, and starting with evals that test real runtime behavior."

That framing maps closely to the job description and makes the project sound like an engineering probe rather than a demo gimmick.
