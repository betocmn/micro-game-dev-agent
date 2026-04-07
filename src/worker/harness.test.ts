import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HarnessStageError } from "./errors";

const { runRobloxEvalsMock } = vi.hoisted(() => ({
	runRobloxEvalsMock: vi.fn(),
}));

vi.mock("@/evals/robloxRunEvals", () => ({
	runRobloxEvals: runRobloxEvalsMock,
}));

import {
	evaluateRobloxRun,
	generateRobloxRun,
	getWorkspaceToolViolation,
} from "./harness";

describe("generateRobloxRun", () => {
	const generationId = "harness-fallback-test";
	const runDir = path.join(process.cwd(), ".context/runs", generationId);

	beforeEach(() => {
		vi.clearAllMocks();
		process.env.ANTHROPIC_API_KEY = "test-key";
		process.env.OPENROUTER_API_KEY = "test-openrouter-key";
		runRobloxEvalsMock.mockResolvedValue({
			artifact: {
				pass: true,
				requiredFilesPresent: true,
				schemaValid: true,
				scaffoldChecksumMatch: true,
				editableBoundaryRespected: true,
				missingFiles: [],
				notes: [],
			},
			roblox: {
				pass: true,
				serverClientSplit: true,
				bannedApis: [],
				contractExportsPresent: true,
				remoteSignals: ["RemoteEvent", "FireClient", "FireServer"],
				socialSignals: ["social", "friends", "group"],
				notes: [],
			},
			judge: {
				robloxFit: 4,
				promptFidelity: 4,
				socialLoopQuality: 4,
				clarity: 4,
				summary: "Looks good",
				criticalMisses: [],
			},
			summaryScore: 92,
		});
	});

	afterEach(async () => {
		await rm(runDir, { force: true, recursive: true });
	});

	it("falls back to deterministic scaffold generation when Claude fails", async () => {
		const failingQuery = (() => ({
			close() {},
			[Symbol.asyncIterator]() {
				return {
					async next() {
						throw new Error("forced sdk failure");
					},
				};
			},
		})) as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query;

		const result = await generateRobloxRun(
			{
				generationId,
				prompt: "mall hang vibes",
			},
			{
				runQuery: failingQuery,
			},
		);

		expect(result.spec.title).toBe("Mall Hang Vibes Hangout");
		expect(result.agentRun.sessionId).toBe(`fallback-${generationId}`);
		expect(result.evalSuite.summaryScore).toBe(92);
		expect(
			result.events.some(
				(event) =>
					event.type === "fallback" &&
					event.summary === "planner fallback used",
			),
		).toBe(true);
		expect(
			result.events.some(
				(event) =>
					event.type === "fallback" &&
					event.summary === "builder fallback used",
			),
		).toBe(true);

		const specFile = result.artifactBundle.files.find(
			(file) => file.path === "src/shared/GameSpec.json",
		);
		const serverFile = result.artifactBundle.files.find(
			(file) => file.path === "src/server/Mechanic.server.luau",
		);
		expect(specFile?.content).toContain("Mall Hang Vibes Hangout");
		expect(serverFile?.content).toContain("RemoteEvent");
		expect(runRobloxEvalsMock).toHaveBeenCalledOnce();
	});

	it("tags eval failures with the evaluating stage", async () => {
		runRobloxEvalsMock.mockRejectedValueOnce(new Error("eval exploded"));
		const failingQuery = (() => ({
			close() {},
			[Symbol.asyncIterator]() {
				return {
					async next() {
						throw new Error("forced sdk failure");
					},
				};
			},
		})) as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query;

		expect.assertions(2);

		try {
			await generateRobloxRun(
				{
					generationId,
					prompt: "mall hang vibes",
				},
				{
					runQuery: failingQuery,
				},
			);
		} catch (error) {
			expect(error).toBeInstanceOf(HarnessStageError);
			expect(error).toMatchObject({
				message: "eval exploded",
				failureStage: "evaluating",
			});
		}
	});
});

describe("evaluateRobloxRun", () => {
	const generationId = "harness-evaluate-no-repair";
	const runDir = path.join(process.cwd(), ".context/runs", generationId);
	const spec = {
		title: "Mall Hang Vibes Hangout",
		experienceType: "hangout" as const,
		fantasy: "After-school mall hangout",
		coreLoop: "Meet up and emote together",
		socialLoop: "Players invite friends to join shared dance spots",
		progressionHook: "Earn style tokens for time spent in groups",
		serverAuthoritativeRules: ["server owns rewards"],
		clientFeedback: ["show dance prompts"],
		worldObjects: [
			{ name: "Dance Floor", purpose: "group activity", placement: "center" },
		],
		acceptanceTests: ["players can discover a shared activity quickly"],
	};
	const artifactBundle = {
		artifactType: "roblox-rojo" as const,
		scaffoldVersion: "claude-rojo-v1",
		files: [
			{
				path: "src/server/Mechanic.server.luau",
				content: 'return { remote = "SocialLoopEvent" }',
				editable: true,
				language: "luau" as const,
			},
		],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.ANTHROPIC_API_KEY;
		process.env.OPENROUTER_API_KEY = "test-openrouter-key";
		runRobloxEvalsMock.mockResolvedValue({
			artifact: {
				pass: true,
				requiredFilesPresent: true,
				schemaValid: true,
				scaffoldChecksumMatch: true,
				editableBoundaryRespected: true,
				missingFiles: [],
				notes: [],
			},
			roblox: {
				pass: true,
				serverClientSplit: true,
				bannedApis: [],
				contractExportsPresent: true,
				remoteSignals: ["RemoteEvent"],
				socialSignals: ["friends", "group"],
				notes: [],
			},
			judge: {
				robloxFit: 4,
				promptFidelity: 4,
				socialLoopQuality: 4,
				clarity: 4,
				summary: "Looks good",
				criticalMisses: [],
			},
			summaryScore: 92,
		});
	});

	afterEach(async () => {
		await rm(runDir, { force: true, recursive: true });
	});

	it("does not require Anthropic when evaluation completes without repair", async () => {
		const result = await evaluateRobloxRun({
			generationId,
			prompt: "mall hang vibes",
			spec,
			artifactBundle,
		});

		expect(result.agentRun).toBeNull();
		expect(result.events).toEqual([]);
		expect(result.evalSuite.summaryScore).toBe(92);
		expect(runRobloxEvalsMock).toHaveBeenCalledOnce();
		expect(runRobloxEvalsMock).toHaveBeenCalledWith(
			{
				judgeApiKey: "test-openrouter-key",
				judgeModel: "openai/gpt-5-mini",
			},
			"mall hang vibes",
			spec,
			artifactBundle,
			expect.any(String),
		);
	});
});

describe("getWorkspaceToolViolation", () => {
	const workspaceDir = path.join(
		process.cwd(),
		".context/runs",
		"harness-policy-test",
		"workspace",
	);

	it("allows edit payload content that contains Luau concatenation", () => {
		expect(
			getWorkspaceToolViolation(
				"Edit",
				{
					file_path: path.join(workspaceDir, "src/server/Mechanic.server.luau"),
					old_string: 'return "ready"',
					new_string: 'return player.Name .. " ready"',
				},
				workspaceDir,
			),
		).toBeNull();
	});

	it("blocks mutating fixed scaffold files", () => {
		expect(
			getWorkspaceToolViolation(
				"Write",
				{
					file_path: path.join(workspaceDir, "default.project.json"),
					content: "{}",
				},
				workspaceDir,
			),
		).toBe(
			"Edits are restricted to src/client/Mechanic.client.luau, src/server/Mechanic.server.luau, src/shared/GameSpec.json.",
		);
	});

	it("still blocks traversal in path arguments", () => {
		const traversalPath = `${workspaceDir}/../secrets.txt`;

		expect(
			getWorkspaceToolViolation(
				"Read",
				{
					file_path: traversalPath,
				},
				workspaceDir,
			),
		).toBe(`Path traversal is blocked: ${traversalPath}`);
	});
});
