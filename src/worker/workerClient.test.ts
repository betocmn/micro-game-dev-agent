import { afterEach, describe, expect, it, vi } from "vitest";
import { HarnessStageError } from "./errors";
import {
	resolveHarnessWorkerUrl,
	runHarnessEvaluation,
	runHarnessMaterialization,
	runHarnessWorker,
} from "./workerClient";

const validSpec = {
	title: "Mall Hang",
	experienceType: "hangout" as const,
	fantasy: "mall",
	coreLoop: "hang",
	socialLoop: "dance together",
	progressionHook: "earn style",
	serverAuthoritativeRules: ["server owns rewards"],
	clientFeedback: ["show prompts"],
	worldObjects: [
		{
			name: "Stage",
			purpose: "party",
			placement: "center",
		},
	],
	acceptanceTests: ["players can spot the social loop"],
};

const validArtifactBundle = {
	artifactType: "roblox-rojo" as const,
	scaffoldVersion: "claude-rojo-v1",
	files: [
		{
			path: "default.project.json",
			content: "{}",
			editable: false,
			language: "json" as const,
		},
	],
};

describe("workerClient", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("prefers the explicit worker URL", () => {
		expect(resolveHarnessWorkerUrl("https://worker.test")).toBe(
			"https://worker.test",
		);
	});

	it("posts generate requests and returns parsed results", async () => {
		const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				spec: validSpec,
				artifactBundle: validArtifactBundle,
				agentRun: {
					sessionId: "session-1",
					model: "claude-sonnet-4-5",
					numTurns: 2,
					totalCostUsd: 0.1,
					stopReason: "completed",
					permissionDenials: [],
				},
				evalSuite: {
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
						remoteSignals: [],
						socialSignals: ["social"],
						notes: [],
					},
					judge: {
						robloxFit: 5,
						promptFidelity: 5,
						socialLoopQuality: 5,
						clarity: 5,
						summary: "Looks good",
						criticalMisses: [],
					},
					summaryScore: 100,
				},
				events: [],
			}),
		});

		const result = await runHarnessWorker(
			{
				generationId: "generation-1",
				prompt: "mall hang vibes",
			},
			{
				fetchImpl,
				url: "https://worker.test",
			},
		);

		expect(result.evalSuite.summaryScore).toBe(100);
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(timeoutSpy).toHaveBeenCalledWith(180000);
	});

	it("posts materialize requests and returns parsed results", async () => {
		const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				spec: validSpec,
				artifactBundle: validArtifactBundle,
				agentRun: {
					sessionId: "session-1",
					model: "claude-sonnet-4-5",
					numTurns: 2,
					totalCostUsd: 0.1,
					stopReason: "completed",
					permissionDenials: [],
				},
				events: [],
				resumeSessionId: "session-1",
			}),
		});

		const result = await runHarnessMaterialization(
			{
				generationId: "generation-1",
				prompt: "mall hang vibes",
			},
			{
				fetchImpl,
				url: "https://worker.test",
			},
		);

		expect(result.resumeSessionId).toBe("session-1");
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(timeoutSpy).toHaveBeenCalledWith(120000);
	});

	it("posts evaluation requests and returns parsed results", async () => {
		const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				artifactBundle: validArtifactBundle,
				evalSuite: {
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
						remoteSignals: [],
						socialSignals: ["social"],
						notes: [],
					},
					judge: {
						robloxFit: 5,
						promptFidelity: 5,
						socialLoopQuality: 5,
						clarity: 5,
						summary: "Looks good",
						criticalMisses: [],
					},
					summaryScore: 100,
				},
				agentRun: null,
				events: [],
			}),
		});

		const result = await runHarnessEvaluation(
			{
				generationId: "generation-1",
				prompt: "mall hang vibes",
				spec: validSpec,
				artifactBundle: validArtifactBundle,
				resumeSessionId: "session-1",
			},
			{
				fetchImpl,
				url: "https://worker.test",
			},
		);

		expect(result.artifactBundle.files).toHaveLength(1);
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(timeoutSpy).toHaveBeenCalledWith(120000);
	});

	it("surfaces worker failure stages from error responses", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: false,
			text: async () =>
				JSON.stringify({
					error: "Judge timed out",
					failureStage: "evaluating",
				}),
		});

		await expect(
			runHarnessWorker(
				{
					generationId: "generation-1",
					prompt: "mall hang vibes",
				},
				{
					fetchImpl,
					url: "https://worker.test",
				},
			),
		).rejects.toMatchObject({
			message: "Judge timed out",
			failureStage: "evaluating",
		});
		await expect(
			runHarnessWorker(
				{
					generationId: "generation-1",
					prompt: "mall hang vibes",
				},
				{
					fetchImpl,
					url: "https://worker.test",
				},
			),
		).rejects.toBeInstanceOf(HarnessStageError);
	});
});
