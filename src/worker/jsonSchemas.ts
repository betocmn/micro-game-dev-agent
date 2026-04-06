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

export const harnessMetadata = {
	harnessVersion: HARNESS_VERSION,
	evalProfile: EVAL_PROFILE,
	artifactType: ARTIFACT_TYPE,
} as const;
