/**
 * Convex schema — defines the two tables that power the app.
 *
 * "generations" tracks each prompt → game pipeline run.
 * "evalRuns" stores individual eval results linked to a generation.
 *
 * Convex is schema-first: you define your tables here and get
 * type-safe queries/mutations automatically. Think of it like
 * Prisma but the database is also your real-time subscription layer.
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	generations: defineTable({
		prompt: v.string(),
		status: v.union(
			v.literal("queued"),
			v.literal("expanding"),
			v.literal("building"),
			v.literal("compiling"),
			v.literal("evaluating"),
			v.literal("done"),
			v.literal("failed"),
		),
		failureStage: v.optional(
			v.union(
				v.literal("setup"),
				v.literal("expanding"),
				v.literal("building"),
				v.literal("compiling"),
				v.literal("evaluating"),
			),
		),
		spec: v.optional(v.string()), // JSON stringified GameSpec
		mechanicCode: v.optional(v.string()),
		html: v.optional(v.string()),
		artifactType: v.optional(v.literal("roblox-rojo")),
		artifactBundle: v.optional(v.string()),
		harnessVersion: v.optional(v.string()),
		evalProfile: v.optional(v.string()),
		attemptCount: v.optional(v.float64()),
		latestAgentRunId: v.optional(v.id("agentRuns")),
		summaryScore: v.optional(v.float64()),
		artifactPass: v.optional(v.boolean()),
		robloxPass: v.optional(v.boolean()),
		runtimePass: v.optional(v.boolean()),
		interactionPass: v.optional(v.boolean()),
		judgeScore: v.optional(v.float64()),
		error: v.optional(v.string()),
	}),

	agentRuns: defineTable({
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
	}).index("by_generation", ["generationId"]),

	agentEvents: defineTable({
		generationId: v.id("generations"),
		agentRunId: v.id("agentRuns"),
		type: v.string(),
		summary: v.string(),
		payload: v.optional(v.string()),
	})
		.index("by_generation", ["generationId"])
		.index("by_agent_run", ["agentRunId"]),

	evalRuns: defineTable({
		generationId: v.id("generations"),
		agentRunId: v.optional(v.id("agentRuns")),
		type: v.union(
			v.literal("artifact"),
			v.literal("roblox"),
			v.literal("judge"),
		),
		status: v.union(
			v.literal("queued"),
			v.literal("running"),
			v.literal("done"),
			v.literal("failed"),
		),
		result: v.optional(v.string()), // JSON stringified eval result
	}).index("by_generation", ["generationId"]),
});
