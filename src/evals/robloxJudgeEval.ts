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

function getResultMessage(messages: SDKMessage[]): SDKResultMessage {
	const result = messages.find(
		(message): message is SDKResultMessage => message.type === "result",
	);

	if (!result) {
		throw new Error("Claude judge did not return a result message.");
	}

	return result;
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

	for await (const message of query({
		prompt: judgePrompt,
		options: {
			cwd: process.cwd(),
			env: {
				...process.env,
				ANTHROPIC_API_KEY: apiKey,
				CLAUDE_AGENT_SDK_CLIENT_APP: "caracas-v4/0.1.0",
			},
			maxTurns: 3,
			model: "claude-sonnet-4-5",
			outputFormat: {
				type: "json_schema",
				schema: robloxJudgeJsonSchema,
			},
			permissionMode: "plan",
			settingSources: ["project"],
			systemPrompt: {
				type: "preset",
				preset: "claude_code",
				append:
					"Return a concise structured evaluation for Roblox scaffold quality only.",
			},
			tools: [],
		},
	})) {
		responseMessages.push(message);
	}

	const result = getResultMessage(responseMessages);
	if (result.subtype !== "success") {
		throw new Error(result.errors.join("; "));
	}

	return robloxJudgeEvalResultSchema.parse(result.structured_output);
}
