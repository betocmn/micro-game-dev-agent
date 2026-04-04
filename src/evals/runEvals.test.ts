import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	GameSpec,
	InteractionEvalResult,
	JudgeEvalResult,
	RuntimeEvalResult,
} from "@/types";

vi.mock("./runtimeEval", () => ({
	runRuntimeEval: vi.fn(),
}));
vi.mock("./interactionEval", () => ({
	runInteractionEval: vi.fn(),
}));
vi.mock("./judgeEval", () => ({
	runJudgeEval: vi.fn(),
}));

import { runInteractionEval } from "./interactionEval";
import { runJudgeEval } from "./judgeEval";
import { runAllEvals } from "./runEvals";
import { runRuntimeEval } from "./runtimeEval";

const mockSpec: GameSpec = {
	title: "Test Game",
	genre: "dodge",
	theme: "space",
	playerGoal: "dodge",
	controls: ["ArrowLeft"],
	entities: [{ name: "player", role: "player" }],
	coreLoop: "dodge things",
	winCondition: "survive",
	loseCondition: "hit",
	scoreRule: "+1",
	visualStyle: "neon",
	acceptanceTests: ["works"],
};

const passingRuntime: RuntimeEvalResult = {
	pass: true,
	errors: [],
	readySeen: true,
	snapshot: { tick: 10 },
};

const failingRuntime: RuntimeEvalResult = {
	pass: false,
	errors: ["INIT_ERROR: boom"],
	readySeen: false,
	snapshot: null,
};

const passingInteraction: InteractionEvalResult = {
	pass: true,
	durationMs: 12000,
	framesObserved: 720,
	stateChanged: true,
	scoreChanged: true,
	crashed: false,
};

const perfectJudge: JudgeEvalResult = {
	genreMatch: 5,
	mechanicMatch: 5,
	goalMatch: 5,
	controlsMatch: 5,
	coherence: 5,
	summary: "Perfect game",
	criticalMisses: [],
};

const mediocreJudge: JudgeEvalResult = {
	genreMatch: 3,
	mechanicMatch: 3,
	goalMatch: 3,
	controlsMatch: 3,
	coherence: 3,
	summary: "Mediocre game",
	criticalMisses: ["Some issues"],
};

describe("runAllEvals", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns score 0 when runtime fails (hard fail)", async () => {
		vi.mocked(runRuntimeEval).mockResolvedValue(failingRuntime);

		const result = await runAllEvals("key", "test", mockSpec, "code", "<html>");
		expect(result.summaryScore).toBe(0);
		expect(result.runtime.pass).toBe(false);
		expect(result.interaction.pass).toBe(false);
		expect(result.judge.genreMatch).toBe(1);
	});

	it("skips interaction and judge evals when runtime fails", async () => {
		vi.mocked(runRuntimeEval).mockResolvedValue(failingRuntime);

		await runAllEvals("key", "test", mockSpec, "code", "<html>");
		expect(runInteractionEval).not.toHaveBeenCalled();
		expect(runJudgeEval).not.toHaveBeenCalled();
	});

	it("computes perfect score of 100", async () => {
		vi.mocked(runRuntimeEval).mockResolvedValue(passingRuntime);
		vi.mocked(runInteractionEval).mockResolvedValue(passingInteraction);
		vi.mocked(runJudgeEval).mockResolvedValue(perfectJudge);

		const result = await runAllEvals("key", "test", mockSpec, "code", "<html>");
		// 35 (runtime) + 35 (interaction) + 30 (judge: 5/5 * 30) = 100
		expect(result.summaryScore).toBe(100);
	});

	it("computes mediocre score correctly", async () => {
		vi.mocked(runRuntimeEval).mockResolvedValue(passingRuntime);
		vi.mocked(runInteractionEval).mockResolvedValue(passingInteraction);
		vi.mocked(runJudgeEval).mockResolvedValue(mediocreJudge);

		const result = await runAllEvals("key", "test", mockSpec, "code", "<html>");
		// 35 + 35 + round((3/5) * 30) = 35 + 35 + 18 = 88
		expect(result.summaryScore).toBe(88);
	});

	it("scores 35 when only runtime passes", async () => {
		vi.mocked(runRuntimeEval).mockResolvedValue(passingRuntime);
		vi.mocked(runInteractionEval).mockResolvedValue({
			...passingInteraction,
			pass: false,
		});
		vi.mocked(runJudgeEval).mockResolvedValue({
			...perfectJudge,
			genreMatch: 1,
			mechanicMatch: 1,
			goalMatch: 1,
			controlsMatch: 1,
			coherence: 1,
		});

		const result = await runAllEvals("key", "test", mockSpec, "code", "<html>");
		// 35 + 0 + round((1/5) * 30) = 35 + 0 + 6 = 41
		expect(result.summaryScore).toBe(41);
	});
});
