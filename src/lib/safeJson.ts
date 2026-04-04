import type { ZodType } from "zod";

export function safeParseJson<T>(
	value: string | null | undefined,
	schema: ZodType<T>,
): T | null {
	if (!value) {
		return null;
	}

	try {
		const parsed = JSON.parse(value);
		const result = schema.safeParse(parsed);
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}
