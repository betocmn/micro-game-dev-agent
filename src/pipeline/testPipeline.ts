/**
 * CLI test script — run the pipeline standalone to verify it works.
 *
 * Usage: npx tsx src/pipeline/testPipeline.ts "space dodge rocks"
 *
 * This bypasses Convex entirely and just runs the agent chain,
 * writing the output HTML to a file you can open in a browser.
 */

import { writeFileSync } from "node:fs";
import { buildMechanic } from "../agents/buildMechanic";
import { expandIntent } from "../agents/expandIntent";
import { compileGame } from "../compile/compileGame";
import { ensureLocalEnvLoaded } from "../lib/loadEnv";

async function main() {
	ensureLocalEnvLoaded();
	const prompt = process.argv[2] || "space dodge rocks";
	const apiKey = process.env.OPENROUTER_API_KEY;

	if (!apiKey) {
		console.error("Set OPENROUTER_API_KEY in your environment");
		process.exit(1);
	}

	console.log(`\n🎮 Generating game for: "${prompt}"\n`);

	console.log("Step 1: Expanding intent...");
	const spec = await expandIntent(apiKey, prompt);
	console.log(`  → ${spec.title} (${spec.genre})`);
	console.log(
		`  → ${spec.entities.length} entities, ${spec.controls.length} controls`,
	);
	console.log(`  → Core loop: ${spec.coreLoop}\n`);

	console.log("Step 2: Building mechanic code...");
	const mechanicCode = await buildMechanic(apiKey, spec);
	console.log(`  → Generated ${mechanicCode.length} chars of JS\n`);

	console.log("Step 3: Compiling game...");
	const html = compileGame(mechanicCode);

	const outPath = "test-game.html";
	writeFileSync(outPath, html);
	console.log(`  → Wrote ${outPath} (${html.length} chars)\n`);
	console.log(`Open ${outPath} in a browser to play!\n`);

	console.log("Spec:", JSON.stringify(spec, null, 2));
}

main().catch((err) => {
	console.error("Pipeline failed:", err);
	process.exit(1);
});
