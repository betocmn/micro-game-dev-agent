/**
 * Convex functions for the generation pipeline.
 *
 * Convex owns the durable state transitions and persistence. Browser-capable
 * eval execution happens through a separate worker endpoint so Playwright stays
 * outside the Convex runtime boundary.
 */

import { v } from "convex/values";
import { buildMechanic } from "../src/agents/buildMechanic";
import { expandIntent } from "../src/agents/expandIntent";
import { compileGame } from "../src/compile/compileGame";
import { runEvalWorker } from "../src/evals/evalWorkerClient";
import type { EvalSuiteResult, GenerationFailureStage } from "../src/types";
import { internal } from "./_generated/api";
import {
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";

const generationStatusValidator = v.union(
	v.literal("queued"),
	v.literal("expanding"),
	v.literal("building"),
	v.literal("compiling"),
	v.literal("evaluating"),
	v.literal("done"),
	v.literal("failed"),
);

const generationFailureStageValidator = v.union(
	v.literal("setup"),
	v.literal("expanding"),
	v.literal("building"),
	v.literal("compiling"),
	v.literal("evaluating"),
);

const evalTypeValidator = v.union(
	v.literal("runtime"),
	v.literal("interaction"),
	v.literal("judge"),
);

const evalStatusValidator = v.union(
	v.literal("queued"),
	v.literal("running"),
	v.literal("done"),
	v.literal("failed"),
);

function getJudgeScore(result: EvalSuiteResult): number {
	const judgeAverage =
		(result.judge.genreMatch +
			result.judge.mechanicMatch +
			result.judge.goalMatch +
			result.judge.controlsMatch +
			result.judge.coherence) /
		5;

	return Math.round((judgeAverage / 5) * 100);
}

// === MUTATIONS ===

export const enqueueGeneration = mutation({
	args: { prompt: v.string() },
	handler: async (ctx, { prompt }) => {
		const id = await ctx.db.insert("generations", {
			prompt,
			status: "queued",
		});
		await ctx.scheduler.runAfter(0, internal.generations.runPipeline, {
			generationId: id,
		});
		return id;
	},
});

export const updateGeneration = internalMutation({
	args: {
		generationId: v.id("generations"),
		fields: v.object({
			status: v.optional(generationStatusValidator),
			failureStage: v.optional(generationFailureStageValidator),
			spec: v.optional(v.string()),
			mechanicCode: v.optional(v.string()),
			html: v.optional(v.string()),
			summaryScore: v.optional(v.float64()),
			runtimePass: v.optional(v.boolean()),
			interactionPass: v.optional(v.boolean()),
			judgeScore: v.optional(v.float64()),
			error: v.optional(v.string()),
		}),
	},
	handler: async (ctx, { generationId, fields }) => {
		await ctx.db.patch(generationId, fields);
	},
});

export const saveEvalResult = internalMutation({
	args: {
		generationId: v.id("generations"),
		type: evalTypeValidator,
		status: evalStatusValidator,
		result: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ctx.db.insert("evalRuns", args);
	},
});

// === QUERIES ===

export const listGenerations = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("generations").order("desc").take(50);
	},
});

export const getGeneration = query({
	args: { generationId: v.id("generations") },
	handler: async (ctx, { generationId }) => {
		const generation = await ctx.db.get(generationId);
		if (!generation) return null;

		const evalRuns = await ctx.db
			.query("evalRuns")
			.withIndex("by_generation", (q) => q.eq("generationId", generationId))
			.collect();

		return { ...generation, evalRuns };
	},
});

export const getGenerationInternal = internalQuery({
	args: { generationId: v.id("generations") },
	handler: async (ctx, { generationId }) => {
		return await ctx.db.get(generationId);
	},
});

// === PIPELINE ACTION ===

export const runPipeline = internalAction({
	args: { generationId: v.id("generations") },
	handler: async (ctx, { generationId }) => {
		let failureStage: GenerationFailureStage = "setup";

		const failGeneration = async (error: unknown) => {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: {
					status: "failed",
					failureStage,
					error: errorMessage,
				},
			});
		};

		const apiKey = process.env.OPENROUTER_API_KEY;
		if (!apiKey) {
			await failGeneration("OPENROUTER_API_KEY not configured");
			return;
		}

		try {
			const generation = await ctx.runQuery(
				internal.generations.getGenerationInternal,
				{
					generationId,
				},
			);
			if (!generation) {
				throw new Error("Generation not found");
			}

			failureStage = "expanding";
			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: { status: "expanding" },
			});
			const spec = await expandIntent(apiKey, generation.prompt);

			failureStage = "building";
			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: {
					status: "building",
					spec: JSON.stringify(spec),
				},
			});
			const mechanicCode = await buildMechanic(apiKey, spec);

			failureStage = "compiling";
			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: { status: "compiling", mechanicCode },
			});
			const html = compileGame(mechanicCode);

			failureStage = "evaluating";
			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: { status: "evaluating", html },
			});

			const evalResult = await runEvalWorker({
				prompt: generation.prompt,
				spec,
				mechanicCode,
				html,
			});

			await ctx.runMutation(internal.generations.saveEvalResult, {
				generationId,
				type: "runtime",
				status: "done",
				result: JSON.stringify(evalResult.runtime),
			});
			await ctx.runMutation(internal.generations.saveEvalResult, {
				generationId,
				type: "interaction",
				status: "done",
				result: JSON.stringify(evalResult.interaction),
			});
			await ctx.runMutation(internal.generations.saveEvalResult, {
				generationId,
				type: "judge",
				status: "done",
				result: JSON.stringify(evalResult.judge),
			});

			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: {
					status: "done",
					summaryScore: evalResult.summaryScore,
					runtimePass: evalResult.runtime.pass,
					interactionPass: evalResult.interaction.pass,
					judgeScore: getJudgeScore(evalResult),
				},
			});
		} catch (error) {
			await failGeneration(error);
		}
	},
});
