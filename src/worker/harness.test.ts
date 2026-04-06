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

import { generateRobloxRun } from "./harness";

describe("generateRobloxRun", () => {
	const generationId = "harness-fallback-test";
	const runDir = path.join(process.cwd(), ".context/runs", generationId);

	beforeEach(() => {
		vi.clearAllMocks();
		process.env.ANTHROPIC_API_KEY = "test-key";
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
