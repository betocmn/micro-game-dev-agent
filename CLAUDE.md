@AGENTS.md

# Roblox Harness MVP

Anthropic-native Roblox scaffold generator:
- prompt -> `RobloxGameSpec`
- `RobloxGameSpec` -> constrained Rojo + Luau artifact bundle
- artifact bundle -> proxy eval suite
- Convex persists runs, traces, evals, and artifact files

## Commands

- `pnpm dev` — Next.js + Convex + worker
- `pnpm worker:dev` — local harness worker only
- `pnpm check` — lint + typecheck
- `pnpm test` — unit tests
- `pnpm benchmark` — run the `roblox-social-v1` dataset

## Rules

- Use `ANTHROPIC_API_KEY`, not `OPENROUTER_API_KEY`
- The live path is the worker-based Roblox scaffold flow, not the legacy canvas flow
- Keep the fixed scaffold contract stable
- Auto-commit after each change with semantic commit messages and no parenthetical detail
