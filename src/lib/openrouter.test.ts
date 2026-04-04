import { describe, expect, it } from "vitest";
import { extractJSON } from "./openrouter";

describe("extractJSON", () => {
	it("extracts JSON from markdown code fence", () => {
		const input = '```json\n{"title": "Space Dodge"}\n```';
		expect(extractJSON(input)).toBe('{"title": "Space Dodge"}');
	});

	it("extracts JSON from plain code fence", () => {
		const input = '```\n{"title": "test"}\n```';
		expect(extractJSON(input)).toBe('{"title": "test"}');
	});

	it("returns trimmed text when no fences present", () => {
		const input = '  {"title": "test"}  ';
		expect(extractJSON(input)).toBe('{"title": "test"}');
	});

	it("handles multiline JSON inside fences", () => {
		const input =
			'```json\n{\n  "title": "Space Dodge",\n  "genre": "dodge"\n}\n```';
		const result = extractJSON(input);
		const parsed = JSON.parse(result);
		expect(parsed.title).toBe("Space Dodge");
		expect(parsed.genre).toBe("dodge");
	});

	it("handles text before and after fences", () => {
		const input = 'Here is the JSON:\n```json\n{"title": "test"}\n```\nDone!';
		expect(extractJSON(input)).toBe('{"title": "test"}');
	});
});
