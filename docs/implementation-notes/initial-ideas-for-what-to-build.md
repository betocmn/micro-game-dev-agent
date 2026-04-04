Yes — your instinct is right, but I’d make it a bit more **production-shaped**.

For a 4–6 hour build, I would **keep the browser-game idea**, not Roblox, because it lets you exercise the same hard problems much faster: vague intent, context shaping, long-horizon generation, automated evals, and reactive workflow orchestration. I’d still mirror their public stack closely: **TypeScript + Convex + Claude Agent SDK + Playwright + Docker/Fly-ready worker shape**. Anthropic’s Agent SDK is explicitly “Claude Code as a library,” with the same agent loop, tools, and context management; Convex is built for reactive UIs plus scheduled actions; and Playwright is positioned for testing, tracing, parallelism, and even AI-agent workflows. ([Claude API Docs][1])

The one big change I’d make to your draft: **don’t let the model generate a whole game from scratch**. Give it a **fixed engine shell** and ask it to generate only the **mechanic layer**. That gives you much cleaner evals and failure analysis. Anthropic’s own eval guidance emphasizes defining specific, measurable success criteria first; a fixed shell makes that much easier than letting the model freestyle HTML/JS boilerplate every run. ([Claude API Docs][2])

## The MVP I’d actually build

Call it **“3 Words to Game”**.

A user types `space dodge rocks`. The system:

1. expands that into a structured spec
2. generates a constrained mechanic module
3. compiles it into a playable HTML5 canvas game
4. runs 3 evals
5. shows the game, eval results, and artifacts in a tiny realtime UI

That’s close enough to Lemonade’s job ad to be useful, and small enough to finish.

## The exact architecture

### 1) UI + durable workflow

Use a tiny Next.js app with Convex. The frontend should do only one thing: submit a prompt and subscribe to generation updates. Convex is automatically reactive for query-backed UIs, and Convex itself recommends recording user intent in a mutation and then scheduling work, rather than calling long-running actions directly from the client. Scheduled mutations are exactly-once; scheduled actions are at-most-once, so for the MVP I’d keep the workflow idempotent and allow reruns. ([Convex Developer Hub][3])

Use this shape:

```txt
/web
  app/page.tsx
  app/g/[id]/page.tsx

/convex
  schema.ts
  generations.ts
  evalRuns.ts

/src
  pipeline/runGeneration.ts
  agents/expandIntent.ts
  agents/buildMechanic.ts
  compile/compileGame.ts
  evals/runtimeEval.ts
  evals/interactionEval.ts
  evals/judgeEval.ts
  prompts.ts
  types.ts
```

### 2) Data model

Keep it simple:

```ts
// generations
{
  _id,
  createdAt,
  prompt,                 // "space dodge rocks"
  status,                 // queued | expanding | building | evaluating | done | failed
  spec,                   // structured JSON
  mechanicCode,           // generated JS/TS snippet
  html,                   // final compiled HTML string
  summaryScore,           // 0-100
  runtimePass,            // bool
  interactionPass,        // bool
  judgeScore,             // 0-100
  notes,                  // final summary
  screenshotStorageId?,   // optional
  traceStorageId?         // optional
}

// evalRuns
{
  _id,
  generationId,
  type,                   // runtime | interaction | judge
  status,                 // queued | running | done | failed
  result                  // JSON blob
}
```

For speed, store `html` directly in the DB and render it in an iframe using `srcDoc`. If you want persistent artifacts like screenshots or Playwright traces, Convex File Storage can store generated files and serve them back via URLs. ([Convex Developer Hub][4])

### 3) Convex workflow

Use this exact flow:

* `enqueueGeneration(prompt)` mutation
  inserts a generation row with `status: "queued"`
  then schedules `internal.generations.runPipeline({ generationId })`

* `runPipeline` action
  calls `expandIntent`
  saves `spec`
  calls `buildMechanic`
  compiles to `html`
  schedules evals
  updates status as it goes

That flow maps nicely to Convex’s recommended split: mutations/queries for durable state, actions for external nondeterministic work like calling AI APIs. Convex’s docs explicitly say to keep actions small and keep most important logic in queries/mutations for scale. ([Convex Developer Hub][5])

## The generation pipeline

### Agent A — Intent Expander

This one should be a **structured-output** model call, not a freeform agent.

Prompt idea:

```txt
System:
You interpret vague teenager prompts into a minimal browser-game spec.
Assume the user is underspecified, not confused.
Stay inside a tiny 2D game space.
Prefer one primary mechanic over many.
Return JSON only.

Allowed genres:
- dodge
- collect
- survive
- platform

Schema:
{
  "title": string,
  "genre": "dodge" | "collect" | "survive" | "platform",
  "theme": string,
  "playerGoal": string,
  "controls": string[],
  "entities": [{ "name": string, "role": "player" | "enemy" | "pickup" | "hazard" }],
  "coreLoop": string,
  "winCondition": string,
  "loseCondition": string,
  "scoreRule": string,
  "visualStyle": string,
  "acceptanceTests": string[]
}
```

Example input: `space dodge rocks`

Expected output:

```json
{
  "title": "Asteroid Escape",
  "genre": "dodge",
  "theme": "spaceship avoiding asteroids in space",
  "playerGoal": "survive as long as possible while dodging falling rocks",
  "controls": ["left", "right"],
  "entities": [
    { "name": "ship", "role": "player" },
    { "name": "asteroid", "role": "hazard" }
  ],
  "coreLoop": "move horizontally to avoid incoming asteroids",
  "winCondition": "no hard win; survive and maximize score",
  "loseCondition": "collision with asteroid",
  "scoreRule": "score increases over time survived",
  "visualStyle": "arcade neon space",
  "acceptanceTests": [
    "player can move left and right",
    "asteroids fall from top of screen",
    "collision ends run",
    "score increases while alive"
  ]
}
```

### Agent B — Mechanic Builder

This is where I’d use the **Claude Agent SDK** or at least mirror its style. The SDK is specifically for programmable agent loops with built-in tools and the same context management as Claude Code. ([Claude API Docs][1])

But do **not** ask it to write a whole game from zero.

Instead, give it a fixed scaffold:

```html
<!-- engine shell -->
<canvas id="game" width="800" height="600"></canvas>
<script>
  const state = {
    tick: 0,
    score: 0,
    running: true,
    player: {},
    entities: []
  };

  window.__gameEval = {
    ready: false,
    snapshot() {
      return JSON.parse(JSON.stringify(state));
    }
  };

  function setupBaseUI() { /* fixed */ }
  function loop() { /* fixed RAF loop calls update/render */ }

  // ===== AGENT INSERTS ONLY THESE =====
  function initMechanic(state) {}
  function updateMechanic(state, input) {}
  function renderMechanic(ctx, state) {}
  // ====================================

  initMechanic(state);
  window.__gameEval.ready = true;
  console.log("GAME_READY");
  loop();
</script>
```

Then the builder prompt becomes:

```txt
You are implementing only the mechanic layer for a tiny 2D canvas game.

You must output valid JavaScript for exactly these functions:
- initMechanic(state)
- updateMechanic(state, input)
- renderMechanic(ctx, state)

Hard constraints:
- no external libraries
- no network access
- no DOM outside the given canvas and fixed score UI
- must update state.score if score is relevant
- must keep state serializable
- must work with keyboard controls only
- collision logic must be explicit
- lose condition must set state.running = false
```

This is a much better interview artifact than full freeform HTML because it makes the **context layer** obvious: the model sees the shell, state contract, allowed mechanic space, and spec.

### Compile step

A deterministic step stitches the scaffold + mechanic code into a final `html` string. That’s important: not every improvement has to come from the model. Anthropic’s own prompt-engineering docs explicitly note that not every failing eval should be solved with prompt engineering; sometimes the right fix is elsewhere in the system. ([Claude API Docs][6])

## The eval layer

This is the most important part.

I’d use **Playwright**, not Puppeteer, unless you already have Puppeteer muscle memory. Playwright’s official docs lean harder into test reliability, tracing, parallelism, and AI-agent use cases, which makes it a better fit for the story you want to tell. ([Playwright][7])

### Eval 1 — Runtime sanity

Goal: did the game load and initialize?

Implementation:

* `page.setContent(html)`
* collect `pageerror` and console errors
* wait up to 3 seconds for `window.__gameEval.ready === true`
* call `window.__gameEval.snapshot()`
* take a screenshot

Pass if:

* no uncaught page errors
* `GAME_READY` logged
* snapshot exists
* canvas rendered without crash

Store:

```json
{
  "pass": true,
  "errors": [],
  "readySeen": true,
  "snapshot": {...},
  "screenshotPath": "..."
}
```

### Eval 2 — Interaction survival

Goal: does it behave under input, not just compile?

Implementation:

* run deterministic key sequence:

  * left 1s
  * right 1s
  * mash arrows for 10s
* sample `snapshot()` every second
* compare first/last snapshots

Pass if:

* tick increased
* either score changed, or player/entity positions changed meaningfully
* no crash for 15s
* lose condition or survival loop behaves consistently

Store:

```json
{
  "pass": true,
  "durationMs": 15000,
  "framesObserved": 12,
  "stateChanged": true,
  "scoreChanged": true,
  "crashed": false
}
```

### Eval 3 — Spec-match judge

This is the LLM-as-judge eval.

Give Claude:

* original prompt
* expanded spec
* generated mechanic code
* runtime summary
* interaction summary

Ask it to score 1–5 for:

* genre match
* mechanic match
* win/lose condition
* controls
* visual/theme alignment
* overall coherence

Anthropic’s eval guidance is very explicit that you should define measurable criteria and then evaluate against them; this is the exact place to do it. ([Claude API Docs][2])

Prompt:

```txt
You are grading whether a generated game matches its intended spec.

Return JSON:
{
  "genreMatch": 1-5,
  "mechanicMatch": 1-5,
  "goalMatch": 1-5,
  "controlsMatch": 1-5,
  "coherence": 1-5,
  "summary": string,
  "criticalMisses": string[]
}
```

### Final score

Use a weighted score:

* runtime: 35%
* interaction: 35%
* judge: 30%

Hard fail if runtime fails.

That gives you a clean sentence in conversation:

> “I found the hardest part wasn’t generation — it was designing the eval contract so the artifact exposed enough state to judge automatically.”

That is exactly the kind of thing they’ll care about.

## The one trick that makes this MVP good

Make the generated game **self-instrumenting**.

Have every game expose:

```js
window.__gameEval = {
  ready: false,
  snapshot() { ... },
  metrics: {
    collisions: 0,
    pickups: 0,
    scoreTicks: 0
  }
};
```

That single decision turns flaky browser evals into structured product evals.

It also shows you understand something subtle: **you often need to shape the output so it becomes measurable**.

## What to run locally

Install:

```bash
pnpm add next react react-dom convex zod @anthropic-ai/sdk @anthropic-ai/claude-agent-sdk playwright
npx playwright install chromium
npx convex dev
```

Optional later:

```bash
pnpm add bullmq ioredis
```

That extra queue stack is not needed for tonight, but it’s the obvious next step if you want a more Fly-like worker setup.

## What I think their eval stack probably looks like

This part is **inference**, not something I could verify publicly.

### Very likely

They use **Convex as workflow/state glue**, not as the place where heavy browser eval work lives. Convex’s model strongly encourages keeping actions small and durable state in queries/mutations, which makes it a good orchestration layer for agent runs, results, and reruns. ([Convex Developer Hub][5])

They probably run heavier eval jobs on **Fly worker machines** or a parallel worker pool. Fly’s own queue guidance for Node points toward BullMQ with Redis/Valkey plus Machines for worker compute, especially when jobs are long-running and should not block web requests. That fits “thousands of playable simulations” very well. ([Fly.io][8])

They likely use a headless browser stack like **Playwright** for playable evals. That is inference, but it matches the job ad almost perfectly: visible, testable output, parallel runs, tracing, and AI-agent-adjacent browser automation. ([Playwright][7])

### Also likely

They probably use **Anthropic prompt caching** and maybe **Message Batches** for offline judge/eval sweeps. Anthropic explicitly supports both, and batching plus caching is designed to reduce cost and latency for repeated requests with shared prompt prefixes — exactly what an eval harness does. ([Claude API Docs][9])

They probably have **artifact/log streaming** into something like Axiom, Datadog, or PostHog, because Convex supports log streams to those destinations directly. That would be the natural place to inspect eval failures, latency, and pipeline regressions. ([Convex Developer Hub][10])

### Medium-confidence guess

They may use **vector search / embeddings** to cluster similar user intents or retrieve similar prior failures/examples. Convex has vector search built in, and the job ad’s language about understanding what creators “mean” from noisy input fits that pattern. This is a guess, not a verified part of their stack. ([Convex Developer Hub][11])

## Why this MVP is better than a pure demo

It gives you talking points on all the right surfaces:

* **orchestration**: why mutation → scheduled action → eval fan-out
* **context**: why constrained scaffold beats freeform generation
* **evals**: why runtime + interaction + judge is better than code review alone
* **product taste**: why vague prompts need interpretation before building
* **infra thinking**: what stays in Convex, what moves to workers, what gets logged

## The obvious v2

Once this works, the honest next step is not “build more game types.” It is:

> replace the browser-game compiler with a Roblox target

That path is much more real now because Roblox’s Studio MCP server is meant for AI coding tools to read game structure, edit scripts, insert models, and execute code. So the browser MVP is not a toy detour; it is a way to learn the eval/orchestration problem before paying the Roblox tax. ([Creator Hub][12])

## The sentence I’d use with Nicolas

> “I built a tiny version of the problem to pressure-test the eval loop. The interesting part wasn’t codegen — it was deciding what context to expose, forcing the artifact to emit measurable state, and separating runtime, behavioral, and judge-based evals. That made me think the moat is much more in workflow and eval quality than in raw generation.”

That would land well.

Next I can turn this into a single copy-paste build spec for Claude Code or Codex.

[1]: https://docs.anthropic.com/en/docs/claude-code/sdk "Agent SDK overview - Claude API Docs"
[2]: https://docs.anthropic.com/en/docs/build-with-claude/develop-tests "Define success criteria and build evaluations - Claude API Docs"
[3]: https://docs.convex.dev/realtime "Realtime | Convex Developer Hub"
[4]: https://docs.convex.dev/file-storage?utm_source=chatgpt.com "File Storage | Convex Developer Hub"
[5]: https://docs.convex.dev/tutorial/actions "Convex Tutorial: Calling External Services | Convex Developer Hub"
[6]: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview?utm_source=chatgpt.com "Prompt engineering overview - Claude API Docs"
[7]: https://playwright.dev/ "Fast and reliable end-to-end testing for modern web apps | Playwright"
[8]: https://fly.io/docs/blueprints/work-queues/ "Deferring long-running tasks to a distributed work queue · Fly Docs"
[9]: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching "Prompt caching - Claude API Docs"
[10]: https://docs.convex.dev/production/integrations/log-streams/ "Log Streams | Convex Developer Hub"
[11]: https://docs.convex.dev/search/vector-search?utm_source=chatgpt.com "Vector Search | Convex Developer Hub"
[12]: https://create.roblox.com/docs/studio/mcp?utm_source=chatgpt.com "Connect to the Roblox Studio MCP server | Documentation"
