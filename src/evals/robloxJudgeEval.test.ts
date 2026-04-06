import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactBundle, RobloxEvalResult, RobloxGameSpec } from "@/types";
import { runRobloxJudgeEval } from "./robloxJudgeEval";

const prompt = "mall hang vibes";
const judgeApiKey = "openrouter-key";
const judgeModel = "openai/gpt-5-mini";

const spec: RobloxGameSpec = {
	title: "Mall Hang",
	experienceType: "hangout",
	fantasy: "Mall after school",
	coreLoop: "meet up and emote together",
	socialLoop: "players invite friends onto a dance floor",
	progressionHook: "earn style tokens for group hang time",
	serverAuthoritativeRules: ["server owns rewards", "server validates emotes"],
	clientFeedback: ["show join prompts", "show combo streaks"],
	worldObjects: [{ name: "Stage", purpose: "dance", placement: "center" }],
	acceptanceTests: ["players can discover a shared activity quickly"],
};

const artifactBundle: ArtifactBundle = {
	artifactType: "roblox-rojo",
	scaffoldVersion: "claude-rojo-v1",
	files: [
		{
			path: "src/server/Mechanic.server.luau",
			content: 'return { remote = "SocialLoopEvent" }',
			editable: true,
			language: "luau",
		},
		{
			path: "src/client/Mechanic.client.luau",
			content: 'return { prompt = "Join dance floor" }',
			editable: true,
			language: "luau",
		},
	],
};

const robloxEval: RobloxEvalResult = {
	pass: true,
	serverClientSplit: true,
	bannedApis: [],
	contractExportsPresent: true,
	remoteSignals: ["RemoteEvent"],
	socialSignals: ["friends", "dance"],
	notes: [],
};

describe("runRobloxJudgeEval", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	beforeEach(() => {
		vi.spyOn(AbortSignal, "timeout");
	});

	it("calls OpenRouter with the configured model and JSON mode", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [
					{
						message: {
							content: JSON.stringify({
								robloxFit: 5,
								promptFidelity: 4,
								socialLoopQuality: 5,
								clarity: 4,
								summary: "Strong scaffold match.",
								criticalMisses: [],
							}),
						},
					},
				],
			}),
		});
		const timeoutSignal = new AbortController().signal;

		vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
		vi.stubGlobal("fetch", fetchMock);

		const result = await runRobloxJudgeEval(
			judgeApiKey,
			judgeModel,
			prompt,
			spec,
			artifactBundle,
			robloxEval,
		);

		expect(result).toEqual({
			robloxFit: 5,
			promptFidelity: 4,
			socialLoopQuality: 5,
			clarity: 4,
			summary: "Strong scaffold match.",
			criticalMisses: [],
		});
		expect(AbortSignal.timeout).toHaveBeenCalledWith(20000);

		const [, options] = fetchMock.mock.calls[0];
		expect(options?.signal).toBe(timeoutSignal);
		const body = JSON.parse(String(options?.body));
		expect(body).toMatchObject({
			model: judgeModel,
			temperature: 0.2,
			max_tokens: 1024,
			response_format: { type: "json_object" },
		});
		expect(body.messages[0].content).toContain(
			"Return only the structured JSON grade",
		);
		expect(body.messages[1].content).toContain("Original prompt: mall hang vibes");
		expect(body.messages[1].content).toContain("Artifact bundle:");
		expect(body.messages[1].content).toContain("Proxy eval:");
	});

	it("falls back when OpenRouter returns a non-OK response", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			text: async () => "rate limited",
		});

		vi.stubGlobal("fetch", fetchMock);

		const result = await runRobloxJudgeEval(
			judgeApiKey,
			judgeModel,
			prompt,
			spec,
			artifactBundle,
			robloxEval,
		);

		expect(result.summary).toContain("Heuristic fallback judge used");
		expect(result.criticalMisses).toContain(
			"Judge fallback: OpenRouter API error (undefined): rate limited",
		);
	});

	it("falls back when the judge returns invalid JSON", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: "not-json" } }],
			}),
		});

		vi.stubGlobal("fetch", fetchMock);

		const result = await runRobloxJudgeEval(
			judgeApiKey,
			judgeModel,
			prompt,
			spec,
			artifactBundle,
			robloxEval,
		);

		expect(result.summary).toContain("Heuristic fallback judge used");
		expect(result.criticalMisses.at(-1)).toContain("Judge fallback:");
	});

	it("falls back when the response has no message content", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: {} }],
			}),
		});

		vi.stubGlobal("fetch", fetchMock);

		const result = await runRobloxJudgeEval(
			judgeApiKey,
			judgeModel,
			prompt,
			spec,
			artifactBundle,
			robloxEval,
		);

		expect(result.summary).toContain("Heuristic fallback judge used");
		expect(result.criticalMisses).toContain(
			"Judge fallback: No content in OpenRouter response",
		);
	});

	it("falls back when the request times out", async () => {
		const controller = new AbortController();
		controller.abort(new Error("Judge timed out"));
		const fetchMock = vi
			.fn()
			.mockImplementation(async (_url: string, options?: RequestInit) => {
				throw options?.signal?.reason ?? new Error("signal missing");
			});

		vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
		vi.stubGlobal("fetch", fetchMock);

		const result = await runRobloxJudgeEval(
			judgeApiKey,
			judgeModel,
			prompt,
			spec,
			artifactBundle,
			robloxEval,
		);

		expect(result.summary).toContain("Heuristic fallback judge used");
		expect(result.criticalMisses).toContain(
			"Judge fallback: Judge timed out",
		);
	});
});
