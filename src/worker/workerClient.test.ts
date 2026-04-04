import { describe, expect, it, vi } from "vitest";
import { resolveHarnessWorkerUrl, runHarnessWorker } from "./workerClient";

describe("workerClient", () => {
	it("prefers the explicit worker URL", () => {
		expect(resolveHarnessWorkerUrl("https://worker.test")).toBe(
			"https://worker.test",
		);
	});

	it("posts generate requests and returns parsed results", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				spec: {
					title: "Mall Hang",
					experienceType: "hangout",
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
				},
				artifactBundle: {
					artifactType: "roblox-rojo",
					scaffoldVersion: "claude-rojo-v1",
					files: [
						{
							path: "default.project.json",
							content: "{}",
							editable: false,
							language: "json",
						},
					],
				},
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
	});
});
