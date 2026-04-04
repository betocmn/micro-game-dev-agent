@AGENTS.md

# 3 Words to Game

Micro agent pipeline MVP: user types a vague prompt ("space dodge rocks"), an LLM chain expands intent → generates game mechanic code → compiles into a playable HTML5 canvas game → 3 automated evals score it. Built with Next.js, Convex, OpenRouter, and Playwright.

## Stack

- **Frontend**: Next.js (App Router) + Tailwind
- **Backend**: Convex (reactive DB, mutations/queries/actions)
- **LLM**: OpenRouter (`anthropic/claude-sonnet-4`) — key in `.env.local` and Convex env vars
- **Evals**: Playwright (runtime + interaction) and LLM-as-judge
- **Linting**: Biome

## Key architecture

- LLM generates only 3 mechanic functions (`initMechanic`, `updateMechanic`, `renderMechanic`), not full HTML. A fixed engine shell in `src/compile/engineShell.ts` provides the canvas, game loop, and eval instrumentation (`window.__gameEval`).
- Convex action runs the pipeline; mutations update status at each step; queries provide real-time subscriptions to the frontend.
- Evals run via Playwright locally (not in Convex cloud — Playwright needs a browser).

## Commands

- `npm run dev` — Start Next.js dev server
- `npx convex dev` — Start Convex dev server
- `npm run lint` — Run Biome lint
- `npm run lint:fix` — Auto-fix lint issues
- `npm run test:pipeline` — Test generation pipeline standalone
- `npm run test:evals` — Test full pipeline + evals

## Rules

- Always run `npm run lint` before committing
- Use semantic commit messages without parenthesis detail (e.g. `feat: add eval layer`)
- Auto-commit after every change
