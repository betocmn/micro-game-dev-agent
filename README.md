# 3 Words to Game

Type a vague 3-word prompt like **"space dodge rocks"** and the app expands intent, generates mechanic code, compiles a playable HTML5 canvas game, and runs automated evals that score the result.

Built with Next.js, Convex, OpenRouter, and Playwright.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 App Router + Tailwind |
| Realtime backend | Convex mutations, queries, and actions |
| LLM | OpenRouter using `anthropic/claude-sonnet-4` |
| Evals | Playwright runtime and interaction evals + LLM judge |
| Validation | Zod |
| Linting | Biome |

## Architecture

- `Convex` owns generation state, persistence, and orchestration.
- `Next.js` renders the realtime UI and exposes a Node route handler at `src/app/api/evals/run/route.ts`.
- `Playwright` runs inside that browser-capable worker path, not inside Convex actions.
- `Convex` calls the worker after compile, then writes eval results back with `saveEvalResult()` and summary fields on the generation row.

This current route-handler worker is the demo path. The next production step is a dedicated Fly or Docker worker queue that reads jobs from Convex and writes results back.

## Prerequisites

- Node.js 20.9+
- [pnpm](https://pnpm.io/) (`corepack enable && corepack prepare pnpm@latest --activate`)
- A [Convex](https://www.convex.dev/) account
- An [OpenRouter](https://openrouter.ai/) API key

## Setup

1. **Clone and install dependencies**

   ```bash
   git clone <repo-url> && cd surat-v2
   pnpm install
   ```

2. **Install Playwright browsers**

   ```bash
   pnpm exec playwright install
   ```

3. **Configure local environment**

   ```bash
   cp .env.local.example .env.local
   ```

   Fill in:
   - `NEXT_PUBLIC_CONVEX_URL`
   - `OPENROUTER_API_KEY`
   - `EVAL_RUNNER_URL` only if you are not using the default local worker route

   Local development defaults `EVAL_RUNNER_URL` to `http://127.0.0.1:3000/api/evals/run`.

4. **Configure Convex env for actions**

   The Convex action also needs `OPENROUTER_API_KEY`. For hosted deployments it also needs `EVAL_RUNNER_URL`.

   ```bash
   pnpm convex env set OPENROUTER_API_KEY <your-key>
   pnpm convex env set EVAL_RUNNER_URL https://your-worker-host/api/evals/run
   ```

5. **Start local development**

   ```bash
   pnpm dev
   ```

   `pnpm dev` starts both `convex dev` and `next dev` for the demo flow.

6. Open [http://localhost:3000](http://localhost:3000), submit a prompt, and wait for the generation to move through `expanding`, `building`, `compiling`, and `evaluating`.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start local Convex + Next.js dev servers |
| `pnpm build` | Production build |
| `pnpm lint` | Run Biome checks |
| `pnpm lint:fix` | Auto-fix Biome issues |
| `pnpm test` | Run Vitest |
| `pnpm test:pipeline` | Run the standalone generation pipeline |
| `pnpm test:evals` | Run the standalone pipeline plus eval suite |

## Live Flow

1. `enqueueGeneration()` inserts a generation row with status `queued`.
2. `runPipeline()` advances through `expanding`, `building`, and `compiling` using the shared pipeline modules in `src/`.
3. Convex sets the generation to `evaluating` and calls the eval worker.
4. The worker runs runtime, interaction, and judge evals.
5. Convex persists each eval via `saveEvalResult()` and writes summary fields back onto the generation row.
6. The home page and detail page update automatically through Convex subscriptions.

## Worker Boundary

Playwright needs a browser-capable runtime, so it should not live inside Convex cloud actions.

Current demo path:
- `Convex action` orchestrates the job
- `Next.js route handler` runs Playwright and returns eval results
- `Convex mutation` stores the outputs

Recommended production path:
- `Convex` remains the source of truth for generation and eval job state
- `Fly` or `Docker` worker runs Playwright jobs
- worker writes results back into Convex

## Deployment

### Convex

Deploy the Convex backend separately:

```bash
pnpm convex deploy
```

Set these env vars on the deployment:
- `OPENROUTER_API_KEY`
- `EVAL_RUNNER_URL`

### Next.js

Deploy the Next.js app wherever you want to host the UI and, for the demo setup, the eval worker route.

Required app env vars:
- `NEXT_PUBLIC_CONVEX_URL`
- `OPENROUTER_API_KEY`

If you keep using the route-handler worker in a deployed demo, point Convex's `EVAL_RUNNER_URL` at that public route URL.
