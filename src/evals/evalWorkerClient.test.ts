import { describe, expect, it, vi } from "vitest";
import { resolveEvalRunnerUrl, runEvalWorker } from "./evalWorkerClient";

const validRequest = {
	prompt: "space dodge rocks",
	spec: {
		title: "Space Dodge",
		genre: "dodge" as const,
		theme: "space",
		playerGoal: "survive",
		controls: ["ArrowLeft", "ArrowRight"],
		entities: [{ name: "ship", role: "player" as const }],
		coreLoop: "dodge asteroids",
		winCondition: "survive long enough",
		loseCondition: "get hit",
		scoreRule: "+1 per second",
		visualStyle: "neon",
		acceptanceTests: ["player moves left and right"],
	},
	mechanicCode: "function initMechanic() {}",
	html: "<html></html>",
};

const validResponse = {
	runtime: {
		pass: true,
		errors: [],
		readySeen: true,
		snapshot: { tick: 1 },
	},
	interaction: {
		pass: true,
		durationMs: 12000,
		framesObserved: 12,
		stateChanged: true,
		scoreChanged: false,
		crashed: false,
	},
	judge: {
		genreMatch: 4,
		mechanicMatch: 4,
		goalMatch: 4,
		controlsMatch: 5,
		coherence: 4,
		summary: "Looks solid.",
		criticalMisses: [],
	},
	summaryScore: 88,
};

describe("resolveEvalRunnerUrl", () => {
	it("prefers an explicit worker URL", () => {
		expect(resolveEvalRunnerUrl("https://worker.test/evals")).toBe(
			"https://worker.test/evals",
		);
	});
});

describe("runEvalWorker", () => {
	it("returns parsed eval results", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => validResponse,
		});

		const result = await runEvalWorker(validRequest, {
			fetchImpl: fetchImpl as unknown as typeof fetch,
			url: "https://worker.test/evals",
		});

		expect(result.summaryScore).toBe(88);
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it("throws when the worker response is invalid", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ summaryScore: 12 }),
		});

		await expect(
			runEvalWorker(validRequest, {
				fetchImpl: fetchImpl as unknown as typeof fetch,
				url: "https://worker.test/evals",
			}),
		).rejects.toThrow();
	});
});
