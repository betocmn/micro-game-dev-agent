import { z } from "zod";
import type {
	EvalSuiteResult,
	GameEntity,
	GameSpec,
	InteractionEvalResult,
	JudgeEvalResult,
	RuntimeEvalResult,
} from "../types";

export const gameEntitySchema: z.ZodType<GameEntity> = z.object({
	name: z.string().min(1),
	role: z.union([
		z.literal("player"),
		z.literal("enemy"),
		z.literal("pickup"),
		z.literal("hazard"),
	]),
});

export const gameSpecSchema: z.ZodType<GameSpec> = z.object({
	title: z.string().min(1),
	genre: z.union([
		z.literal("dodge"),
		z.literal("collect"),
		z.literal("survive"),
		z.literal("platform"),
	]),
	theme: z.string().min(1),
	playerGoal: z.string().min(1),
	controls: z.array(z.string().min(1)).min(1),
	entities: z.array(gameEntitySchema).min(1),
	coreLoop: z.string().min(1),
	winCondition: z.string().min(1),
	loseCondition: z.string().min(1),
	scoreRule: z.string().min(1),
	visualStyle: z.string().min(1),
	acceptanceTests: z.array(z.string().min(1)).min(1),
});

export const runtimeEvalResultSchema: z.ZodType<RuntimeEvalResult> = z.object({
	pass: z.boolean(),
	errors: z.array(z.string()),
	readySeen: z.boolean(),
	snapshot: z.record(z.string(), z.unknown()).nullable(),
});

export const interactionEvalResultSchema: z.ZodType<InteractionEvalResult> =
	z.object({
		pass: z.boolean(),
		durationMs: z.number().nonnegative(),
		framesObserved: z.number().nonnegative(),
		stateChanged: z.boolean(),
		scoreChanged: z.boolean(),
		crashed: z.boolean(),
	});

export const judgeEvalResultSchema: z.ZodType<JudgeEvalResult> = z.object({
	genreMatch: z.number().int().min(1).max(5),
	mechanicMatch: z.number().int().min(1).max(5),
	goalMatch: z.number().int().min(1).max(5),
	controlsMatch: z.number().int().min(1).max(5),
	coherence: z.number().int().min(1).max(5),
	summary: z.string().min(1),
	criticalMisses: z.array(z.string()),
});

export const evalSuiteResultSchema: z.ZodType<EvalSuiteResult> = z.object({
	runtime: runtimeEvalResultSchema,
	interaction: interactionEvalResultSchema,
	judge: judgeEvalResultSchema,
	summaryScore: z.number().min(0).max(100),
});

export const evalWorkerRequestSchema = z.object({
	prompt: z.string().min(1),
	spec: gameSpecSchema,
	mechanicCode: z.string().min(1),
	html: z.string().min(1),
});
