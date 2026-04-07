import { v } from "convex/values";
import type {
	GenerationFailureStage,
	RobloxEvalSuiteResult,
} from "../src/types";
import { EVAL_PROFILE, HARNESS_VERSION } from "../src/worker/constants";
import { HarnessStageError } from "../src/worker/errors";
import {
	runHarnessEvaluation,
	runHarnessMaterialization,
} from "../src/worker/workerClient";
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
	v.literal("evaluating"),
	v.literal("done"),
	v.literal("failed"),
);

const generationFailureStageValidator = v.union(
	v.literal("setup"),
	v.literal("expanding"),
	v.literal("building"),
	v.literal("evaluating"),
);

const evalTypeValidator = v.union(
	v.literal("artifact"),
	v.literal("roblox"),
	v.literal("judge"),
);

const evalStatusValidator = v.union(
	v.literal("queued"),
	v.literal("running"),
	v.literal("done"),
	v.literal("failed"),
);

function getJudgeScore(result: RobloxEvalSuiteResult): number {
	const judgeAverage =
		(result.judge.robloxFit +
			result.judge.promptFidelity +
			result.judge.socialLoopQuality +
			result.judge.clarity) /
		4;

	return Math.round((judgeAverage / 5) * 100);
}

// === MUTATIONS ===

export const enqueueGeneration = mutation({
	args: { prompt: v.string() },
	handler: async (ctx, { prompt }) => {
		const id = await ctx.db.insert("generations", {
			prompt,
			status: "queued",
			attemptCount: 0,
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
			artifactType: v.optional(v.literal("roblox-rojo")),
			artifactBundle: v.optional(v.string()),
			harnessVersion: v.optional(v.string()),
			evalProfile: v.optional(v.string()),
			attemptCount: v.optional(v.float64()),
			latestAgentRunId: v.optional(v.id("agentRuns")),
			summaryScore: v.optional(v.float64()),
			artifactPass: v.optional(v.boolean()),
			robloxPass: v.optional(v.boolean()),
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
		agentRunId: v.optional(v.id("agentRuns")),
		type: evalTypeValidator,
		status: evalStatusValidator,
		result: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ctx.db.insert("evalRuns", args);
	},
});

export const saveAgentRun = internalMutation({
	args: {
		generationId: v.id("generations"),
		sessionId: v.string(),
		status: v.union(
			v.literal("running"),
			v.literal("done"),
			v.literal("failed"),
		),
		model: v.string(),
		numTurns: v.float64(),
		totalCostUsd: v.float64(),
		stopReason: v.optional(v.string()),
		permissionDenials: v.array(v.string()),
		harnessVersion: v.string(),
		evalProfile: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("agentRuns", args);
	},
});

export const saveAgentEvents = internalMutation({
	args: {
		generationId: v.id("generations"),
		agentRunId: v.id("agentRuns"),
		events: v.array(
			v.object({
				type: v.string(),
				summary: v.string(),
				payload: v.optional(v.string()),
			}),
		),
	},
	handler: async (ctx, { generationId, agentRunId, events }) => {
		for (const event of events) {
			await ctx.db.insert("agentEvents", {
				generationId,
				agentRunId,
				...event,
			});
		}
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

		const agentRuns = await ctx.db
			.query("agentRuns")
			.withIndex("by_generation", (q) => q.eq("generationId", generationId))
			.collect();
		const agentEvents = await ctx.db
			.query("agentEvents")
			.withIndex("by_generation", (q) => q.eq("generationId", generationId))
			.collect();

		return { ...generation, evalRuns, agentRuns, agentEvents };
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
				fields: {
					status: "expanding",
					attemptCount: (generation.attemptCount ?? 0) + 1,
				},
			});

			failureStage = "building";
			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: { status: "building" },
			});

			const materializeResult = await runHarnessMaterialization({
				generationId,
				prompt: generation.prompt,
			});
			const materializeAgentRunId = await ctx.runMutation(
				internal.generations.saveAgentRun,
				{
					generationId,
					sessionId: materializeResult.agentRun.sessionId,
					status: "done",
					model: materializeResult.agentRun.model,
					numTurns: materializeResult.agentRun.numTurns,
					totalCostUsd: materializeResult.agentRun.totalCostUsd,
					stopReason: materializeResult.agentRun.stopReason ?? undefined,
					permissionDenials: materializeResult.agentRun.permissionDenials,
					harnessVersion: HARNESS_VERSION,
					evalProfile: EVAL_PROFILE,
				},
			);
			await ctx.runMutation(internal.generations.saveAgentEvents, {
				generationId,
				agentRunId: materializeAgentRunId,
				events: materializeResult.events.map((event) => ({
					type: event.type,
					summary: event.summary,
					payload: event.payload,
				})),
			});

			failureStage = "evaluating";
			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: {
					status: "evaluating",
					spec: JSON.stringify(materializeResult.spec),
					artifactType: "roblox-rojo",
					artifactBundle: JSON.stringify(materializeResult.artifactBundle),
					harnessVersion: HARNESS_VERSION,
					evalProfile: EVAL_PROFILE,
					latestAgentRunId: materializeAgentRunId,
				},
			});

			const evaluationResult = await runHarnessEvaluation({
				generationId,
				prompt: generation.prompt,
				spec: materializeResult.spec,
				artifactBundle: materializeResult.artifactBundle,
				resumeSessionId: materializeResult.resumeSessionId ?? undefined,
			});

			let latestAgentRunId = materializeAgentRunId;
			if (evaluationResult.agentRun) {
				latestAgentRunId = await ctx.runMutation(
					internal.generations.saveAgentRun,
					{
						generationId,
						sessionId: evaluationResult.agentRun.sessionId,
						status: "done",
						model: evaluationResult.agentRun.model,
						numTurns: evaluationResult.agentRun.numTurns,
						totalCostUsd: evaluationResult.agentRun.totalCostUsd,
						stopReason: evaluationResult.agentRun.stopReason ?? undefined,
						permissionDenials: evaluationResult.agentRun.permissionDenials,
						harnessVersion: HARNESS_VERSION,
						evalProfile: EVAL_PROFILE,
					},
				);
				await ctx.runMutation(internal.generations.saveAgentEvents, {
					generationId,
					agentRunId: latestAgentRunId,
					events: evaluationResult.events.map((event) => ({
						type: event.type,
						summary: event.summary,
						payload: event.payload,
					})),
				});
			}

			await ctx.runMutation(internal.generations.saveEvalResult, {
				generationId,
				agentRunId: latestAgentRunId,
				type: "artifact",
				status: "done",
				result: JSON.stringify(evaluationResult.evalSuite.artifact),
			});
			await ctx.runMutation(internal.generations.saveEvalResult, {
				generationId,
				agentRunId: latestAgentRunId,
				type: "roblox",
				status: "done",
				result: JSON.stringify(evaluationResult.evalSuite.roblox),
			});
			await ctx.runMutation(internal.generations.saveEvalResult, {
				generationId,
				agentRunId: latestAgentRunId,
				type: "judge",
				status: "done",
				result: JSON.stringify(evaluationResult.evalSuite.judge),
			});

			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: {
					status: "done",
					spec: JSON.stringify(materializeResult.spec),
					artifactType: "roblox-rojo",
					artifactBundle: JSON.stringify(evaluationResult.artifactBundle),
					harnessVersion: HARNESS_VERSION,
					evalProfile: EVAL_PROFILE,
					latestAgentRunId,
					summaryScore: evaluationResult.evalSuite.summaryScore,
					artifactPass: evaluationResult.evalSuite.artifact.pass,
					robloxPass: evaluationResult.evalSuite.roblox.pass,
					judgeScore: getJudgeScore(evaluationResult.evalSuite),
				},
			});
		} catch (error) {
			if (error instanceof HarnessStageError) {
				failureStage = error.failureStage;
			}
			await failGeneration(error);
		}
	},
});
