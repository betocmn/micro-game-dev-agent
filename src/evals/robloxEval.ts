import type { ArtifactBundle, RobloxEvalResult, RobloxGameSpec } from "@/types";
import { FORBIDDEN_LUA_PATTERNS } from "@/worker/constants";

const SOCIAL_SIGNAL_PATTERN =
	/(friend|party|social|hangout|shared|group|together|emote|trade|crew|squad|team)/g;

function getFileContent(bundle: ArtifactBundle, filePath: string): string {
	return bundle.files.find((file) => file.path === filePath)?.content ?? "";
}

function collectBannedApis(content: string): string[] {
	return FORBIDDEN_LUA_PATTERNS.filter((pattern) => content.includes(pattern));
}

export async function runRobloxEval(
	_prompt: string,
	_spec: RobloxGameSpec,
	artifactBundle: ArtifactBundle,
): Promise<RobloxEvalResult> {
	const serverCode = getFileContent(
		artifactBundle,
		"src/server/Mechanic.server.luau",
	);
	const clientCode = getFileContent(
		artifactBundle,
		"src/client/Mechanic.client.luau",
	);
	const contractCode = getFileContent(
		artifactBundle,
		"src/shared/MechanicContract.luau",
	);

	const bannedApis = [
		...collectBannedApis(serverCode),
		...collectBannedApis(clientCode),
	];
	const serverClientSplit =
		serverCode.includes("game:GetService") &&
		clientCode.includes("game:GetService") &&
		serverCode.includes("return") &&
		clientCode.includes("return");
	const contractExportsPresent =
		serverCode.includes("function MechanicServer.start") &&
		clientCode.includes("function MechanicClient.start") &&
		contractCode.includes("remoteEventName");

	const remoteSignals = [
		...["RemoteEvent", "FireAllClients", "FireClient", "FireServer"].filter(
			(signal) =>
				serverCode.includes(signal) ||
				clientCode.includes(signal) ||
				contractCode.includes(signal),
		),
	];

	const socialTokens = new Set(
		`${serverCode}\n${clientCode}`.toLowerCase().match(SOCIAL_SIGNAL_PATTERN) ?? [],
	);

	const socialSignals = Array.from(socialTokens);
	const notes: string[] = [];
	if (!serverClientSplit) {
		notes.push("Server/client split looks incomplete.");
	}
	if (bannedApis.length > 0) {
		notes.push(`Found banned APIs: ${bannedApis.join(", ")}`);
	}
	if (!contractExportsPresent) {
		notes.push("Contract exports are missing required start hooks.");
	}
	if (socialSignals.length === 0) {
		notes.push("No clear social-loop signals detected in the artifact.");
	}

	return {
		pass:
			serverClientSplit &&
			bannedApis.length === 0 &&
			contractExportsPresent &&
			socialSignals.length > 0,
		serverClientSplit,
		bannedApis,
		contractExportsPresent,
		remoteSignals,
		socialSignals,
		notes,
	};
}
