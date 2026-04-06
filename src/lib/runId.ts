import path from "node:path";

const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function isValidRunId(value: string): boolean {
	return (
		value.length > 0 &&
		value.length <= 128 &&
		!value.includes("/") &&
		!value.includes("\\") &&
		RUN_ID_PATTERN.test(value)
	);
}

export function assertValidRunId(value: string): string {
	if (!isValidRunId(value)) {
		throw new Error(
			"generationId must use only letters, numbers, dots, underscores, or hyphens.",
		);
	}

	return value;
}

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
