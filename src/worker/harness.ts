import {
	type AgentDefinition,
	type HookCallbackMatcher,
	query,
	type SDKMessage,
	type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { runRobloxEvals } from "@/evals/robloxRunEvals";
import { generateRunResponseSchema } from "@/lib/schemas";
import type {
	AgentEventSummary,
	AgentRunSummary,
	GenerateRunResponse,
	RobloxEvalSuiteResult,
	RobloxGameSpec,
} from "@/types";
import { ARTIFACT_TYPE, EVAL_PROFILE, HARNESS_VERSION } from "./constants";
import { robloxGameSpecJsonSchema } from "./jsonSchemas";
import {
	createRunWorkspace,
	getFixedScaffoldChecksum,
	getTemplateBundle,
	loadArtifactBundle,
	writeSpecToWorkspace,
} from "./workspace";

const SDK_MODEL = "claude-sonnet-4-5";
const SDK_CLIENT_APP = "caracas-v4/0.1.0";

type QueryFunction = typeof query;

interface QueryRunResult<TStructured = unknown> {
	agentRun: AgentRunSummary;
	events: AgentEventSummary[];
	structuredOutput?: TStructured;
}

const AGENTS: Record<string, AgentDefinition> = {
	roblox_intent_planner: {
		description: "Expands vague prompts into strict Roblox game specs.",
		maxTurns: 4,
		model: "sonnet",
		prompt:
			"You plan Roblox MVP specs for teen-friendly social experiences. Prefer a single strong social loop, light progression, and server-authoritative rules.",
		tools: [],
	},
	rojo_builder: {
		description: "Edits the allowed scaffold files to realize the Roblox spec.",
		maxTurns: 8,
		model: "sonnet",
		prompt:
			"You are editing a constrained Rojo scaffold. Only change the allowed Luau and GameSpec files. Keep the project compatible with social Roblox MVPs and maintain a clear server/client split.",
		tools: ["Read", "Edit", "Write", "Glob", "Grep", "LS"],
	},
	eval_repair: {
		description: "Repairs scaffold files after eval failures.",
		maxTurns: 4,
		model: "sonnet",
		prompt:
			"You repair Roblox scaffold files after proxy eval failures. Make the minimum changes needed to fix the failing checks while preserving the requested fantasy and social loop.",
		tools: ["Read", "Edit", "Write", "Glob", "Grep", "LS"],
	},
} as const;

function ensureAnthropicApiKey(): string {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error(
			"ANTHROPIC_API_KEY is not configured for the harness worker.",
		);
	}
	return apiKey;
}

function summarizeMessage(message: SDKMessage): AgentEventSummary | null {
	if (message.type === "tool_use_summary") {
		return { type: "tool_use_summary", summary: message.summary };
	}

	if (message.type === "tool_progress") {
		return {
			type: "tool_progress",
			summary: `${message.tool_name} running for ${message.elapsed_time_seconds}s`,
		};
	}

	if (message.type === "system") {
		if (message.subtype === "task_progress") {
			return {
				type: "task_progress",
				summary: message.summary ?? message.description,
			};
		}
		if (message.subtype === "task_started") {
			return {
				type: "task_started",
				summary: message.description,
			};
		}
		if (message.subtype === "session_state_changed") {
			return {
				type: "session_state_changed",
				summary: `Session is ${message.state}`,
			};
		}
		if (message.subtype === "status" && message.status) {
			return {
				type: "status",
				summary: message.status,
			};
		}
	}

	if (message.type === "assistant") {
		return {
			type: "assistant",
			summary: "Assistant responded with an implementation update.",
		};
	}

	if (message.type === "result") {
		return {
			type: "result",
			summary:
				message.subtype === "success"
					? `Completed in ${message.num_turns} turns`
					: `Failed with ${message.subtype}`,
		};
	}

	return null;
}

function getResultMessage(messages: SDKMessage[]): SDKResultMessage {
	const result = messages.find(
		(message): message is SDKResultMessage => message.type === "result",
	);
	if (!result) {
		throw new Error("Claude Agent SDK query returned no result message.");
	}
	return result;
}

function pathViolatesPolicy(
	rawInput: unknown,
	workspaceDir: string,
): string | null {
	if (!rawInput || typeof rawInput !== "object") {
		return null;
	}

	for (const value of Object.values(rawInput as Record<string, unknown>)) {
		if (typeof value === "string") {
			if (value.includes(".env")) {
				return "Access to .env files is blocked.";
			}
			if (value.includes(".git")) {
				return "Access to .git paths is blocked.";
			}
			if (
				(value.startsWith("/") || value.includes("/")) &&
				!value.startsWith(workspaceDir)
			) {
				return `Path ${value} is outside the allowed workspace.`;
			}
		}
		if (typeof value === "object") {
			const nestedViolation = pathViolatesPolicy(value, workspaceDir);
			if (nestedViolation) {
				return nestedViolation;
			}
		}
	}

	return null;
}

function createWorkspaceHooks(
	workspaceDir: string,
): Partial<Record<string, HookCallbackMatcher[]>> {
	return {
		PreToolUse: [
			{
				hooks: [
					async (input) => {
						if (input.hook_event_name !== "PreToolUse") {
							return {};
						}
						if (input.tool_name === "Bash" || input.tool_name === "WebFetch") {
							return {
								hookSpecificOutput: {
									hookEventName: "PreToolUse",
									permissionDecision: "deny",
									permissionDecisionReason: `${input.tool_name} is disabled in this harness.`,
								},
							};
						}

						const violation = pathViolatesPolicy(
							input.tool_input,
							workspaceDir,
						);
						if (!violation) {
							return {};
						}

						return {
							hookSpecificOutput: {
								hookEventName: "PreToolUse",
								permissionDecision: "deny",
								permissionDecisionReason: violation,
							},
						};
					},
				],
			},
		],
	};
}

async function runClaudeQuery<TStructured>(
	runQuery: QueryFunction,
	prompt: string,
	options: Parameters<QueryFunction>[0]["options"],
): Promise<QueryRunResult<TStructured>> {
	const messages: SDKMessage[] = [];
	const events: AgentEventSummary[] = [];

	for await (const message of runQuery({ prompt, options })) {
		messages.push(message);
		const event = summarizeMessage(message);
		if (event) {
			events.push(event);
		}
	}

	const result = getResultMessage(messages);
	if (result.subtype !== "success") {
		throw new Error(result.errors.join("; "));
	}

	return {
		agentRun: {
			sessionId: result.session_id,
			model: SDK_MODEL,
			numTurns: result.num_turns,
			totalCostUsd: result.total_cost_usd,
			stopReason: result.stop_reason,
			permissionDenials: result.permission_denials.map(
				(denial) => `${denial.tool_name}: ${JSON.stringify(denial.tool_input)}`,
			),
		},
		events,
		structuredOutput: result.structured_output as TStructured | undefined,
	};
}

async function planRobloxSpec(
	apiKey: string,
	prompt: string,
	workspaceDir: string,
	runQuery: QueryFunction,
): Promise<QueryRunResult<RobloxGameSpec>> {
	return runClaudeQuery<RobloxGameSpec>(
		runQuery,
		[
			"Expand this vague prompt into a Roblox MVP spec.",
			"Bias toward social hangout mechanics, visible progression, and clear acceptance tests.",
			`Prompt: ${prompt}`,
		].join("\n\n"),
		{
			agent: "roblox_intent_planner",
			agents: AGENTS,
			cwd: workspaceDir,
			env: {
				...process.env,
				ANTHROPIC_API_KEY: apiKey,
				CLAUDE_AGENT_SDK_CLIENT_APP: SDK_CLIENT_APP,
			},
			maxTurns: 4,
			model: SDK_MODEL,
			outputFormat: {
				type: "json_schema",
				schema: robloxGameSpecJsonSchema,
			},
			permissionMode: "plan",
			settingSources: ["project"],
			systemPrompt: {
				type: "preset",
				preset: "claude_code",
				append:
					"Treat this repository as a Roblox scaffold generator, not a browser game generator.",
			},
			tools: [],
		},
	);
}

async function materializeProject(
	apiKey: string,
	prompt: string,
	spec: RobloxGameSpec,
	workspaceDir: string,
	runQuery: QueryFunction,
	resume?: string,
	repairContext?: RobloxEvalSuiteResult,
): Promise<QueryRunResult> {
	const repairPrompt = repairContext
		? [
				"Repair the Roblox scaffold based on these failed evals.",
				JSON.stringify(repairContext, null, 2),
			].join("\n\n")
		: [
				"Materialize the Roblox project in the current workspace.",
				"Only edit src/server/Mechanic.server.luau, src/client/Mechanic.client.luau, and src/shared/GameSpec.json.",
				"Do not change fixed scaffold files.",
				`Original prompt: ${prompt}`,
				`Spec:\n${JSON.stringify(spec, null, 2)}`,
			].join("\n\n");

	return runClaudeQuery(runQuery, repairPrompt, {
		agent: repairContext ? "eval_repair" : "rojo_builder",
		agents: AGENTS,
		cwd: workspaceDir,
		disallowedTools: ["Bash", "WebFetch"],
		enableFileCheckpointing: true,
		env: {
			...process.env,
			ANTHROPIC_API_KEY: apiKey,
			CLAUDE_AGENT_SDK_CLIENT_APP: SDK_CLIENT_APP,
		},
		hooks: createWorkspaceHooks(workspaceDir),
		maxTurns: repairContext ? 4 : 8,
		model: SDK_MODEL,
		permissionMode: "acceptEdits",
		resume,
		settingSources: ["project"],
		systemPrompt: {
			type: "preset",
			preset: "claude_code",
			append:
				"Never touch .env, .git, or files outside the run workspace. Stay inside the Roblox scaffold contract.",
		},
		tools: ["Read", "Edit", "Write", "Glob", "Grep", "LS"],
	});
}

export async function generateRobloxRun(
	request: {
		generationId: string;
		prompt: string;
		referenceImageUrl?: string | null;
	},
	dependencies: {
		runQuery?: QueryFunction;
	} = {},
): Promise<GenerateRunResponse> {
	const apiKey = ensureAnthropicApiKey();
	const runQuery = dependencies.runQuery ?? query;
	const { workspaceDir } = await createRunWorkspace(request.generationId);
	const templateBundle = await getTemplateBundle();
	const expectedScaffoldChecksum = getFixedScaffoldChecksum(templateBundle);

	const specRun = await planRobloxSpec(
		apiKey,
		request.prompt,
		workspaceDir,
		runQuery,
	);
	if (!specRun.structuredOutput) {
		throw new Error("Planner returned no structured Roblox spec.");
	}

	await writeSpecToWorkspace(workspaceDir, specRun.structuredOutput);

	const buildRun = await materializeProject(
		apiKey,
		request.prompt,
		specRun.structuredOutput,
		workspaceDir,
		runQuery,
	);
	let artifactBundle = await loadArtifactBundle(workspaceDir);
	let evalSuite = await runRobloxEvals(
		apiKey,
		request.prompt,
		specRun.structuredOutput,
		artifactBundle,
		expectedScaffoldChecksum,
	);
	let agentRun = buildRun.agentRun;
	let events = [...specRun.events, ...buildRun.events];

	if (!evalSuite.artifact.pass || !evalSuite.roblox.pass) {
		const repairRun = await materializeProject(
			apiKey,
			request.prompt,
			specRun.structuredOutput,
			workspaceDir,
			runQuery,
			buildRun.agentRun.sessionId,
			evalSuite,
		);
		artifactBundle = await loadArtifactBundle(workspaceDir);
		evalSuite = await runRobloxEvals(
			apiKey,
			request.prompt,
			specRun.structuredOutput,
			artifactBundle,
			expectedScaffoldChecksum,
		);
		agentRun = repairRun.agentRun;
		events = [...events, ...repairRun.events];
	}

	return generateRunResponseSchema.parse({
		spec: specRun.structuredOutput,
		artifactBundle: {
			...artifactBundle,
			artifactType: ARTIFACT_TYPE,
			scaffoldVersion: HARNESS_VERSION,
		},
		agentRun,
		evalSuite,
		events,
		artifactType: ARTIFACT_TYPE,
		evalProfile: EVAL_PROFILE,
	});
}
