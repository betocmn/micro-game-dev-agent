import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type BenchmarkCaseResult,
	calculateBenchmarkSummary,
} from "@/benchmark/benchmarkReport";
import dataset from "@/evals/datasets/roblox-social-v1.json";
import { ensureLocalEnvLoaded } from "@/lib/loadEnv";
import type { RobloxEvalSuiteResult } from "@/types";
import { generateRobloxRun } from "@/worker/harness";

ensureLocalEnvLoaded();

interface BenchmarkReport {
	generatedAt: string;
	harnessVersion: string;
	evalProfile: string;
	averageScore: number;
	passRate: number;
	cases: BenchmarkCaseResult[];
	previousAverageScore?: number;
	scoreDelta?: number;
}

const BENCHMARK_DIR = path.join(process.cwd(), ".context/benchmarks");

function getJudgeScore(judge: RobloxEvalSuiteResult["judge"]) {
	const average =
		(judge.robloxFit +
			judge.promptFidelity +
			judge.socialLoopQuality +
			judge.clarity) /
		4;
	return Math.round((average / 5) * 100);
}

async function readPreviousBenchmark(
	evalProfile: string,
): Promise<BenchmarkReport | null> {
	try {
		const files = await readdir(BENCHMARK_DIR);
		const candidates = files
			.filter((file) => file.endsWith(".json"))
			.sort()
			.reverse();

		for (const file of candidates) {
			const fullPath = path.join(BENCHMARK_DIR, file);
			const report = JSON.parse(
				await readFile(fullPath, "utf8"),
			) as BenchmarkReport;
			if (report.evalProfile === evalProfile) {
				return report;
			}
		}
	} catch {
		return null;
	}

	return null;
}

async function main() {
	if (!process.env.ANTHROPIC_API_KEY) {
		throw new Error("ANTHROPIC_API_KEY must be set before running benchmarks.");
	}

	await mkdir(BENCHMARK_DIR, { recursive: true });

	const caseResults: BenchmarkCaseResult[] = [];
	for (const [index, benchmarkCase] of dataset.cases.entries()) {
		try {
			const result = await generateRobloxRun({
				generationId: `benchmark-${Date.now()}-${index}-${benchmarkCase.id}`,
				prompt: benchmarkCase.prompt,
			});
			caseResults.push({
				id: benchmarkCase.id,
				prompt: benchmarkCase.prompt,
				focus: benchmarkCase.focus,
				score: result.evalSuite.summaryScore,
				artifactPass: result.evalSuite.artifact.pass,
				robloxPass: result.evalSuite.roblox.pass,
				judgeScore: getJudgeScore(result.evalSuite.judge),
				sessionId: result.agentRun.sessionId,
			});
		} catch (error) {
			caseResults.push({
				id: benchmarkCase.id,
				prompt: benchmarkCase.prompt,
				focus: benchmarkCase.focus,
				error:
					error instanceof Error ? error.message : "Unknown benchmark failure",
			});
		}
	}

	const { averageScore, passRate } = calculateBenchmarkSummary(caseResults);

	const previousReport = await readPreviousBenchmark(dataset.evalProfile);
	const report: BenchmarkReport = {
		generatedAt: new Date().toISOString(),
		harnessVersion: dataset.harnessVersion,
		evalProfile: dataset.evalProfile,
		averageScore,
		passRate,
		cases: caseResults,
		previousAverageScore: previousReport?.averageScore,
		scoreDelta:
			previousReport !== null
				? averageScore - previousReport.averageScore
				: undefined,
	};

	const filename = `${report.generatedAt.replaceAll(":", "-")}-${
		dataset.evalProfile
	}.json`;
	const targetPath = path.join(BENCHMARK_DIR, filename);
	await writeFile(targetPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

	console.log(`Benchmark written to ${targetPath}`);
	console.log(
		`Average score ${report.averageScore} | pass rate ${Math.round(
			report.passRate * 100,
		)}%`,
	);
	if (report.scoreDelta !== undefined) {
		const deltaPrefix = report.scoreDelta >= 0 ? "+" : "";
		console.log(
			`Delta vs previous ${report.evalProfile}: ${deltaPrefix}${report.scoreDelta}`,
		);
	}
}

void main();
