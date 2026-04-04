import type {
	ArtifactBundle,
	RobloxEvalSuiteResult,
	RobloxGameSpec,
} from "@/types";
import { runArtifactEval } from "./artifactEval";
import { runRobloxEval } from "./robloxEval";
import { runRobloxJudgeEval } from "./robloxJudgeEval";

function getJudgeScore(result: RobloxEvalSuiteResult["judge"]): number {
	const judgeAverage =
		(result.robloxFit +
			result.promptFidelity +
			result.socialLoopQuality +
			result.clarity) /
		4;

	return Math.round((judgeAverage / 5) * 40);
}

export async function runRobloxEvals(
	apiKey: string,
	prompt: string,
	spec: RobloxGameSpec,
	artifactBundle: ArtifactBundle,
	expectedScaffoldChecksum: string,
): Promise<RobloxEvalSuiteResult> {
	const artifact = await runArtifactEval(
		artifactBundle,
		expectedScaffoldChecksum,
	);
	const roblox = await runRobloxEval(prompt, spec, artifactBundle);
	const judge = await runRobloxJudgeEval(
		apiKey,
		prompt,
		spec,
		artifactBundle,
		roblox,
	);
	const summaryScore =
		(artifact.pass ? 30 : 0) + (roblox.pass ? 30 : 0) + getJudgeScore(judge);

	return {
		artifact,
		roblox,
		judge,
		summaryScore,
	};
}
