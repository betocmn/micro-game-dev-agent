import { describe, expect, it } from "vitest";
import { escapeLuauString } from "./fallback";

describe("escapeLuauString", () => {
	it("escapes quotes, backslashes, and newlines for Luau literals", () => {
		expect(escapeLuauString('Mall "Glow"\\Line\nNext')).toBe(
			'Mall \\"Glow\\"\\\\Line\\nNext',
		);
	});
});
