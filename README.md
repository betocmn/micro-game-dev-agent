# 3 Words to Game

Type a vague 3-word prompt like **"space dodge rocks"** and an AI agent pipeline expands intent, generates game mechanic code, compiles a playable HTML5 canvas game, and runs 3 automated evals to score it.

Built with Next.js, Convex, OpenRouter, and Playwright.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js (App Router) + Tailwind |
| Backend | Convex (reactive DB, mutations/queries/actions) |
| LLM | OpenRouter (`anthropic/claude-sonnet-4`) |
| Evals | Playwright (runtime + interaction) and LLM-as-judge |
| Linting | Biome |

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) (`corepack enable && corepack prepare pnpm@latest --activate`)
- A [Convex](https://www.convex.dev/) account (free tier works)
- An [OpenRouter](https://openrouter.ai/) API key

## Setup

1. **Clone and install dependencies**

   ```bash
   git clone <repo-url> && cd surat-v2
   pnpm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.local.example .env.local
   ```

   Fill in your `NEXT_PUBLIC_CONVEX_URL` and `OPENROUTER_API_KEY`.

   Also set the OpenRouter key in the Convex dashboard (or via `pnpm convex env set OPENROUTER_API_KEY <key>`).

3. **Start the Convex dev server** (in one terminal)

   ```bash
   pnpm convex dev
   ```

4. **Start the Next.js dev server** (in another terminal)

   ```bash
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) and type a prompt.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Next.js dev server |
| `pnpm convex dev` | Start Convex dev server |
| `pnpm build` | Production build |
| `pnpm lint` | Run Biome lint |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm test:pipeline` | Test generation pipeline (standalone) |
| `pnpm test:evals` | Run full pipeline + evals |

## Deployment

### Convex

Convex functions are deployed separately:

```bash
pnpm convex deploy
```

This pushes your `convex/` directory to Convex cloud. Set production env vars in the [Convex dashboard](https://dashboard.convex.dev/).

### Next.js on Fly.io

1. Install the [Fly CLI](https://fly.io/docs/flyctl/install/)
2. Launch the app:

   ```bash
   fly launch
   ```

3. Set environment variables:

   ```bash
   fly secrets set NEXT_PUBLIC_CONVEX_URL=<your-convex-prod-url>
   ```

4. Deploy:

   ```bash
   fly deploy
   ```

The app runs as a standard Next.js server on Fly.io. Make sure `NEXT_PUBLIC_CONVEX_URL` points to your production Convex deployment.
