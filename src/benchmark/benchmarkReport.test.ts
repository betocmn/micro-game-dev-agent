import { describe, expect, it } from "vitest";
import {
	calculateBenchmarkSummary,
	type BenchmarkCaseResult,
} from "./benchmarkReport";

describe("calculateBenchmarkSummary", () => {
	it("counts failed cases as zero-score non-passing runs", () => {
		const caseResults: BenchmarkCaseResult[] = [
			{
				id: "ok-1",
				prompt: "mall hang vibes",
				focus: "social loop",
				score: 80,
				artifactPass: true,
				robloxPass: true,
			},
			{
				id: "failed-1",
				prompt: "quote party",
				focus: "reliability",
				error: "worker crashed",
			},
			{
				id: "ok-2",
				prompt: "cafe drama",
				focus: "theme",
				score: 40,
				artifactPass: true,
				robloxPass: false,
			},
		];

		expect(calculateBenchmarkSummary(caseResults)).toEqual({
			averageScore: 40,
			passRate: 0.33,
		});
	});
});
