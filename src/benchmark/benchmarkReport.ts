export interface BenchmarkCaseResult {
	id: string;
	prompt: string;
	focus: string;
	score?: number;
	artifactPass?: boolean;
	robloxPass?: boolean;
	judgeScore?: number;
	sessionId?: string;
	error?: string;
}

export function calculateBenchmarkSummary(caseResults: BenchmarkCaseResult[]) {
	if (caseResults.length === 0) {
		return {
			averageScore: 0,
			passRate: 0,
		};
	}

	const averageScore = Math.round(
		caseResults.reduce((sum, result) => sum + (result.score ?? 0), 0) /
			caseResults.length,
	);
	const passRate = Number(
		(
			caseResults.filter((result) => result.robloxPass && result.artifactPass)
				.length / caseResults.length
		).toFixed(2),
	);

	return {
		averageScore,
		passRate,
	};
}
