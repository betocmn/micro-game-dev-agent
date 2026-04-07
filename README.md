# Roblox Harness MVP

This repo is now a Roblox harness MVP that uses Anthropic Agent SDK for authoring and OpenRouter GPT judging on vague Roblox prompts.

Type a prompt like `mall hang vibes` and the system:
- expands intent into a strict `RobloxGameSpec`
- materializes a constrained Rojo + Luau scaffold
- persists the artifact bundle, agent trace, and evals in Convex
- renders the files and scores in the Next.js UI

The codebase now contains only the Roblox generation and evaluation flow.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 App Router |
| State and orchestration | Convex |
| Agent runtime | `@anthropic-ai/claude-agent-sdk` |
| Artifact target | Rojo-style Roblox scaffold + Luau |
| Evals | Proxy artifact eval + proxy Roblox eval + OpenRouter GPT judge |

## Live flow

1. `enqueueGeneration()` inserts a generation row in Convex.
2. Convex calls the local worker at `POST /runs/materialize`.
3. The worker creates `.context/runs/<generationId>/workspace` from the fixed scaffold.
4. Claude Agent SDK plans a `RobloxGameSpec`, edits the allowed files, and records session metadata.
5. Convex persists the initial artifact bundle plus the materialization trace, then calls `POST /runs/evaluate`.
6. Proxy evals score scaffold correctness and Roblox/social-fit heuristics, and the judge step runs through OpenRouter with `openai/gpt-5-mini` by default.
7. Convex persists the final artifact bundle, agent runs, agent events, and eval rows.
8. The UI shows the file tree, trace summary, and benchmark score.

## Fixed scaffold

The live harness always starts from these files:

- `src/worker/template/default.project.json`
- `src/worker/template/src/server/Mechanic.server.luau`
- `src/worker/template/src/client/Mechanic.client.luau`
- `src/worker/template/src/shared/GameSpec.json`
- `src/worker/template/src/shared/MechanicContract.luau`
- `src/worker/template/README.generated.md`

Only these files are editable by the authoring agent:

- `src/server/Mechanic.server.luau`
- `src/client/Mechanic.client.luau`
- `src/shared/GameSpec.json`

## Environment

Required:

- `NEXT_PUBLIC_CONVEX_URL`
- `ANTHROPIC_API_KEY`
- `OPENROUTER_API_KEY`

Optional:

- `HARNESS_WORKER_URL`
  Local default is `http://127.0.0.1:3200`.

Copy the example file:

```bash
cp .env.local.example .env.local
```

## Local development

Install dependencies:

```bash
pnpm install
```

Start the app, Convex, and the worker together:

```bash
pnpm dev
```

This starts:

- Next.js on `http://localhost:3000`
- Convex dev
- the harness worker on `http://127.0.0.1:3200`

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Next.js, Convex, and the local harness worker |
| `pnpm worker:dev` | Run only the local harness worker |
| `pnpm check` | Run lint + typecheck |
| `pnpm test` | Run Vitest |
| `pnpm benchmark` | Run the `roblox-social-v1` dataset and write a report into `.context/benchmarks/` |

## Benchmarking

The curated dataset lives at:

- `src/evals/datasets/roblox-social-v1.json`

Running:

```bash
pnpm benchmark
```

will:

1. execute the harness on all 12 dataset cases
2. write a timestamped JSON report into `.context/benchmarks/`
3. compare the new average score with the most recent benchmark for the same eval profile

## Main decisions

See [docs/implementation-notes/main-decisions.md](docs/implementation-notes/main-decisions.md) for core concepts, design decisions, and implementation details.

## Next improvement TODOs

- **Multi-attempt eval repair with variation** — Currently the harness runs one repair pass after eval failure, then falls back to a deterministic scaffold. Replace this with a retry loop (3-5 attempts) that varies temperature, prompt phrasing, or model tier on each attempt, only resorting to the deterministic fallback as a true last resort.
- **Roblox Studio integration for live generation** — Connect the pipeline directly to Roblox Studio so generated scaffolds can be loaded, tested, and iterated on inside the actual engine rather than relying solely on proxy evals.

## Guides

- `docs/guides/agent-harness.md`
- `docs/guides/architecture.md`
- `docs/guides/running-the-worker.md`
- `docs/guides/how-to-add-a-new-eval.md`
