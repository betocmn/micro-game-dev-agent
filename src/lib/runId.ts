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
