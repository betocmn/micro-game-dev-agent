# Dev Completion Plan

## Purpose

Track the repo state after the Roblox harness conversion and the follow-up hardening pass on April 4, 2026.

## What shipped

The repo now demonstrates this live loop:

- vague prompt -> `RobloxGameSpec`
- `RobloxGameSpec` -> constrained Rojo + Luau scaffold
- scaffold -> proxy eval suite
- Convex persistence -> reactive UI

The repo is now Roblox-only; the legacy HTML canvas path has been removed.

## Verified state

Verified on April 4, 2026:

- `pnpm check` passes
- `pnpm test` passes
- `.env.local` is loaded automatically by the worker, benchmark CLI, and direct harness calls
- a real Anthropic-backed direct harness run completes end to end
- a real `POST /runs/generate` worker request completes end to end

## Important nuance

The Anthropic auth path is healthy, but short prompts still tend to push the planner and builder into timeouts.

The current harness therefore succeeds by:

1. trying Claude Agent SDK first
2. recording fallback events when planning or building times out
3. materializing deterministic scaffold files
4. continuing through the full eval and persistence flow

That is an acceptable MVP tradeoff because the product boundary, artifact contract, eval persistence, and benchmark surface all work today.

## What this repo now teaches about Lemonade's stack

- the worker boundary matters more than the exact model prompt
- evals need durable artifact contracts, not just one final score
- Convex is useful as orchestration glue and live state, not as the place to execute the whole agent
- recovery paths matter because frontier model behavior shifts quickly

## Current backlog

### Highest priority

- increase the rate of successful Claude-authored planner output
- increase the rate of successful Claude-authored scaffold edits
- reduce how often the deterministic fallback path is needed

### Next likely product steps

- add screenshot-conditioned prompting through `referenceImageUrl`
- add richer trace summaries in the UI
- add benchmark diff tooling by harness version
- add Roblox Studio or Rojo validation outside proxy heuristics

### Still not in scope

- Roblox Studio automation
- cloud worker deployment
- true playable simulation evals inside Roblox

## Definition of complete enough

This repo is complete enough for the current goal if:

1. it shows a real Anthropic-native worker boundary
2. it persists artifacts, traces, and evals in Convex
3. it demonstrates benchmarkable Roblox-specific evals
4. it makes current failure modes visible instead of hidden

That bar is met. The next round is quality and steerability, not architecture rescue.
