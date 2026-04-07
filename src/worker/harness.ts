import path from "node:path";
import {
	type AgentDefinition,
	type HookCallbackMatcher,
	query,
	type SDKMessage,
	type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { runRobloxEvals } from "@/evals/robloxRunEvals";
import { ensureLocalEnvLoaded } from "@/lib/loadEnv";
import { isPathWithinDirectory } from "@/lib/runIdNode";
import {
	evaluateRunResponseSchema,
	generateRunResponseSchema,
	materializeRunResponseSchema,
} from "@/lib/schemas";
import type {
	AgentEventSummary,
	AgentRunSummary,
	EvaluateRunResponse,
	GenerateRunResponse,
	GenerationFailureStage,
	MaterializeRunResponse,
	RobloxEvalSuiteResult,
	RobloxGameSpec,
} from "@/types";
import { ARTIFACT_TYPE, HARNESS_VERSION } from "./constants";
import { HarnessStageError } from "./errors";
import {
	deriveRobloxSpecFromPrompt,
	materializeFallbackProject,
} from "./fallback";
import { robloxGameSpecJsonSchema } from "./jsonSchemas";
import {
	assertWorkspaceExists,
	createRunWorkspace,
	getEditableFileSet,
	getFixedScaffoldChecksum,
	getRunWorkspacePaths,
	getTemplateBundle,
	loadArtifactBundle,
	writeSpecToWorkspace,
} from "./workspace";

const SDK_MODEL = "claude-sonnet-4-5";
const SDK_CLIENT_APP = "caracas-v4/0.1.0";
const PLANNER_TIMEOUT_MS = 120000;
const BUILDER_TIMEOUT_MS = 300000;
const REPAIR_TIMEOUT_MS = 180000;
const MUTATING_TOOL_NAMES = new Set(["Edit", "Write", "NotebookEdit"]);
const DEFAULT_ROBLOX_JUDGE_MODEL = "openai/gpt-5-mini";

type QueryFunction = typeof query;

interface QueryRunResult<TStructured = unknown> {
	agentRun: AgentRunSummary;
	events: AgentEventSummary[];
	structuredOutput?: TStructured;
}

interface ClaudeQueryBehavior {
	label: string;
	timeoutMs: number;
}

const AGENTS: Record<string, AgentDefinition> = {
	roblox_intent_planner: {
		description: "Expands vague prompts into strict Roblox game specs.",
		maxTurns: 8,
		model: "sonnet",
		prompt:
			"You plan Roblox MVP specs for teen-friendly social experiences. Prefer one strong social loop, light progression, and explicit server-authoritative rules. Finish decisively with the required structured output instead of iterating.",
		tools: [],
	},
	rojo_builder: {
		description: "Edits the allowed scaffold files to realize the Roblox spec.",
		maxTurns: 12,
		model: "sonnet",
		prompt:
			"You are editing a constrained Rojo scaffold. Only change the allowed Luau and GameSpec files. Keep the project compatible with social Roblox MVPs, maintain a clear server/client split, and complete the implementation within the allowed files without exploratory turns.",
		tools: ["Read", "Edit", "Write", "Glob", "Grep", "LS"],
	},
	eval_repair: {
		description: "Repairs scaffold files after eval failures.",
		maxTurns: 6,
		model: "sonnet",
		prompt:
			"You repair Roblox scaffold files after proxy eval failures. Make the minimum changes needed to fix the failing checks while preserving the requested fantasy and social loop.",
		tools: ["Read", "Edit", "Write", "Glob", "Grep", "LS"],
	},
} as const;

function ensureAnthropicApiKey(): string {
	ensureLocalEnvLoaded();
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error(
			"ANTHROPIC_API_KEY is not configured for the harness worker.",
		);
	}
	return apiKey;
}

function ensureOpenRouterApiKey(): string {
	ensureLocalEnvLoaded();
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new Error(
			"OPENROUTER_API_KEY is not configured for the harness worker.",
		);
	}
	return apiKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function truncateSummary(text: string, maxLength = 220): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}

	return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function stringifyUnknown(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	const serialized = JSON.stringify(value);
	return serialized ?? String(value);
}

function serializeTracePayload(message: SDKMessage): string {
	return stringifyUnknown(message);
}

function extractAssistantContentSummary(message: SDKMessage): string | null {
	if (message.type !== "assistant") {
		return null;
	}

	const content = isRecord(message.message) ? message.message.content : null;
	if (!Array.isArray(content)) {
		return null;
	}

	for (const block of content) {
		if (!isRecord(block)) {
			continue;
		}

		if (typeof block.text === "string" && block.text.trim().length > 0) {
			return truncateSummary(block.text);
		}

		if (
			typeof block.thinking === "string" &&
			block.thinking.trim().length > 0
		) {
			return truncateSummary(`Thinking: ${block.thinking}`);
		}

		if (typeof block.name === "string") {
			return `Assistant called ${block.name}.`;
		}
	}

	return null;
}

function summarizeResultMessage(message: SDKResultMessage): string {
	if (message.subtype !== "success") {
		return `Failed with ${message.subtype}`;
	}

	if (message.result.trim().length > 0) {
		return truncateSummary(message.result);
	}

	return `Completed in ${message.num_turns} turns`;
}

function createTraceEvent(
	type: string,
	summary: string,
	message: SDKMessage,
): AgentEventSummary {
	return {
		type,
		summary,
		payload: serializeTracePayload(message),
	};
}

function summarizeMessage(message: SDKMessage): AgentEventSummary | null {
	if (message.type === "tool_use_summary") {
		return createTraceEvent("tool_use_summary", message.summary, message);
	}

	if (message.type === "tool_progress") {
		return createTraceEvent(
			"tool_progress",
			`${message.tool_name} running for ${message.elapsed_time_seconds}s`,
			message,
		);
	}

	if (message.type === "system") {
		if (message.subtype === "init") {
			return createTraceEvent(
				"init",
				`Session initialized with ${message.model} in ${message.cwd}`,
				message,
			);
		}
		if (message.subtype === "task_progress") {
			return createTraceEvent(
				"task_progress",
				message.summary ?? message.description,
				message,
			);
		}
		if (message.subtype === "task_started") {
			return createTraceEvent("task_started", message.description, message);
		}
		if (message.subtype === "task_notification") {
			return createTraceEvent("task_notification", message.summary, message);
		}
		if (message.subtype === "session_state_changed") {
			return createTraceEvent(
				"session_state_changed",
				`Session is ${message.state}`,
				message,
			);
		}
		if (message.subtype === "status" && message.status) {
			return createTraceEvent("status", message.status, message);
		}
		if (message.subtype === "api_retry") {
			return createTraceEvent(
				"api_retry",
				`Retry ${message.attempt}/${message.max_retries} after ${message.error}`,
				message,
			);
		}
		if (message.subtype === "local_command_output") {
			return createTraceEvent(
				"local_command_output",
				truncateSummary(message.content),
				message,
			);
		}
		if (message.subtype === "hook_started") {
			return createTraceEvent(
				"hook_started",
				`${message.hook_name} started for ${message.hook_event}`,
				message,
			);
		}
		if (message.subtype === "hook_progress") {
			return createTraceEvent(
				"hook_progress",
				`${message.hook_name} produced output`,
				message,
			);
		}
		if (message.subtype === "hook_response") {
			return createTraceEvent(
				"hook_response",
				`${message.hook_name} ${message.outcome}`,
				message,
			);
		}
		if (message.subtype === "files_persisted") {
			return createTraceEvent(
				"files_persisted",
				`${message.files.length} files persisted`,
				message,
			);
		}
		if (message.subtype === "compact_boundary") {
			return createTraceEvent(
				"compact_boundary",
				`Context compacted (${message.compact_metadata.trigger})`,
				message,
			);
		}
		if (message.subtype === "elicitation_complete") {
			return createTraceEvent(
				"elicitation_complete",
				`Elicitation completed for ${message.mcp_server_name}`,
				message,
			);
		}
	}

	if (message.type === "assistant") {
		return createTraceEvent(
			"assistant",
			extractAssistantContentSummary(message) ??
				"Assistant responded with an implementation update.",
			message,
		);
	}

	if (message.type === "result") {
		return createTraceEvent("result", summarizeResultMessage(message), message);
	}

	if (message.type === "auth_status") {
		return createTraceEvent(
			"auth_status",
			truncateSummary(message.output.join(" ")),
			message,
		);
	}

	if (message.type === "prompt_suggestion") {
		return createTraceEvent("prompt_suggestion", message.suggestion, message);
	}

	if (message.type === "rate_limit_event") {
		return createTraceEvent(
			"rate_limit_event",
			"Rate limit status updated.",
			message,
		);
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

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function createFallbackEvent(
	stage: "planner" | "builder" | "repair",
	error: unknown,
): AgentEventSummary {
	return {
		type: "fallback",
		summary: `${stage} fallback used`,
		payload: getErrorMessage(error),
	};
}

function createFallbackAgentRun(
	generationId: string,
	stage: string,
): AgentRunSummary {
	return {
		sessionId: `fallback-${generationId}`,
		model: "fallback-template",
		numTurns: 0,
		totalCostUsd: 0,
		stopReason: `fallback-${stage}`,
		permissionDenials: [],
	};
}

function toHarnessStageError(
	stage: GenerationFailureStage,
	error: unknown,
): HarnessStageError {
	if (error instanceof HarnessStageError) {
		return error;
	}

	return new HarnessStageError(getErrorMessage(error), stage);
}

function isPathInputKey(key: string): boolean {
	return key === "path" || key.endsWith("_path");
}

function getToolPathInputs(toolName: string, rawInput: unknown): string[] {
	const pathInputs = getPathInputs(rawInput);
	if (!rawInput || typeof rawInput !== "object") {
		return pathInputs;
	}

	const toolInput = rawInput as Record<string, unknown>;
	if (toolName === "Glob" && typeof toolInput.pattern === "string") {
		return [...pathInputs, toolInput.pattern];
	}

	if (toolName === "Grep" && typeof toolInput.glob === "string") {
		return [...pathInputs, toolInput.glob];
	}

	return pathInputs;
}

function getPathInputs(
	rawInput: unknown,
	currentKey: string | null = null,
): string[] {
	if (typeof rawInput === "string") {
		return currentKey && isPathInputKey(currentKey) ? [rawInput] : [];
	}

	if (Array.isArray(rawInput)) {
		return rawInput.flatMap((value) => getPathInputs(value, currentKey));
	}

	if (!rawInput || typeof rawInput !== "object") {
		return [];
	}

	return Object.entries(rawInput as Record<string, unknown>).flatMap(
		([key, value]) => getPathInputs(value, key),
	);
}

function hasTraversalSegment(rawPath: string): boolean {
	return rawPath.split(/[\\/]+/).includes("..");
}

function resolveWorkspaceRelativePath(
	workspaceDir: string,
	candidatePath: string,
): string | null {
	const resolvedPath = path.resolve(workspaceDir, candidatePath);
	if (!isPathWithinDirectory(workspaceDir, resolvedPath)) {
		return null;
	}

	const relativePath = path
		.relative(path.resolve(workspaceDir), resolvedPath)
		.replaceAll(path.sep, "/");

	return relativePath.length === 0 ? "." : relativePath;
}

function pathViolatesPolicy(
	toolName: string,
	rawInput: unknown,
	workspaceDir: string,
): string | null {
	for (const value of getToolPathInputs(toolName, rawInput)) {
		if (value.includes(".env")) {
			return "Access to .env files is blocked.";
		}
		if (value.includes(".git")) {
			return "Access to .git paths is blocked.";
		}
		if (hasTraversalSegment(value)) {
			return `Path traversal is blocked: ${value}`;
		}
		if (resolveWorkspaceRelativePath(workspaceDir, value) === null) {
			return `Path ${value} is outside the allowed workspace.`;
		}
	}

	return null;
}

function editViolatesPolicy(
	toolName: string,
	rawInput: unknown,
	workspaceDir: string,
): string | null {
	if (!MUTATING_TOOL_NAMES.has(toolName)) {
		return null;
	}

	if (!rawInput || typeof rawInput !== "object") {
		return null;
	}

	const pathKey = toolName === "NotebookEdit" ? "notebook_path" : "file_path";
	const targetPath = (rawInput as Record<string, unknown>)[pathKey];
	if (typeof targetPath !== "string") {
		return null;
	}

	const relativePath = resolveWorkspaceRelativePath(workspaceDir, targetPath);
	if (!relativePath) {
		return null;
	}

	const editableFiles = getEditableFileSet();
	if (editableFiles.has(relativePath)) {
		return null;
	}

	return `Edits are restricted to ${Array.from(editableFiles).join(", ")}.`;
}

export function getWorkspaceToolViolation(
	toolName: string,
	toolInput: unknown,
	workspaceDir: string,
): string | null {
	return (
		pathViolatesPolicy(toolName, toolInput, workspaceDir) ??
		editViolatesPolicy(toolName, toolInput, workspaceDir)
	);
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

						const violation = getWorkspaceToolViolation(
							input.tool_name,
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
	behavior: ClaudeQueryBehavior,
): Promise<QueryRunResult<TStructured>> {
	const messages: SDKMessage[] = [];
	const events: AgentEventSummary[] = [];
	const abortController = new AbortController();
	const queryRun = runQuery({
		prompt,
		options: {
			...options,
			abortController,
		},
	});
	const timeout = setTimeout(() => {
		abortController.abort(`${behavior.label} timed out`);
	}, behavior.timeoutMs);

	try {
		for await (const message of queryRun) {
			messages.push(message);
			const event = summarizeMessage(message);
			if (event) {
				events.push(event);
			}
		}

		const result = getResultMessage(messages);
		if (result.subtype !== "success") {
			throw new Error(
				result.errors.join("; ") || `${behavior.label} did not succeed.`,
			);
		}

		return {
			agentRun: {
				sessionId: result.session_id,
				model: SDK_MODEL,
				numTurns: result.num_turns,
				totalCostUsd: result.total_cost_usd,
				stopReason: result.stop_reason,
				permissionDenials: result.permission_denials.map(
					(denial) =>
						`${denial.tool_name}: ${JSON.stringify(denial.tool_input)}`,
				),
			},
			events,
			structuredOutput: result.structured_output as TStructured | undefined,
		};
	} catch (error) {
		if (abortController.signal.aborted) {
			throw new Error(
				`${behavior.label} timed out after ${behavior.timeoutMs}ms.`,
			);
		}
		throw error;
	} finally {
		clearTimeout(timeout);
		if (
			abortController.signal.aborted &&
			"close" in (queryRun as object) &&
			typeof (queryRun as { close?: () => void }).close === "function"
		) {
			(queryRun as { close: () => void }).close();
		}
	}
}

function createPlannerPrompt(prompt: string) {
	return [
		"Expand this vague prompt into one strict Roblox MVP spec.",
		"Prefer teen-friendly social hangouts, one clear social loop, visible progression, and acceptance tests that can be proxy-evaluated.",
		"Return the structured result decisively without asking follow-up questions.",
		`Prompt: ${prompt}`,
	].join("\n\n");
}

function createBuilderPrompt(
	prompt: string,
	spec: RobloxGameSpec,
	repairContext?: RobloxEvalSuiteResult,
) {
	if (repairContext) {
		return [
			"Repair the Roblox scaffold based on these failed evals.",
			"Only touch src/server/Mechanic.server.luau, src/client/Mechanic.client.luau, and src/shared/GameSpec.json.",
			`Eval failures:\n${JSON.stringify(repairContext, null, 2)}`,
		].join("\n\n");
	}

	return [
		"Materialize the Roblox project in the current workspace.",
		"Only edit src/server/Mechanic.server.luau, src/client/Mechanic.client.luau, and src/shared/GameSpec.json.",
		"Do not change fixed scaffold files.",
		"Implement a working server/client split that reflects the social loop and progression hook.",
		`Original prompt: ${prompt}`,
		`Spec:\n${JSON.stringify(spec, null, 2)}`,
	].join("\n\n");
}

function getPreferredAgentRun(
	generationId: string,
	runs: Array<{ agentRun: AgentRunSummary } | null | undefined>,
	fallbackStage: string,
): AgentRunSummary {
	for (const run of runs) {
		if (run) {
			return run.agentRun;
		}
	}

	return createFallbackAgentRun(generationId, fallbackStage);
}

function collectEvents(
	...eventGroups: Array<AgentEventSummary[] | undefined>
): AgentEventSummary[] {
	return eventGroups.flatMap((group) => group ?? []);
}

async function buildFallbackProject(
	workspaceDir: string,
	spec: RobloxGameSpec,
): Promise<void> {
	await materializeFallbackProject(workspaceDir, spec);
}

async function evaluateBundle(
	judgeApiKey: string,
	judgeModel: string,
	prompt: string,
	spec: RobloxGameSpec,
	workspaceDir: string,
	expectedScaffoldChecksum: string,
) {
	const artifactBundle = await loadArtifactBundle(workspaceDir);
	const evalSuite = await runRobloxEvals(
		{ judgeApiKey, judgeModel },
		prompt,
		spec,
		artifactBundle,
		expectedScaffoldChecksum,
	);

	return { artifactBundle, evalSuite };
}

async function planRobloxSpec(
	apiKey: string,
	prompt: string,
	workspaceDir: string,
	runQuery: QueryFunction,
): Promise<QueryRunResult<RobloxGameSpec>> {
	return runClaudeQuery<RobloxGameSpec>(
		runQuery,
		createPlannerPrompt(prompt),
		{
			agent: "roblox_intent_planner",
			agents: AGENTS,
			cwd: workspaceDir,
			env: {
				...process.env,
				ANTHROPIC_API_KEY: apiKey,
				CLAUDE_AGENT_SDK_CLIENT_APP: SDK_CLIENT_APP,
			},
			maxTurns: 6,
			model: SDK_MODEL,
			outputFormat: {
				type: "json_schema",
				schema: robloxGameSpecJsonSchema,
			},
			permissionMode: "plan",
			systemPrompt:
				"You turn vague Roblox prompts into concise structured specs for a fixed Rojo scaffold. Focus on social-hangout MVPs and finish with the required JSON output.",
			tools: [],
		},
		{
			label: "Planner",
			timeoutMs: PLANNER_TIMEOUT_MS,
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
	return runClaudeQuery(
		runQuery,
		createBuilderPrompt(prompt, spec, repairContext),
		{
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
			maxTurns: repairContext ? 8 : 14,
			model: SDK_MODEL,
			permissionMode: "acceptEdits",
			resume,
			settingSources: ["project"],
			systemPrompt: {
				type: "preset",
				preset: "claude_code",
				append:
					"Treat this repository as a Roblox scaffold generator. Never touch .env, .git, or files outside the run workspace. Finish decisively inside the editable scaffold files.",
			},
			tools: ["Read", "Edit", "Write", "Glob", "Grep", "LS"],
		},
		{
			label: repairContext ? "Repair" : "Builder",
			timeoutMs: repairContext ? REPAIR_TIMEOUT_MS : BUILDER_TIMEOUT_MS,
		},
	);
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
	const materializedRun = await materializeRobloxRun(request, dependencies);
	const evaluatedRun = await evaluateRobloxRun(
		{
			generationId: request.generationId,
			prompt: request.prompt,
			spec: materializedRun.spec,
			artifactBundle: materializedRun.artifactBundle,
			resumeSessionId: materializedRun.resumeSessionId,
		},
		dependencies,
	);

	return generateRunResponseSchema.parse({
		spec: materializedRun.spec,
		artifactBundle: evaluatedRun.artifactBundle,
		agentRun: evaluatedRun.agentRun ?? materializedRun.agentRun,
		evalSuite: evaluatedRun.evalSuite,
		events: collectEvents(materializedRun.events, evaluatedRun.events),
	});
}

export async function materializeRobloxRun(
	request: {
		generationId: string;
		prompt: string;
		referenceImageUrl?: string | null;
	},
	dependencies: {
		runQuery?: QueryFunction;
	} = {},
): Promise<MaterializeRunResponse> {
	let failureStage: GenerationFailureStage = "setup";

	try {
		const apiKey = ensureAnthropicApiKey();
		const runQuery = dependencies.runQuery ?? query;
		const { workspaceDir } = await createRunWorkspace(request.generationId);
		const fallbackEvents: AgentEventSummary[] = [];

		failureStage = "expanding";
		let specRun: QueryRunResult<RobloxGameSpec> | null = null;
		let spec = deriveRobloxSpecFromPrompt(request.prompt);

		try {
			specRun = await planRobloxSpec(
				apiKey,
				request.prompt,
				workspaceDir,
				runQuery,
			);
			if (!specRun.structuredOutput) {
				throw new Error("Planner returned no structured Roblox spec.");
			}
			spec = specRun.structuredOutput;
		} catch (error) {
			fallbackEvents.push(createFallbackEvent("planner", error));
		}

		failureStage = "building";
		await writeSpecToWorkspace(workspaceDir, spec);

		let buildRun: QueryRunResult | null = null;
		try {
			buildRun = await materializeProject(
				apiKey,
				request.prompt,
				spec,
				workspaceDir,
				runQuery,
			);
		} catch (error) {
			fallbackEvents.push(createFallbackEvent("builder", error));
			await buildFallbackProject(workspaceDir, spec);
		}

		const artifactBundle = await loadArtifactBundle(workspaceDir);

		return materializeRunResponseSchema.parse({
			spec,
			artifactBundle: {
				...artifactBundle,
				artifactType: ARTIFACT_TYPE,
				scaffoldVersion: HARNESS_VERSION,
			},
			agentRun: getPreferredAgentRun(
				request.generationId,
				[buildRun, specRun],
				"builder",
			),
			events: collectEvents(specRun?.events, buildRun?.events, fallbackEvents),
			resumeSessionId: buildRun?.agentRun.sessionId ?? null,
		});
	} catch (error) {
		throw toHarnessStageError(failureStage, error);
	}
}

export async function evaluateRobloxRun(
	request: {
		generationId: string;
		prompt: string;
		spec: RobloxGameSpec;
		artifactBundle: MaterializeRunResponse["artifactBundle"];
		resumeSessionId?: string | null;
	},
	dependencies: {
		runQuery?: QueryFunction;
	} = {},
): Promise<EvaluateRunResponse> {
	let failureStage: GenerationFailureStage = "setup";

	try {
		const runQuery = dependencies.runQuery ?? query;
		const templateBundle = await getTemplateBundle();
		const expectedScaffoldChecksum = getFixedScaffoldChecksum(templateBundle);
		const { workspaceDir } = getRunWorkspacePaths(request.generationId);
		const fallbackEvents: AgentEventSummary[] = [];
		let artifactBundle = request.artifactBundle;
		let workspaceAvailable = false;

		try {
			await assertWorkspaceExists(workspaceDir);
			artifactBundle = await loadArtifactBundle(workspaceDir);
			workspaceAvailable = true;
		} catch {
			workspaceAvailable = false;
		}

		failureStage = "evaluating";
		const judgeApiKey = ensureOpenRouterApiKey();
		const judgeModel = DEFAULT_ROBLOX_JUDGE_MODEL;
		let evalSuite = await runRobloxEvals(
			{ judgeApiKey, judgeModel },
			request.prompt,
			request.spec,
			artifactBundle,
			expectedScaffoldChecksum,
		);

		let repairRun: QueryRunResult | null = null;
		const shouldRepair =
			workspaceAvailable &&
			(!evalSuite.artifact.pass || !evalSuite.roblox.pass);

		if (shouldRepair) {
			failureStage = "building";
			try {
				const anthropicApiKey = ensureAnthropicApiKey();
				repairRun = await materializeProject(
					anthropicApiKey,
					request.prompt,
					request.spec,
					workspaceDir,
					runQuery,
					request.resumeSessionId ?? undefined,
					evalSuite,
				);
			} catch (error) {
				fallbackEvents.push(createFallbackEvent("repair", error));
				await buildFallbackProject(workspaceDir, request.spec);
			}

			failureStage = "evaluating";
			({ artifactBundle, evalSuite } = await evaluateBundle(
				judgeApiKey,
				judgeModel,
				request.prompt,
				request.spec,
				workspaceDir,
				expectedScaffoldChecksum,
			));
		}

		return evaluateRunResponseSchema.parse({
			artifactBundle: {
				...artifactBundle,
				artifactType: ARTIFACT_TYPE,
				scaffoldVersion: HARNESS_VERSION,
			},
			evalSuite,
			agentRun: shouldRepair
				? getPreferredAgentRun(request.generationId, [repairRun], "repair")
				: null,
			events: shouldRepair
				? collectEvents(repairRun?.events, fallbackEvents)
				: [],
		});
	} catch (error) {
		throw toHarnessStageError(failureStage, error);
	}
}
