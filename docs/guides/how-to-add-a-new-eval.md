# How To Add A New Eval

This repo already has three evals:

- `runtime` in `src/evals/runtimeEval.ts`
- `interaction` in `src/evals/interactionEval.ts`
- `judge` in `src/evals/judgeEval.ts`

Adding a fourth eval is straightforward, but it touches more than one place because the system is strongly typed end to end.

## The current eval path

```text
compiled HTML
  -> runEvalWorker()
  -> POST /api/evals/run
  -> runAllEvals()
  -> your eval function
  -> typed result object
  -> Convex saveEvalResult()
  -> detail page renders evalRuns
  -> optional summary fields copied onto generation row
```

## Rule zero

If the eval needs Playwright or any other browser-capable runtime, keep it in the worker path under `src/evals/` and `src/app/api/evals/run/route.ts`.

Do not move browser execution into Convex actions.

## Step 1: Define the result shape

Add a new result type in `src/types.ts`.

Example:

```ts
export interface BalanceEvalResult {
  pass: boolean;
  difficultyScore: number;
  notes: string[];
}
```

If the new eval should be part of the top-level suite result, extend `EvalSuiteResult` too.

## Step 2: Add the Zod schema

Add a matching schema in `src/lib/schemas.ts`.

Example:

```ts
export const balanceEvalResultSchema: z.ZodType<BalanceEvalResult> = z.object({
  pass: z.boolean(),
  difficultyScore: z.number().min(0).max(100),
  notes: z.array(z.string()),
});
```

Then add it to `evalSuiteResultSchema` if `runAllEvals()` will return it.

This step matters because:

- the worker route validates outgoing responses
- the worker client validates incoming responses
- the UI parses stored JSON with these schemas

## Step 3: Implement the eval

Create a new file in `src/evals/`.

Typical shapes:

- browser-based check: mirror `runtimeEval.ts` or `interactionEval.ts`
- model-based judge: mirror `judgeEval.ts`
- pure TypeScript post-processing: accept already-produced artifacts and score them without Playwright

Recommended signature pattern:

```ts
export async function runBalanceEval(
  html: string,
): Promise<BalanceEvalResult> {
  // ...
}
```

If the eval needs more context, pass only what it actually uses:

- `prompt`
- `spec`
- `mechanicCode`
- `html`
- earlier eval results

## Step 4: Wire it into `runAllEvals`

Edit `src/evals/runEvals.ts`.

You need to decide:

1. When should the eval run?
2. Should runtime failure skip it?
3. Does it affect `summaryScore`?
4. Is it binary like `runtime`, or graded like `judge`?

Current behavior:

- `runtime` runs first
- if `runtime.pass === false`, the suite hard-fails and later evals are skipped
- `interaction` and `judge` run only after runtime passes
- summary score is `35 + 35 + 30` weighted

If your new eval affects the score, update the math and keep the total normalized to `100`.

## Step 5: Persist the new eval in Convex

Edit `convex/generations.ts`.

At minimum:

1. Extend `evalTypeValidator`.
2. Call `saveEvalResult()` for the new eval after the worker returns.

Example shape:

```ts
await ctx.runMutation(internal.generations.saveEvalResult, {
  generationId,
  type: "balance",
  status: "done",
  result: JSON.stringify(evalResult.balance),
});
```

If the eval should influence the generation summary row, also update:

- `updateGeneration` args
- the `generations` table in `convex/schema.ts`
- any summary calculations you want to surface on the home page

## Step 6: Render it in the UI

The detail page currently parses eval results by `evalRun.type` in `src/app/g/[id]/page.tsx`.

To display the new eval cleanly:

1. Import the new Zod schema.
2. Parse `evalRun.result` when `evalRun.type` matches your new type.
3. Render a dedicated block for that result.

If the eval changes headline scoring, also update `src/app/page.tsx` and any summary labels.

## Step 7: Add tests

The minimum useful coverage is:

1. A focused test for the new eval module.
2. A `runEvals.test.ts` update that proves orchestration and scoring still work.
3. Schema coverage if the result shape is easy to regress.

Useful existing references:

- `src/evals/runEvals.test.ts`
- `src/evals/evalWorkerClient.test.ts`
- `src/compile/compileGame.test.ts`

## File checklist

For most new evals, expect to touch:

```text
src/types.ts
src/lib/schemas.ts
src/evals/<newEval>.ts
src/evals/runEvals.ts
src/evals/runEvals.test.ts
convex/generations.ts
convex/schema.ts
src/app/g/[id]/page.tsx
src/app/page.tsx            # only if summary UX changes
```

## Decision points before you start

Answer these first:

```text
What artifact am I judging?
What signal proves pass/fail?
Is the eval cheap enough to run every time?
Is it a hard gate, a soft score, or debug-only telemetry?
Should it run before or after existing evals?
What should happen when runtime fails?
```

If those answers are vague, the implementation will drift.

## Practical patterns

### For browser behavior

Reuse the existing harness pattern:

- `page.setContent(html)`
- wait for `window.__gameEval.ready`
- sample `window.__gameEval.snapshot()`
- collect `pageerror` and console signals

### For spec-matching

Pass the original intent and prior eval outputs into the scorer, the same way `judgeEval.ts` does.

### For metrics-based evals

Prefer extending `window.__gameEval.metrics` in `src/compile/engineShell.ts` and consuming those values from Playwright instead of trying to infer behavior from pixels.

## Current limitations to keep in mind

The current implementation is simple, so new evals inherit some rough edges:

- eval rows are only persisted as `done` right now, not as a full per-eval lifecycle
- the worker returns the whole suite at once rather than streaming partial results
- summary fields on the `generations` row are custom, not generic
- the detail page has explicit branches per eval type instead of a registry

That is fine for the current scope. Just be aware that adding many more evals will eventually justify a registry-driven design.

## Suggested future refactor

Once there are more than a few evals, move toward:

```text
eval registry
  -> id
  -> runner
  -> schema
  -> persistence strategy
  -> summary contribution
  -> UI renderer
```

Right now the code is explicit rather than generic. That keeps it easy to follow while the eval set is still small.
