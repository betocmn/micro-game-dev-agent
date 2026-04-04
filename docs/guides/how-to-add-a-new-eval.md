# How To Add A New Eval

The live eval harness scores Roblox scaffold artifacts, not browser games.

Current evals:

- `artifact` in `src/evals/artifactEval.ts`
- `roblox` in `src/evals/robloxEval.ts`
- `judge` in `src/evals/robloxJudgeEval.ts`

The orchestration entry point is `runRobloxEvals()` in `src/evals/robloxRunEvals.ts`.

## Current eval path

```text
ArtifactBundle + RobloxGameSpec
  -> runRobloxEvals()
  -> your eval function
  -> typed result object
  -> Convex saveEvalResult()
  -> detail page renders evalRuns
```

## Step 1: Define the result shape

Add a result type in `src/types.ts`.

Example:

```ts
export interface EconomyEvalResult {
  pass: boolean;
  inflationRisk: number;
  notes: string[];
}
```

If the eval belongs in the top-level suite, extend `RobloxEvalSuiteResult` too.

## Step 2: Add the Zod schema

Add the matching schema in `src/lib/schemas.ts`.

Example:

```ts
export const economyEvalResultSchema: z.ZodType<EconomyEvalResult> = z.object({
  pass: z.boolean(),
  inflationRisk: z.number().min(0).max(100),
  notes: z.array(z.string()),
});
```

This matters because:

- worker requests and responses are validated
- stored JSON is parsed back into typed UI state
- regressions become obvious instead of silent

## Step 3: Implement the eval

Create a new file under `src/evals/`.

Prefer the narrowest possible input:

- `prompt`
- `spec`
- `artifactBundle`
- earlier eval results

Do not require more context than the scorer actually uses.

## Step 4: Decide whether it is a hard gate or a soft score

Answer these before wiring anything:

- Does this eval gate pass/fail?
- Does it only add diagnostic signal?
- Should it run before or after the existing `roblox` eval?
- Does it change `summaryScore`?

Right now the suite is weighted `30 / 30 / 40` for `artifact / roblox / judge`. If your new eval changes the weighting, normalize the total back to `100`.

## Step 5: Wire it into `runRobloxEvals()`

Edit `src/evals/robloxRunEvals.ts`.

Decide:

- the execution order
- whether earlier failures should skip it
- how its score contributes to the summary

If the new eval calls Anthropic, add a deterministic fallback or a clearly defined failure policy. The current harness is designed to finish the run whenever possible.

## Step 6: Persist it in Convex

Edit:

- `convex/generations.ts`
- `convex/schema.ts`

At minimum:

- extend the eval type validator
- insert a row in `evalRuns`
- decide whether the generation summary row should copy any headline values

## Step 7: Render it in the UI

The detail page branches on `evalRun.type` in `src/app/g/[id]/page.tsx`.

To surface the new eval:

- import the schema
- parse `evalRun.result`
- render a dedicated block

If the eval changes headline scoring, update `src/app/page.tsx` too.

## Step 8: Add tests

The minimum useful coverage is:

- a focused unit test for the new eval module
- an orchestration test for `runRobloxEvals()`
- any schema validation coverage that is easy to regress

Useful references:

- `src/evals/artifactEval.test.ts`
- `src/evals/robloxEval.test.ts`
- `src/worker/harness.test.ts`

## File checklist

For most new evals, expect to touch:

```text
src/types.ts
src/lib/schemas.ts
src/evals/<newEval>.ts
src/evals/robloxRunEvals.ts
convex/generations.ts
convex/schema.ts
src/app/g/[id]/page.tsx
src/app/page.tsx
```

## Rule of thumb

If the new eval can be implemented as pure TypeScript over the artifact bundle, do that first.

Only reach for another Anthropic call when the signal is genuinely semantic and cannot be captured by deterministic checks.
