import { ARTIFACT_TYPE, EVAL_PROFILE, HARNESS_VERSION } from "./constants";

export const robloxGameSpecJsonSchema = {
	type: "object",
	additionalProperties: false,
	required: [
		"title",
		"experienceType",
		"fantasy",
		"coreLoop",
		"socialLoop",
		"progressionHook",
		"serverAuthoritativeRules",
		"clientFeedback",
		"worldObjects",
		"acceptanceTests",
	],
	properties: {
		title: { type: "string" },
		experienceType: {
			type: "string",
			enum: ["hangout", "social-sim", "obby", "minigame", "tycoon-lite"],
		},
		fantasy: { type: "string" },
		coreLoop: { type: "string" },
		socialLoop: { type: "string" },
		progressionHook: { type: "string" },
		serverAuthoritativeRules: {
			type: "array",
			minItems: 1,
			items: { type: "string" },
		},
		clientFeedback: {
			type: "array",
			minItems: 1,
			items: { type: "string" },
		},
		worldObjects: {
			type: "array",
			minItems: 1,
			items: {
				type: "object",
				additionalProperties: false,
				required: ["name", "purpose", "placement"],
				properties: {
					name: { type: "string" },
					purpose: { type: "string" },
					placement: { type: "string" },
				},
			},
		},
		acceptanceTests: {
			type: "array",
			minItems: 1,
			items: { type: "string" },
		},
	},
} as const;

export const robloxJudgeJsonSchema = {
	type: "object",
	additionalProperties: false,
	required: [
		"robloxFit",
		"promptFidelity",
		"socialLoopQuality",
		"clarity",
		"summary",
		"criticalMisses",
	],
	properties: {
		robloxFit: { type: "integer", minimum: 1, maximum: 5 },
		promptFidelity: { type: "integer", minimum: 1, maximum: 5 },
		socialLoopQuality: { type: "integer", minimum: 1, maximum: 5 },
		clarity: { type: "integer", minimum: 1, maximum: 5 },
		summary: { type: "string" },
		criticalMisses: {
			type: "array",
			items: { type: "string" },
		},
	},
} as const;

export const harnessMetadata = {
	harnessVersion: HARNESS_VERSION,
	evalProfile: EVAL_PROFILE,
	artifactType: ARTIFACT_TYPE,
} as const;
