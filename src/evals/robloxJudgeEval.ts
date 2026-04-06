import {
	query,
	type SDKMessage,
	type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { robloxJudgeEvalResultSchema } from "@/lib/schemas";
import type {
	ArtifactBundle,
	RobloxEvalResult,
	RobloxGameSpec,
	RobloxJudgeEvalResult,
} from "@/types";
import { robloxJudgeJsonSchema } from "@/worker/jsonSchemas";

const SDK_CLIENT_APP = "caracas-v4/0.1.0";
const JUDGE_TIMEOUT_MS = 20000;

function getResultMessage(messages: SDKMessage[]): SDKResultMessage {
	const result = messages.find(
		(message): message is SDKResultMessage => message.type === "result",
	);

	if (!result) {
		throw new Error("Claude judge did not return a result message.");
	}

	return result;
}

function scoreToRange(score: number): number {
	return Math.max(1, Math.min(5, Math.round(score)));
}

function getPromptMatchCount(prompt: string, content: string): number {
	const promptTokens = new Set(
		prompt
			.toLowerCase()
			.match(/[a-z0-9]+/g)
			?.filter((token) => token.length >= 4) ?? [],
	);

	return Array.from(promptTokens).filter((token) => content.includes(token))
		.length;
}

function createFallbackJudgeResult(
	error: unknown,
	prompt: string,
	spec: RobloxGameSpec,
	artifactBundle: ArtifactBundle,
	robloxEval: RobloxEvalResult,
): RobloxJudgeEvalResult {
	const bundleText = artifactBundle.files
		.map((file) => `${file.path}\n${file.content}`)
		.join("\n")
		.toLowerCase();
	const specText = JSON.stringify(spec).toLowerCase();
	const promptMatches = getPromptMatchCount(
		prompt,
		`${bundleText}\n${specText}\n${spec.title.toLowerCase()}`,
	);
	const socialSignalCount = robloxEval.socialSignals.length;
	const remoteSignalCount = robloxEval.remoteSignals.length;

	const robloxFit = scoreToRange(
		2 +
			(robloxEval.serverClientSplit ? 1 : 0) +
			(robloxEval.contractExportsPresent ? 1 : 0) +
			(remoteSignalCount > 0 ? 1 : 0) -
			(robloxEval.bannedApis.length > 0 ? 1 : 0),
	);
	const promptFidelity = scoreToRange(
		1 +
			(promptMatches >= 1 ? 1 : 0) +
			(promptMatches >= 2 ? 1 : 0) +
			(promptMatches >= 4 ? 1 : 0) +
			(spec.title.toLowerCase().includes(prompt.split(/\s+/)[0] ?? "") ? 1 : 0),
	);
	const socialLoopQuality = scoreToRange(
		1 +
			(socialSignalCount >= 1 ? 1 : 0) +
			(socialSignalCount >= 3 ? 1 : 0) +
			(spec.socialLoop.length > 40 ? 1 : 0) +
			(spec.progressionHook.length > 20 ? 1 : 0),
	);
	const clarity = scoreToRange(
		1 +
			(spec.acceptanceTests.length >= 2 ? 1 : 0) +
			(spec.clientFeedback.length >= 2 ? 1 : 0) +
			(spec.serverAuthoritativeRules.length >= 2 ? 1 : 0) +
			(artifactBundle.files.length >= 5 ? 1 : 0),
	);

	const criticalMisses: string[] = [];
	if (!robloxEval.serverClientSplit) {
		criticalMisses.push("Server/client split is incomplete.");
	}
	if (!robloxEval.contractExportsPresent) {
		criticalMisses.push("Mechanic contract exports are missing.");
	}
	if (robloxEval.bannedApis.length > 0) {
		criticalMisses.push(
			`Banned APIs found: ${robloxEval.bannedApis.join(", ")}`,
		);
	}
	if (socialSignalCount === 0) {
		criticalMisses.push("No strong social-loop signals were detected.");
	}

	const errorMessage = error instanceof Error ? error.message : String(error);

	return robloxJudgeEvalResultSchema.parse({
		robloxFit,
		promptFidelity,
		socialLoopQuality,
		clarity,
		summary:
			"Heuristic fallback judge used after Claude judge failure. Scores reflect proxy Roblox fit, prompt coverage, social-loop strength, and clarity.",
		criticalMisses: [
			...criticalMisses,
			`Claude judge fallback: ${errorMessage}`,
		],
	});
}

export async function runRobloxJudgeEval(
	apiKey: string,
	prompt: string,
	spec: RobloxGameSpec,
	artifactBundle: ArtifactBundle,
	robloxEval: RobloxEvalResult,
): Promise<RobloxJudgeEvalResult> {
	const responseMessages: SDKMessage[] = [];
	const judgePrompt = [
		"You are grading whether a generated Roblox scaffold matches a vague teen prompt.",
		"Score from 1 to 5 on Roblox fit, prompt fidelity, social loop quality, and clarity.",
		"Use the provided spec, artifact files, and proxy eval results.",
		`Original prompt: ${prompt}`,
		`Expanded spec:\n${JSON.stringify(spec, null, 2)}`,
		`Artifact bundle:\n${JSON.stringify(artifactBundle, null, 2)}`,
		`Proxy eval:\n${JSON.stringify(robloxEval, null, 2)}`,
	].join("\n\n");
	const abortController = new AbortController();
	const queryRun = query({
		prompt: judgePrompt,
		options: {
			abortController,
			cwd: process.cwd(),
			env: {
				...process.env,
				ANTHROPIC_API_KEY: apiKey,
				CLAUDE_AGENT_SDK_CLIENT_APP: SDK_CLIENT_APP,
			},
			maxTurns: 3,
			model: "claude-sonnet-4-5",
			outputFormat: {
				type: "json_schema",
				schema: robloxJudgeJsonSchema,
			},
			permissionMode: "plan",
			systemPrompt:
				"You evaluate Roblox scaffold artifacts. Return only the structured grade and do not ask follow-up questions.",
			tools: [],
		},
	});
	const timeout = setTimeout(() => {
		abortController.abort("Judge timed out");
	}, JUDGE_TIMEOUT_MS);

	try {
		for await (const message of queryRun) {
			responseMessages.push(message);
		}

		const result = getResultMessage(responseMessages);
		if (result.subtype !== "success") {
			throw new Error(result.errors.join("; ") || "Claude judge failed.");
		}

		return robloxJudgeEvalResultSchema.parse(result.structured_output);
	} catch (error) {
		return createFallbackJudgeResult(
			error,
			prompt,
			spec,
			artifactBundle,
			robloxEval,
		);
	} finally {
		clearTimeout(timeout);
		if (
			abortController.signal.aborted &&
			typeof (queryRun as { close?: () => void }).close === "function"
		) {
			(queryRun as { close: () => void }).close();
		}
	}
}
