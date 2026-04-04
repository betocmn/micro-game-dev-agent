/**
 * CLI eval test script — run the full pipeline + evals locally.
 *
 * Usage: npx tsx src/evals/testEvals.ts "space dodge rocks"
 *
 * This runs everything end-to-end:
 * 1. Expand intent (LLM)
 * 2. Build mechanic (LLM)
 * 3. Compile game
 * 4. Run all 3 evals (runtime, interaction, judge)
 *
 * Note: Playwright evals require a local browser, so they can't run
 * inside Convex's cloud runtime. In production, you'd run evals on
 * a Fly worker machine. For the MVP, this script is the eval runner.
 */

import { expandIntent } from "../agents/expandIntent";
import { buildMechanic } from "../agents/buildMechanic";
import { compileGame } from "../compile/compileGame";
import { runAllEvals } from "./runEvals";
import { writeFileSync } from "fs";

async function main() {
  const prompt = process.argv[2] || "space dodge rocks";
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error("Set OPENROUTER_API_KEY in your environment");
    process.exit(1);
  }

  console.log(`\n=== 3 Words to Game: Full Pipeline + Evals ===\n`);
  console.log(`Prompt: "${prompt}"\n`);

  // Generation pipeline
  console.log("--- Step 1: Expanding intent ---");
  const spec = await expandIntent(apiKey, prompt);
  console.log(`Title: ${spec.title}`);
  console.log(`Genre: ${spec.genre}`);
  console.log(`Core loop: ${spec.coreLoop}\n`);

  console.log("--- Step 2: Building mechanic ---");
  const mechanicCode = await buildMechanic(apiKey, spec);
  console.log(`Generated ${mechanicCode.length} chars of JS\n`);

  console.log("--- Step 3: Compiling game ---");
  const html = compileGame(mechanicCode);
  writeFileSync("test-game.html", html);
  console.log(`Wrote test-game.html (${html.length} chars)\n`);

  // Eval suite
  console.log("--- Step 4: Running evals ---\n");
  const results = await runAllEvals(apiKey, prompt, spec, mechanicCode, html);

  // Runtime eval
  console.log(`Runtime Eval: ${results.runtime.pass ? "PASS" : "FAIL"}`);
  if (results.runtime.errors.length > 0) {
    console.log(`  Errors: ${results.runtime.errors.join(", ")}`);
  }
  console.log(`  Ready: ${results.runtime.readySeen}`);
  console.log();

  // Interaction eval
  console.log(`Interaction Eval: ${results.interaction.pass ? "PASS" : "FAIL"}`);
  console.log(`  Duration: ${results.interaction.durationMs}ms`);
  console.log(`  Frames: ${results.interaction.framesObserved}`);
  console.log(`  State changed: ${results.interaction.stateChanged}`);
  console.log(`  Score changed: ${results.interaction.scoreChanged}`);
  console.log(`  Crashed: ${results.interaction.crashed}`);
  console.log();

  // Judge eval
  console.log(`Judge Eval:`);
  console.log(`  Genre match: ${results.judge.genreMatch}/5`);
  console.log(`  Mechanic match: ${results.judge.mechanicMatch}/5`);
  console.log(`  Goal match: ${results.judge.goalMatch}/5`);
  console.log(`  Controls match: ${results.judge.controlsMatch}/5`);
  console.log(`  Coherence: ${results.judge.coherence}/5`);
  console.log(`  Summary: ${results.judge.summary}`);
  if (results.judge.criticalMisses.length > 0) {
    console.log(`  Critical misses: ${results.judge.criticalMisses.join(", ")}`);
  }
  console.log();

  // Summary
  console.log(`=== SUMMARY SCORE: ${results.summaryScore}/100 ===\n`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
