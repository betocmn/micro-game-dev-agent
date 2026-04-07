import path from "node:path";
import { assertValidRunId } from "./runId";

export function resolveRunDir(rootDir: string, generationId: string): string {
	const safeGenerationId = assertValidRunId(generationId);
	const runDir = path.resolve(rootDir, safeGenerationId);
	const relativeRunDir = path.relative(path.resolve(rootDir), runDir);

	if (
		relativeRunDir.length === 0 ||
		relativeRunDir.startsWith("..") ||
		path.isAbsolute(relativeRunDir)
	) {
		throw new Error("generationId must resolve inside the runs directory.");
	}

	return runDir;
}

export function isPathWithinDirectory(
	rootDir: string,
	candidatePath: string,
): boolean {
	const relativePath = path.relative(
		path.resolve(rootDir),
		path.resolve(candidatePath),
	);

	return (
		relativePath.length === 0 ||
		(!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
	);
}
